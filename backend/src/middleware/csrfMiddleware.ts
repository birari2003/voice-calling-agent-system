import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { getRequestCookie } from './authMiddleware.js';

export const CSRF_COOKIE = 'nagar_csrf';
const cookieOptions = {
  path: '/',
  sameSite: 'strict' as const,
  secure: env.NODE_ENV === 'production',
};

export function issueCsrfToken(_request: Request, response: Response): void {
  const token = randomBytes(32).toString('base64url');
  response.cookie(CSRF_COOKIE, token, {
    ...cookieOptions,
    httpOnly: false,
    maxAge: 2 * 60 * 60 * 1000,
  });
  response.json({ csrfToken: token });
}

export function requireCsrf(request: Request, response: Response, next: NextFunction): void {
  const cookieToken = getRequestCookie(request, CSRF_COOKIE);
  const headerToken = request.header('x-csrf-token');
  if (!cookieToken || !headerToken) {
    response
      .status(403)
      .json({ error: { code: 'CSRF_INVALID', message: 'Request verification failed.' } });
    return;
  }
  const expected = Buffer.from(cookieToken);
  const actual = Buffer.from(headerToken);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    response
      .status(403)
      .json({ error: { code: 'CSRF_INVALID', message: 'Request verification failed.' } });
    return;
  }
  const origin = request.header('origin');
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((value) => value.trim());
  if (origin && !allowedOrigins.includes(origin)) {
    response
      .status(403)
      .json({ error: { code: 'ORIGIN_INVALID', message: 'Request origin is not allowed.' } });
    return;
  }
  next();
}
