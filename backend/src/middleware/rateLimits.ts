import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * Per-user limit for endpoints that are expensive (speech models, exports, imports), so one
 * account cannot monopolise the server. Falls back to the client IP before authentication.
 */
export function perUserLimit(limit: number, windowMinutes: number, what: string) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (request: Request) =>
      request.authUser ? `user:${request.authUser.id}` : ipKeyGenerator(request.ip ?? ''),
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: `Too many ${what} requests. Please wait a few minutes and try again.`,
      },
    },
  });
}
