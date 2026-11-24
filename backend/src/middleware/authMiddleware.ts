import type { NextFunction, Request, Response } from 'express';
import { findSession, SESSION_COOKIE } from '../services/authService.js';

function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(pair.slice(separator + 1).trim());
  }
  return undefined;
}

export function getRequestCookie(request: Request, name: string): string | undefined {
  return readCookie(request, name);
}

export async function requireAuthentication(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) {
    response.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } });
    return;
  }
  try {
    const session = await findSession(token);
    if (!session) {
      response.status(401).json({
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Your session has expired. Please sign in again.',
        },
      });
      return;
    }
    request.authUser = session.user;
    request.authSessionId = session.sessionId;
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermission(permission: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.authUser?.permissions.includes(permission)) {
      response.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action.',
        },
      });
      return;
    }
    next();
  };
}
