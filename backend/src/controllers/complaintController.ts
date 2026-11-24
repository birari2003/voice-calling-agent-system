import type { NextFunction, Request, Response } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import {
  Complaint,
  ComplaintStatusHistory,
  Role,
  User,
  type ComplaintStatus,
} from '../models/index.js';
import { getSessionWithTranscript, SessionError } from '../services/sessionService.js';
import {
  addComplaintNote,
  archiveComplaint,
  assignComplaint,
  changeComplaintStatus,
  ComplaintInputError,
  createComplaint,
  findComplaintForUser,
  listComplaintsForUser,
  updateComplaintDetails,
  type ComplaintCreateInput,
} from '../services/complaintService.js';

const statusValues = [
  'registered',
  'acknowledged',
  'assigned',
  'in_progress',
  'resolved',
  'closed',
  'reopened',
] as const;
const priorityValues = ['low', 'normal', 'high', 'urgent'] as const;
const idSchema = z.coerce.number().int().positive();

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: z.enum(statusValues).optional(),
  category: z.string().trim().max(80).optional(),
  priority: z.enum(priorityValues).optional(),
  ward: z.string().trim().max(40).optional(),
  department: z.string().trim().max(120).optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  sortBy: z.enum(['ticketId', 'createdAt', 'status', 'priority']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const createSchema = z
  .object({
    citizenId: z.coerce.number().int().positive(),
    category: z.string().trim().min(2).max(80),
    description: z.string().trim().min(10).max(10000),
    locality: z.string().trim().min(2).max(160),
    ward: z.string().trim().max(40).nullable().optional(),
    landmark: z.string().trim().max(160).nullable().optional(),
    locationVerified: z.boolean().default(false),
    priority: z.enum(priorityValues).default('normal'),
    confirmed: z.literal(true),
  })
  .strict();

const patchSchema = z
  .object({
    category: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().min(10).max(10000).optional(),
    locality: z.string().trim().min(2).max(160).optional(),
    ward: z.string().trim().max(40).nullable().optional(),
    landmark: z.string().trim().max(160).nullable().optional(),
    locationVerified: z.boolean().optional(),
    priority: z.enum(priorityValues).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update.');

function organizationId(request: Request): number {
  return request.authUser!.organizationId;
}
function actorId(request: Request): number {
  return request.authUser!.id;
}
function canReadAll(request: Request): boolean {
  return request.authUser!.permissions.includes('complaints:read_all');
}
function canUpdateAll(request: Request): boolean {
  return request.authUser!.permissions.includes('complaints:update_all');
}

function publicComplaint(value: Complaint | Record<string, unknown>) {
  const plain = value instanceof Complaint ? value.get({ plain: true }) : { ...value };
  delete plain.idempotencyKey;
  delete plain.requestHash;
  return plain;
}

function sendDomainError(error: unknown, response: Response, next: NextFunction): void {
  if (error instanceof ComplaintInputError || error instanceof SessionError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  next(error);
}

export async function listComplaints(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = listSchema.safeParse(request.query);
  if (!parsed.success) {
    response
      .status(400)
      .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid complaint filters.' } });
    return;
  }
  try {
    const {
      page,
      limit,
      search,
      status,
      category,
      priority,
      ward,
      department,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
    } = parsed.data;
    const where: Record<string | symbol, unknown> = {};
    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;
    if (ward) where.ward = ward;
    if (department) where.assignedDepartment = { [Op.like]: `%${department}%` };
    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { [Op.gte]: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
        ...(dateTo ? { [Op.lte]: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
      };
    }
    const result = await listComplaintsForUser(
      organizationId(request),
      actorId(request),
      canReadAll(request),
      where,
      page,
      limit,
      sortBy,
      sortOrder.toUpperCase() as 'ASC' | 'DESC',
      search,
    );
    response.json({
      data: result.rows.map((complaint) => publicComplaint(complaint as Complaint)),
      pagination: { page, limit, total: result.count, pages: Math.ceil(result.count / limit) },
    });
  } catch (error) {
    next(error);
  }
}

export async function getComplaint(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const id = idSchema.safeParse(request.params.id);
  if (!id.success) {
    response
      .status(400)
      .json({ error: { code: 'VALIDATION_ERROR', message: 'Complaint ID is invalid.' } });
    return;
  }
  try {
    const complaint = await findComplaintForUser(
      id.data,
      organizationId(request),
      actorId(request),
      canReadAll(request),
    );
    if (!complaint) {
      response
        .status(404)
        .json({ error: { code: 'COMPLAINT_NOT_FOUND', message: 'Complaint was not found.' } });
      return;
    }
    response.json({ data: publicComplaint(complaint) });
  } catch (error) {
    next(error);
  }
}

export async function createComplaintHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = createSchema.safeParse(request.body);
  const idempotencyKey = request.header('Idempotency-Key')?.trim();
  if (
    !parsed.success ||
    !idempotencyKey ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 100
  ) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.success
          ? 'Provide an Idempotency-Key header between 8 and 100 characters.'
          : 'Complete all required fields and confirm the citizen accepted the complaint details.',
        details: parsed.success
          ? undefined
          : parsed.error.issues.map(({ path, message }) => `${path.join('.')}: ${message}`),
      },
    });
    return;
  }
  try {
    const result = await createComplaint(
      organizationId(request),
      actorId(request),
      idempotencyKey,
      parsed.data as ComplaintCreateInput,
    );
    response
      .status(result.created ? 201 : 200)
      .json({ data: publicComplaint(result.complaint), idempotentReplay: !result.created });
  } catch (error) {
    sendDomainError(error, response, next);
  }
}

