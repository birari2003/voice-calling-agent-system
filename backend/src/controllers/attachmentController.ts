import type { NextFunction, Request, Response } from 'express';
import { logger } from '../observability/logger.js';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../config/env.js';
import {
  AttachmentError,
  createUploadLink,
  describeUploadLink,
  listAttachments,
  listUploadLinks,
  openAttachment,
  revokeUploadLink,
  uploadFromDashboard,
  uploadWithToken,
} from '../services/attachmentService.js';
import { UploadValidationError } from '../storage/imageValidation.js';

const idSchema = z.coerce.number().int().positive();

/** One photo per request, held in memory only until it is validated and stored. */
export const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024, files: 1, fields: 2, parts: 3 },
}).single('photo');

function sendError(error: unknown, response: Response, next: NextFunction): void {
  if (error instanceof AttachmentError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof UploadValidationError) {
    response.status(415).json({ error: { code: error.code, message: error.message } });
    return;
  }
  next(error);
}

function parseId(request: Request, response: Response, name = 'id'): number | null {
  const parsed = idSchema.safeParse(request.params[name]);
  if (parsed.success) return parsed.data;
  response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'ID is invalid.' } });
  return null;
}

function requireFile(request: Request, response: Response): Express.Multer.File | null {
  if (request.file) return request.file;
  response.status(400).json({
    error: { code: 'PHOTO_REQUIRED', message: 'Choose a JPG, PNG or WebP photo to upload.' },
  });
  return null;
}

export async function uploadPhotoHandler(request: Request, response: Response, next: NextFunction) {
  const complaintId = parseId(request, response);
  if (!complaintId) return;
  const file = requireFile(request, response);
  if (!file) return;
  try {
    const attachment = await uploadFromDashboard(request.authUser!, complaintId, file);
    const plain = attachment.get({ plain: true }) as Record<string, unknown>;
    delete plain.storageKey;
    delete plain.organizationId;
    response.status(201).json({ data: plain });
  } catch (error) {
    sendError(error, response, next);
  }
}

export async function listPhotosHandler(request: Request, response: Response, next: NextFunction) {
  const complaintId = parseId(request, response);
  if (!complaintId) return;
  try {
    response.json({ data: await listAttachments(request.authUser!, complaintId) });
  } catch (error) {
    sendError(error, response, next);
  }
}

export async function downloadHandler(request: Request, response: Response, next: NextFunction) {
  const attachmentId = parseId(request, response);
  if (!attachmentId) return;
  try {
    const { attachment, stream } = await openAttachment(request.authUser!, attachmentId);
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Content-Length', String(attachment.fileSize));
    response.setHeader(
      'Content-Disposition',
      `inline; filename="photo-${attachment.id}"; filename*=UTF-8''${encodeURIComponent(attachment.originalFilename)}`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    // Even if opened directly, the response can never run script.
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    stream.on('error', () => {
      logger.error('attachment file could not be read', {
        attachmentId: attachment.id,
        requestId: request.requestId,
      });
      if (!response.headersSent)
        response
          .status(404)
          .json({ error: { code: 'ATTACHMENT_MISSING', message: 'The photo file is missing.' } });
      else response.destroy();
    });
    stream.pipe(response);
  } catch (error) {
    sendError(error, response, next);
  }
}

export async function createLinkHandler(request: Request, response: Response, next: NextFunction) {
  const complaintId = parseId(request, response);
  if (!complaintId) return;
  try {
    response.status(201).json({ data: await createUploadLink(request.authUser!, complaintId) });
  } catch (error) {
    sendError(error, response, next);
  }
}

export async function listLinksHandler(request: Request, response: Response, next: NextFunction) {
  const complaintId = parseId(request, response);
  if (!complaintId) return;
  try {
    response.json({ data: await listUploadLinks(request.authUser!, complaintId) });
  } catch (error) {
    sendError(error, response, next);
  }
}

export async function revokeLinkHandler(request: Request, response: Response, next: NextFunction) {
  const linkId = parseId(request, response);
  if (!linkId) return;
  try {
    response.json({ data: await revokeUploadLink(request.authUser!, linkId) });
  } catch (error) {
    sendError(error, response, next);
  }
}

export async function publicLinkInfoHandler(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  try {
    response.setHeader('Cache-Control', 'no-store');
    response.json({ data: await describeUploadLink(String(request.params.token)) });
  } catch (error) {
    sendError(error, response, next);
  }
}

export async function publicUploadHandler(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const file = requireFile(request, response);
  if (!file) return;
  try {
    response.status(201).json({ data: await uploadWithToken(String(request.params.token), file) });
  } catch (error) {
    sendError(error, response, next);
  }
}
