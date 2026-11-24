import { createHash, randomBytes } from 'node:crypto';
import { describeError, logger } from '../observability/logger.js';
import { Op, type Transaction } from 'sequelize';
import { sequelize } from '../config/database.js';
import {
  Citizen,
  Complaint,
  ComplaintNote,
  ComplaintStatusHistory,
  Role,
  User,
  type ComplaintStatus,
} from '../models/index.js';
import { writeAuditLog } from './auditService.js';

export interface ComplaintCreateInput {
  citizenId: number;
  category: string;
  description: string;
  locality: string;
  ward?: string | null;
  landmark?: string | null;
  locationVerified?: boolean;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  confirmed: true;
}

export class ComplaintInputError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = 'VALIDATION_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'ComplaintInputError';
  }
}

export const transitions: Record<ComplaintStatus, ComplaintStatus[]> = {
  registered: ['acknowledged', 'assigned', 'in_progress'],
  acknowledged: ['assigned', 'in_progress'],
  assigned: ['in_progress', 'reopened'],
  in_progress: ['resolved', 'reopened'],
  resolved: ['closed', 'reopened'],
  closed: ['reopened'],
  reopened: ['assigned', 'in_progress'],
};

function requestHash(input: ComplaintCreateInput): string {
  const canonical = {
    citizenId: input.citizenId,
    category: input.category.trim(),
    description: input.description.trim(),
    locality: input.locality.trim(),
    ward: input.ward?.trim() || null,
    landmark: input.landmark?.trim() || null,
    locationVerified: input.locationVerified ?? false,
    priority: input.priority ?? 'normal',
    confirmed: input.confirmed,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function createTicketId(now: Date): string {
  return `NS-${now.getFullYear()}-${randomBytes(5).toString('hex').toUpperCase()}`;
}

/** Where a complaint came from. Session-created complaints keep a link to their transcript. */
export interface ComplaintOrigin {
  source: 'staff' | 'simulated_ai';
  sourceSessionId: string | null;
  historyNote: string;
}

const STAFF_ORIGIN: ComplaintOrigin = {
  source: 'staff',
  sourceSessionId: null,
  historyNote: 'Complaint registered after staff recorded citizen confirmation.',
};

/**
 * The single guarded path for creating complaints. Pass `outerTransaction` to make complaint
 * creation part of a larger atomic write (used by AI sessions).
 */
export async function createComplaint(
  organizationId: number,
  actorId: number,
  idempotencyKey: string,
  input: ComplaintCreateInput,
  origin: ComplaintOrigin = STAFF_ORIGIN,
  outerTransaction?: Transaction,
) {
  if (input.confirmed !== true)
    throw new ComplaintInputError(
      'Complaint creation requires explicit citizen confirmation.',
      400,
      'CONFIRMATION_REQUIRED',
    );
  const hash = requestHash(input);
  const run = async (transaction: Transaction) => {
    const existing = await Complaint.findOne({
      where: { organizationId, idempotencyKey },
      transaction,
    });
    if (existing) {
      if (existing.requestHash !== hash) {
        throw new ComplaintInputError(
          'This idempotency key was already used with different complaint details.',
          409,
          'IDEMPOTENCY_CONFLICT',
        );
      }
      return { complaint: existing, created: false };
    }
    const citizen = await Citizen.findOne({
      where: { id: input.citizenId, organizationId },
      transaction,
    });
    if (!citizen)
      throw new ComplaintInputError(
        'Select a citizen in your organization.',
        400,
        'CITIZEN_NOT_FOUND',
      );
    const now = new Date();
    const complaint = await Complaint.create(
      {
        ticketId: createTicketId(now),
        organizationId,
        citizenId: citizen.id,
        category: input.category.trim(),
        description: input.description.trim(),
        locality: input.locality.trim(),
        ward: input.ward?.trim() || null,
        landmark: input.landmark?.trim() || null,
        locationVerified: input.locationVerified ?? false,
        priority: input.priority ?? 'normal',
        status: 'registered',
        assignedTo: null,
        assignedDepartment: null,
        source: origin.source,
        sourceSessionId: origin.sourceSessionId,
        citizenConfirmed: true,
        citizenConfirmedAt: now,
        idempotencyKey,
        requestHash: hash,
        createdBy: actorId,
        archivedAt: null,
      },
      { transaction },
    );
    await ComplaintStatusHistory.create(
      {
        complaintId: complaint.id,
        fromStatus: null,
        toStatus: 'registered',
        changedBy: actorId,
        note: origin.historyNote,
        changedAt: now,
      },
      { transaction },
    );
    return { complaint, created: true };
  };
  const result = outerTransaction ? await run(outerTransaction) : await sequelize.transaction(run);
  if (result.created) {
    const audit = () =>
      writeAuditLog('complaint.created', actorId, {
        complaintId: result.complaint.id,
        source: origin.source,
        sessionId: origin.sourceSessionId,
      });
    if (outerTransaction)
      outerTransaction.afterCommit(() =>
        audit().catch((error: unknown) =>
          logger.error('audit log write failed', {
            action: 'complaint.created',
            ...describeError(error, false),
          }),
        ),
      );
    else await audit();
  }
  return result;
}

export async function findComplaintForUser(
  complaintId: number,
  organizationId: number,
  userId: number,
  canReadAll: boolean,
) {
  const complaint = await Complaint.findOne({
    where: { id: complaintId, organizationId, archivedAt: null },
    include: [
      { model: Citizen, as: 'citizen' },
      { model: User, as: 'assignedUser', attributes: ['id', 'name'] },
      { model: User, as: 'creator', attributes: ['id', 'name'] },
      {
        model: ComplaintStatusHistory,
        as: 'statusHistory',
        include: [{ model: User, as: 'changedByUser', attributes: ['id', 'name'] }],
      },
      {
        model: ComplaintNote,
        as: 'notes',
        include: [{ model: User, as: 'author', attributes: ['id', 'name'] }],
      },
    ],
    order: [
      [{ model: ComplaintStatusHistory, as: 'statusHistory' }, 'changedAt', 'ASC'],
      [{ model: ComplaintNote, as: 'notes' }, 'createdAt', 'ASC'],
    ],
  });
  if (!complaint || (!canReadAll && complaint.assignedTo !== userId)) return null;
  return complaint;
}

export async function listComplaintsForUser(
  organizationId: number,
  userId: number,
  canReadAll: boolean,
  where: Record<string | symbol, unknown>,
  page: number,
  limit: number,
  sortBy: 'ticketId' | 'createdAt' | 'status' | 'priority',
  sortOrder: 'ASC' | 'DESC',
  search?: string,
) {
  const filters: Record<string | symbol, unknown> = { ...where, organizationId, archivedAt: null };
  if (!canReadAll) filters.assignedTo = userId;
  if (search) {
    const citizenMatches = await Citizen.findAll({
      where: {
        organizationId,
        [Op.or]: [
          { fullName: { [Op.like]: `%${search}%` } },
          { phone: { [Op.like]: `%${search}%` } },
        ],
      },
      attributes: ['id'],
    });
    filters[Op.or] = [
      { ticketId: { [Op.like]: `%${search}%` } },
      { category: { [Op.like]: `%${search}%` } },
      { description: { [Op.like]: `%${search}%` } },
      { locality: { [Op.like]: `%${search}%` } },
      { ward: { [Op.like]: `%${search}%` } },
      { citizenId: { [Op.in]: citizenMatches.map(({ id }) => id) } },
    ];
  }
  return Complaint.findAndCountAll({
    where: filters,
    include: [
      {
        model: Citizen,
        as: 'citizen',
        attributes: ['id', 'fullName', 'phone', 'locality', 'ward'],
      },
      { model: User, as: 'assignedUser', attributes: ['id', 'name'] },
    ],
    distinct: true,
    limit,
    offset: (page - 1) * limit,
    order: [[sortBy, sortOrder]],
  });
}

export async function changeComplaintStatus(
  complaint: Complaint,
  actorId: number,
  toStatus: ComplaintStatus,
  note?: string,
): Promise<Complaint> {
  if (!transitions[complaint.status].includes(toStatus)) {
    throw new ComplaintInputError(
      `Status cannot move from ${complaint.status} to ${toStatus}.`,
      409,
      'INVALID_STATUS_TRANSITION',
    );
  }
  const previous = complaint.status;
  const now = new Date();
  await sequelize.transaction(async (transaction) => {
    complaint.status = toStatus;
    await complaint.save({ transaction });
    await ComplaintStatusHistory.create(
      {
        complaintId: complaint.id,
        fromStatus: previous,
        toStatus,
        changedBy: actorId,
        note: note?.trim() || null,
        changedAt: now,
      },
      { transaction },
    );
  });
  await writeAuditLog('complaint.status_changed', actorId, {
    complaintId: complaint.id,
    from: previous,
    to: toStatus,
  });
  return complaint;
}

export async function assignComplaint(
  complaint: Complaint,
  actorId: number,
  organizationId: number,
  assignedTo: number | null,
  department: string | null,
) {
  if (assignedTo !== null) {
    const user = await User.findOne({
      where: { id: assignedTo, organizationId, isActive: true },
      include: [{ model: Role, as: 'role', attributes: ['name'] }],
    });
    if (!user)
      throw new ComplaintInputError(
        'Select an active staff member in your organization.',
        400,
        'ASSIGNEE_INVALID',
      );
    if (user.role?.name === 'Auditor')
      throw new ComplaintInputError(
        'Auditors cannot be assigned complaints.',
        400,
        'ASSIGNEE_INVALID',
      );
  }
  const oldAssignee = complaint.assignedTo;
  await sequelize.transaction(async (transaction) => {
    complaint.assignedTo = assignedTo;
    complaint.assignedDepartment = department?.trim() || null;
    if (assignedTo !== null && ['registered', 'acknowledged'].includes(complaint.status)) {
      const previous = complaint.status;
      complaint.status = 'assigned';
      await complaint.save({ transaction });
      await ComplaintStatusHistory.create(
        {
          complaintId: complaint.id,
          fromStatus: previous,
          toStatus: 'assigned',
          changedBy: actorId,
          note: department ? `Assigned to ${department.trim()}.` : 'Complaint assigned to staff.',
          changedAt: new Date(),
        },
        { transaction },
      );
    } else {
      await complaint.save({ transaction });
    }
  });
  await writeAuditLog('complaint.assigned', actorId, {
    complaintId: complaint.id,
    previousAssigneeId: oldAssignee,
    assignedTo,
    department: department?.trim() || null,
  });
  return complaint;
}

export async function addComplaintNote(complaint: Complaint, authorId: number, body: string) {
  const note = await ComplaintNote.create({
    complaintId: complaint.id,
    authorId,
    body: body.trim(),
    createdAt: new Date(),
  });
  await writeAuditLog('complaint.note_added', authorId, {
    complaintId: complaint.id,
    noteId: note.id,
  });
  return note;
}

export async function updateComplaintDetails(
  complaint: Complaint,
  actorId: number,
  input: {
    category?: string;
    description?: string;
    locality?: string;
    ward?: string | null;
    landmark?: string | null;
    locationVerified?: boolean;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  },
) {
  Object.assign(complaint, input);
  await complaint.save();
  await writeAuditLog('complaint.updated', actorId, { complaintId: complaint.id });
  return complaint;
}

export async function archiveComplaint(complaint: Complaint, actorId: number): Promise<void> {
  complaint.archivedAt = new Date();
  await complaint.save();
  await writeAuditLog('complaint.archived', actorId, { complaintId: complaint.id });
}