async function loadWritableComplaint(request: Request, response: Response) {
  const id = idSchema.safeParse(request.params.id);
  if (!id.success) {
    response
      .status(400)
      .json({ error: { code: 'VALIDATION_ERROR', message: 'Complaint ID is invalid.' } });
    return null;
  }
  const complaint = await Complaint.findOne({
    where: { id: id.data, organizationId: organizationId(request), archivedAt: null },
  });
  if (!complaint || (!canUpdateAll(request) && complaint.assignedTo !== actorId(request))) {
    response
      .status(404)
      .json({ error: { code: 'COMPLAINT_NOT_FOUND', message: 'Complaint was not found.' } });
    return null;
  }
  return complaint;
}

export async function changeStatus(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = z
    .object({ toStatus: z.enum(statusValues), note: z.string().trim().max(500).optional() })
    .strict()
    .safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Choose a valid status and optional note.' },
    });
    return;
  }
  try {
    const complaint = await loadWritableComplaint(request, response);
    if (!complaint) return;
    const result = await changeComplaintStatus(
      complaint,
      actorId(request),
      parsed.data.toStatus as ComplaintStatus,
      parsed.data.note,
    );
    response.json({ data: publicComplaint(result) });
  } catch (error) {
    sendDomainError(error, response, next);
  }
}

export async function assign(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = z
    .object({
      assignedTo: z.coerce.number().int().positive().nullable(),
      department: z.string().trim().max(120).nullable().optional(),
    })
    .strict()
    .safeParse(request.body);
  if (!parsed.success) {
    response
      .status(400)
      .json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a valid staff assignment.' } });
    return;
  }
  try {
    const id = idSchema.safeParse(request.params.id);
    if (!id.success) {
      response
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Complaint ID is invalid.' } });
      return;
    }
    const complaint = await Complaint.findOne({
      where: { id: id.data, organizationId: organizationId(request), archivedAt: null },
    });
    if (!complaint) {
      response
        .status(404)
        .json({ error: { code: 'COMPLAINT_NOT_FOUND', message: 'Complaint was not found.' } });
      return;
    }
    const updated = await assignComplaint(
      complaint,
      actorId(request),
      organizationId(request),
      parsed.data.assignedTo,
      parsed.data.department ?? null,
    );
    response.json({ data: publicComplaint(updated) });
  } catch (error) {
    sendDomainError(error, response, next);
  }
}

