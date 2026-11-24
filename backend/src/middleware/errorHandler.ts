import type { ErrorRequestHandler } from 'express';
import { env } from '../config/env.js';
import { describeError, logger, redactPath } from '../observability/logger.js';

type Reply = { status: number; code: string; message: string };

/** Maps known framework errors to stable client errors; everything else is a logged 500. */
function classify(error: unknown): Reply | null {
  if (!error || typeof error !== 'object') return null;
  const err = error as { name?: string; type?: string; code?: string };
  if (err.type === 'entity.parse.failed')
    return { status: 400, code: 'INVALID_JSON', message: 'The request body is not valid JSON.' };
  if (err.type === 'entity.too.large')
    return { status: 413, code: 'BODY_TOO_LARGE', message: 'The request body is too large.' };
  if (err.name === 'SequelizeUniqueConstraintError')
    return {
      status: 409,
      code: 'DUPLICATE_RECORD',
      message: 'A record with these details already exists.',
    };
  if (err.name === 'MulterError') {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    return {
      status: tooLarge ? 413 : 400,
      code: tooLarge ? 'FILE_TOO_LARGE' : 'UPLOAD_INVALID',
      message: tooLarge ? 'The uploaded file is too large.' : 'The upload is invalid.',
    };
  }
  return null;
}

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  void _next;
  const known = classify(error);
  const context = {
    requestId: request.requestId,
    method: request.method,
    path: redactPath(request.originalUrl),
    // Stack traces only for real server errors, and never in production logs' client path.
    ...describeError(error, !known && env.NODE_ENV !== 'production'),
  };
  if (known) logger.warn('request rejected', { ...context, status: known.status });
  else logger.error('unhandled request error', context);
  if (response.headersSent) return;
  const reply = known ?? {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred. Quote the reference if you contact support.',
  };
  // Never send stack traces or database details; the reference links to the server log.
  response
    .status(reply.status)
    .json({ error: { code: reply.code, message: reply.message, reference: request.requestId } });
};
