import { createHash, randomBytes } from 'node:crypto';
import { logger } from '../observability/logger.js';
import type { Transaction } from 'sequelize';
import { sequelize } from '../config/database.js';
import { env } from '../config/env.js';
import { Complaint, ComplaintAttachment, UploadToken, User } from '../models/index.js';
import type { AuthenticatedUser } from './authService.js';
import { fileStorage, newStorageKey } from '../storage/fileStorage.js';
import { IMAGE_TYPES, safeDisplayName, validateImage } from '../storage/imageValidation.js';
import { writeAuditLog } from './auditService.js';

export class AttachmentError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'AttachmentError';
  }
}

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

/** Same message for unknown, expired, revoked and used-up links, so links cannot be probed. */
function linkUnavailable(): AttachmentError {
  return new AttachmentError(
    'This upload link has expired or is no longer valid. Ask the municipal office for a new link.',
    410,
    'UPLOAD_LINK_UNAVAILABLE',
  );
}
const MAX_ACTIVE_LINKS_PER_COMPLAINT = 3;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Complaint the user may see: same organization, not archived, and assigned unless read_all. */
export async function findReadableComplaint(user: AuthenticatedUser, complaintId: number) {
  const complaint = await Complaint.findOne({
    where: { id: complaintId, organizationId: user.organizationId, archivedAt: null },
  });
  if (
    !complaint ||
    (!user.permissions.includes('complaints:read_all') && complaint.assignedTo !== user.id)
  )
    throw new AttachmentError('Complaint was not found.', 404, 'COMPLAINT_NOT_FOUND');
  return complaint;
}

/** Complaint the user may add photos to: assigned to them, or they can update all. */
export async function findWritableComplaint(user: AuthenticatedUser, complaintId: number) {
  const complaint = await findReadableComplaint(user, complaintId);
  if (!user.permissions.includes('complaints:update_all') && complaint.assignedTo !== user.id)
    throw new AttachmentError('Complaint was not found.', 404, 'COMPLAINT_NOT_FOUND');
  return complaint;
}

function linkStatus(link: UploadToken, now = new Date()) {
  if (link.revokedAt) return 'revoked' as const;
  if (link.expiresAt <= now) return 'expired' as const;
  if (link.uploadCount >= link.maxUploads) return 'used' as const;
  return 'active' as const;
}

/**
 * Validates and stores a photo, then records it. The file is written first and removed again
 * if the database write fails, so no record ever points at a missing file.
 */
async function storePhoto(
  complaint: Complaint,
  file: UploadedFile,
  origin: { source: 'dashboard' | 'upload_link'; userId: number | null; tokenId: number | null },
  transaction?: Transaction,
): Promise<ComplaintAttachment> {
  if (file.buffer.length > env.MAX_UPLOAD_SIZE_MB * 1024 * 1024)
    throw new AttachmentError(
      `Photos must be ${env.MAX_UPLOAD_SIZE_MB} MB or smaller.`,
      413,
      'FILE_TOO_LARGE',
    );
  const mimeType = validateImage(file.buffer, file.mimetype, file.originalname);
  const storageKey = newStorageKey(IMAGE_TYPES[mimeType].extension);
  await fileStorage.save(storageKey, file.buffer);
  try {
    return await ComplaintAttachment.create(
      {
        organizationId: complaint.organizationId,
        complaintId: complaint.id,
        uploadedByUserId: origin.userId,
        uploadTokenId: origin.tokenId,
        source: origin.source,
        originalFilename: safeDisplayName(file.originalname),
        storageKey,
        mimeType,
        fileSize: file.buffer.length,
        checksum: createHash('sha256').update(file.buffer).digest('hex'),
        createdAt: new Date(),
      },
      { transaction },
    );
  } catch (error) {
    await fileStorage.remove(storageKey).catch(() => logger.error('orphan upload cleanup failed'));
    throw error;
  }
}

export async function uploadFromDashboard(
  user: AuthenticatedUser,
  complaintId: number,
  file: UploadedFile,
) {
  const complaint = await findWritableComplaint(user, complaintId);
  const attachment = await storePhoto(complaint, file, {
    source: 'dashboard',
    userId: user.id,
    tokenId: null,
  });
  await writeAuditLog('attachment.uploaded', user.id, {
    complaintId: complaint.id,
    attachmentId: attachment.id,
  });
  return attachment;
}

