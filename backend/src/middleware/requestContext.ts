import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger, redactPath } from '../observability/logger.js';

const INCOMING_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Gives every request a correlation ID (reusing a well-formed X-Request-Id from a proxy),
 * returns it in the response header, and writes one access-log line when the response ends.
 */
export function requestContext(request: Request, response: Response, next: NextFunction): void {
  const incoming = request.header('x-request-id');
  const requestId = incoming && INCOMING_ID.test(incoming) ? incoming : randomUUID();
  request.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  const started = process.hrtime.bigint();
  response.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const entry = {
      requestId,
      method: request.method,
      path: redactPath(request.originalUrl),
      status: response.statusCode,
      durationMs: Math.round(durationMs),
      userId: request.authUser?.id,
    };
    if (response.statusCode >= 500) logger.error('request failed', entry);
    else if (request.path.endsWith('/health')) logger.debug('request', entry);
    else logger.info('request', entry);
  });
  next();
}
