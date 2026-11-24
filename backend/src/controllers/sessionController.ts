import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { LANGUAGES, TERMINAL_STATES } from '../ai/types.js';
import { CallSession } from '../models/index.js';
import { SpeechServiceError } from '../ai/speech.js';
import { ComplaintInputError } from '../services/complaintService.js';
import {
  cancelSession,
  completeSession,
  confirmSession,
  getSessionWithTranscript,
  listSessions,
  SessionError,
  startSession,
  submitCitizenTurn,
} from '../services/sessionService.js';

const outcomeValues = [
  'complaint_created',
  'cancelled_by_citizen',
  'cancelled_by_staff',
  'handoff',
  'ended_without_complaint',
] as const;

const sessionIdSchema = z.string().uuid();
const startSchema = z
  .object({
    citizenId: z.coerce.number().int().positive(),
    language: z.enum(LANGUAGES).nullable().default(null),
    channel: z.enum(['text', 'voice']).default('text'),
  })
  .strict();
const turnSchema = z
  .object({
    text: z.string().trim().min(1).max(1000),
    clientMessageId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,64}$/)
      .optional(),
  })
  .strict();
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'ended']).optional(),
  outcome: z.enum(outcomeValues).optional(),
  citizenId: z.coerce.number().int().positive().optional(),
});

export function organizationId(request: Request): number {
  return request.authUser!.organizationId;
}
export function actorId(request: Request): number {
  return request.authUser!.id;
}

function validationError(response: Response, message: string): void {
  response.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
}

export function sendDomainError(error: unknown, response: Response, next: NextFunction): void {
  if (
    error instanceof SessionError ||
    error instanceof ComplaintInputError ||
    error instanceof SpeechServiceError
  ) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  next(error);
}

/** Shapes a session for the API: exposes collected fields, hides internal engine bookkeeping. */
export function publicSession(session: CallSession) {
  const plain = session.get({ plain: true }) as Record<string, unknown>;
  const context = session.conversationContext;
  delete plain.conversationContext;
  delete plain.recordingStorageKey;
  return {
    ...plain,
    collected: context?.collected ?? null,
    hasRecording: false,
    acceptsInput:
      session.status === 'active' && !TERMINAL_STATES.includes(session.conversationState),
  };
}

export function parseSessionId(request: Request, response: Response): string | null {
  const parsed = sessionIdSchema.safeParse(request.params.id);
  if (!parsed.success) {
    validationError(response, 'Session ID is invalid.');
    return null;
  }
  return parsed.data;
}

async function sendSession(response: Response, orgId: number, sessionId: string, status = 200) {
  const session = await getSessionWithTranscript(orgId, sessionId);
  response.status(status).json({ data: publicSession(session) });
}

export async function createSessionHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = startSchema.safeParse(request.body);
  if (!parsed.success) return validationError(response, 'Select a citizen and a valid language.');
  try {
    const sessionId = await startSession(organizationId(request), actorId(request), parsed.data);
    await sendSession(response, organizationId(request), sessionId, 201);
  } catch (error) {
    sendDomainError(error, response, next);
  }
}

export async function listSessionsHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = listSchema.safeParse(request.query);
  if (!parsed.success) return validationError(response, 'Invalid session filters.');
  try {
    const { page, limit, ...filters } = parsed.data;
    const cleanFilters = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== undefined),
    );
    const result = await listSessions(organizationId(request), cleanFilters, page, limit);
    response.json({
      data: result.rows.map((session) => ({
        ...session.get({ plain: true }),
        hasRecording: false,
      })),
      pagination: { page, limit, total: result.count, pages: Math.ceil(result.count / limit) },
    });
  } catch (error) {
    next(error);
  }
}

export async function getSessionHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const sessionId = parseSessionId(request, response);
  if (!sessionId) return;
  try {
    await sendSession(response, organizationId(request), sessionId);
  } catch (error) {
    sendDomainError(error, response, next);
  }
}

export async function transcriptHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const sessionId = parseSessionId(request, response);
  if (!sessionId) return;
  try {
    const session = await getSessionWithTranscript(organizationId(request), sessionId);
    response.json({
      data: { sessionId: session.id, mode: session.mode, messages: session.messages },
    });
  } catch (error) {
    sendDomainError(error, response, next);
  }
}

export async function turnHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const sessionId = parseSessionId(request, response);
  if (!sessionId) return;
  const parsed = turnSchema.safeParse(request.body);
  if (!parsed.success)
    return validationError(response, 'Enter a citizen reply of up to 1,000 characters.');
  try {
    const result = await submitCitizenTurn(
      organizationId(request),
      actorId(request),
      sessionId,
      parsed.data.text,
      parsed.data.clientMessageId ?? null,
    );
    const session = await getSessionWithTranscript(organizationId(request), sessionId);
    response.json({ data: publicSession(session), replayed: result.replayed });
  } catch (error) {
    sendDomainError(error, response, next);
  }
}

function sessionAction(
  action: (orgId: number, actor: number, sessionId: string) => Promise<unknown>,
) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    const sessionId = parseSessionId(request, response);
    if (!sessionId) return;
    try {
      await action(organizationId(request), actorId(request), sessionId);
      await sendSession(response, organizationId(request), sessionId);
    } catch (error) {
      sendDomainError(error, response, next);
    }
  };
}

export const confirmHandler = sessionAction(confirmSession);
export const cancelHandler = sessionAction(cancelSession);
export const completeHandler = sessionAction(completeSession);