export async function listAttachments(user: AuthenticatedUser, complaintId: number) {
  const complaint = await findReadableComplaint(user, complaintId);
  return ComplaintAttachment.findAll({
    where: { complaintId: complaint.id },
    attributes: { exclude: ['storageKey', 'organizationId'] },
    include: [{ model: User, as: 'uploader', attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC']],
  });
}

/** Loads an attachment for download after checking the user can see its complaint. */
export async function openAttachment(user: AuthenticatedUser, attachmentId: number) {
  const attachment = await ComplaintAttachment.findOne({
    where: { id: attachmentId, organizationId: user.organizationId },
  });
  if (!attachment) throw new AttachmentError('Photo was not found.', 404, 'ATTACHMENT_NOT_FOUND');
  try {
    await findReadableComplaint(user, attachment.complaintId);
  } catch {
    throw new AttachmentError('Photo was not found.', 404, 'ATTACHMENT_NOT_FOUND');
  }
  await writeAuditLog('attachment.viewed', user.id, { attachmentId: attachment.id });
  return { attachment, stream: fileStorage.read(attachment.storageKey) };
}

export async function createUploadLink(user: AuthenticatedUser, complaintId: number) {
  const complaint = await findWritableComplaint(user, complaintId);
  const links = await UploadToken.findAll({ where: { complaintId: complaint.id } });
  if (
    links.filter((link) => linkStatus(link) === 'active').length >= MAX_ACTIVE_LINKS_PER_COMPLAINT
  )
    throw new AttachmentError(
      `A complaint can have at most ${MAX_ACTIVE_LINKS_PER_COMPLAINT} active upload links. Revoke one first.`,
      409,
      'TOO_MANY_UPLOAD_LINKS',
    );
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const link = await UploadToken.create({
    organizationId: complaint.organizationId,
    complaintId: complaint.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + env.UPLOAD_LINK_TTL_HOURS * 60 * 60 * 1000),
    maxUploads: env.UPLOAD_LINK_MAX_UPLOADS,
    uploadCount: 0,
    revokedAt: null,
    revokedBy: null,
    createdBy: user.id,
    createdAt: now,
  });
  await writeAuditLog('upload_link.created', user.id, {
    complaintId: complaint.id,
    uploadLinkId: link.id,
  });
  return {
    id: link.id,
    // The token is returned once here and cannot be recovered later.
    url: `${env.APP_URL.replace(/\/$/, '')}/upload/${token}`,
    expiresAt: link.expiresAt,
    maxUploads: link.maxUploads,
  };
}

export async function listUploadLinks(user: AuthenticatedUser, complaintId: number) {
  const complaint = await findReadableComplaint(user, complaintId);
  const links = await UploadToken.findAll({
    where: { complaintId: complaint.id },
    attributes: { exclude: ['tokenHash', 'organizationId'] },
    include: [{ model: User, as: 'creator', attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC']],
  });
  return links.map((link) => ({ ...link.get({ plain: true }), status: linkStatus(link) }));
}

export async function revokeUploadLink(user: AuthenticatedUser, linkId: number) {
  const link = await UploadToken.findOne({
    where: { id: linkId, organizationId: user.organizationId },
  });
  if (!link) throw new AttachmentError('Upload link was not found.', 404, 'UPLOAD_LINK_NOT_FOUND');
  try {
    await findWritableComplaint(user, link.complaintId);
  } catch {
    throw new AttachmentError('Upload link was not found.', 404, 'UPLOAD_LINK_NOT_FOUND');
  }
  if (!link.revokedAt) {
    link.revokedAt = new Date();
    link.revokedBy = user.id;
    await link.save();
    await writeAuditLog('upload_link.revoked', user.id, { uploadLinkId: link.id });
  }
  return { ...link.get({ plain: true }), tokenHash: undefined, status: linkStatus(link) };
}

async function activeLinkForToken(token: string, transaction?: Transaction) {
  if (!TOKEN_PATTERN.test(token)) throw linkUnavailable();
  const link = await UploadToken.findOne({
    where: { tokenHash: hashToken(token) },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!link || linkStatus(link) !== 'active') throw linkUnavailable();
  const complaint = await Complaint.findOne({
    where: { id: link.complaintId, archivedAt: null },
    transaction,
  });
  if (!complaint) throw linkUnavailable();
  return { link, complaint };
}

/** Minimal, non-personal details for the public upload page. */
export async function describeUploadLink(token: string) {
  const { link, complaint } = await activeLinkForToken(token);
  return {
    ticketId: complaint.ticketId,
    remainingUploads: link.maxUploads - link.uploadCount,
    expiresAt: link.expiresAt,
    maxFileSizeMb: env.MAX_UPLOAD_SIZE_MB,
  };
}

export async function uploadWithToken(token: string, file: UploadedFile) {
  // Cheap checks before touching the file, so invalid links never cause writes.
  await activeLinkForToken(token);
  let storedKey: string | null = null;
  let attachment: { created: ComplaintAttachment; link: UploadToken };
  try {
    attachment = await sequelize.transaction(async (transaction) => {
      // Re-check under a row lock so concurrent uploads cannot exceed the limit.
      const { link, complaint } = await activeLinkForToken(token, transaction);
      const created = await storePhoto(
        complaint,
        file,
        { source: 'upload_link', userId: null, tokenId: link.id },
        transaction,
      );
      storedKey = created.storageKey;
      link.uploadCount += 1;
      await link.save({ transaction });
      return { created, link };
    });
  } catch (error) {
    // The record was rolled back, so the stored file must go too.
    if (storedKey)
      await fileStorage.remove(storedKey).catch(() => logger.error('orphan upload cleanup failed'));
    throw error;
  }
  await writeAuditLog('attachment.uploaded_via_link', null, {
    complaintId: attachment.created.complaintId,
    attachmentId: attachment.created.id,
    uploadLinkId: attachment.link.id,
  });
  return {
    remainingUploads: attachment.link.maxUploads - attachment.link.uploadCount,
  };
}