export async function assignees(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const users = await User.findAll({
      where: { organizationId: organizationId(request), isActive: true },
      include: [{ model: Role, as: 'role', attributes: ['name'] }],
      attributes: ['id', 'name'],
      order: [['name', 'ASC']],
    });
    response.json({
      data: users
        .filter((user) => user.role?.name !== 'Auditor')
        .map((user) => ({ id: user.id, name: user.name, role: user.role?.name })),
    });
  } catch (error) {
    next(error);
  }
}

export async function addNote(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = z
    .object({ body: z.string().trim().min(1).max(5000) })
    .strict()
    .safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Enter an internal note up to 5,000 characters.',
      },
    });
    return;
  }
  try {
    const complaint = await loadWritableComplaint(request, response);
    if (!complaint) return;
    const note = await addComplaintNote(complaint, actorId(request), parsed.data.body);
    response.status(201).json({ data: note });
  } catch (error) {
    next(error);
  }
}

export async function updateDetails(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = patchSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Provide valid complaint details to update.' },
    });
    return;
  }
  try {
    const complaint = await loadWritableComplaint(request, response);
    if (!complaint) return;
    const updated = await updateComplaintDetails(complaint, actorId(request), parsed.data);
    response.json({ data: publicComplaint(updated) });
  } catch (error) {
    next(error);
  }
}

export async function statusHistory(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = idSchema.safeParse(request.params.id);
    if (!id.success) {
      response
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Complaint ID is invalid.' } });
      return;
    }
    const complaint = await Complaint.findOne({
      where: { id: id.data, organizationId: organizationId(request), archivedAt: null },
    });
    if (!complaint || (!canReadAll(request) && complaint.assignedTo !== actorId(request))) {
      response
        .status(404)
        .json({ error: { code: 'COMPLAINT_NOT_FOUND', message: 'Complaint was not found.' } });
      return;
    }
    const history = await ComplaintStatusHistory.findAll({
      where: { complaintId: complaint.id },
      include: [{ model: User, as: 'changedByUser', attributes: ['id', 'name'] }],
      order: [['changedAt', 'ASC']],
    });
    response.json({ data: history });
  } catch (error) {
    next(error);
  }
}

export async function archive(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = idSchema.safeParse(request.params.id);
    if (!id.success) {
      response
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Complaint ID is invalid.' } });
      return;
    }
    const complaint = await Complaint.findOne({
      where: { id: id.data, organizationId: organizationId(request), archivedAt: null },
    });
    if (!complaint) {
      response
        .status(404)
        .json({ error: { code: 'COMPLAINT_NOT_FOUND', message: 'Complaint was not found.' } });
      return;
    }
    await archiveComplaint(complaint, actorId(request));
    response.status(204).end();
  } catch (error) {
    next(error);
  }
}

/**
 * Transcript of the AI session that created a complaint. Available to anyone who can open the
 * complaint (including an assigned operator), without granting access to other sessions.
 */
export async function complaintTranscript(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const id = idSchema.safeParse(request.params.id);
  if (!id.success) {
    response
      .status(400)
      .json({ error: { code: 'VALIDATION_ERROR', message: 'Complaint ID is invalid.' } });
    return;
  }
  try {
    const complaint = await findComplaintForUser(
      id.data,
      organizationId(request),
      actorId(request),
      canReadAll(request),
    );
    if (!complaint) {
      response
        .status(404)
        .json({ error: { code: 'COMPLAINT_NOT_FOUND', message: 'Complaint was not found.' } });
      return;
    }
    if (!complaint.sourceSessionId) {
      response.status(404).json({
        error: { code: 'NO_TRANSCRIPT', message: 'This complaint was not created from a session.' },
      });
      return;
    }
    const session = await getSessionWithTranscript(
      organizationId(request),
      complaint.sourceSessionId,
    );
    response.json({
      data: {
        sessionId: session.id,
        mode: session.mode,
        channel: session.channel,
        language: session.language,
        startedAt: session.startedAt,
        hasRecording: false,
        messages: session.messages,
      },
    });
  } catch (error) {
    sendDomainError(error, response, next);
  }
}
