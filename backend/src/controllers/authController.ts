import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { env } from '../config/env.js';
import { AuthSession, User } from '../models/index.js';
import { writeAuditLog } from '../services/auditService.js';
import {
  createSession,
  digestToken,
  findSession,
  findUserForLogin,
  getUserIdentity,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from '../services/authService.js';
import { getRequestCookie } from '../middleware/authMiddleware.js';
import { CSRF_COOKIE } from '../middleware/csrfMiddleware.js';

const cookieBase = { path: '/', sameSite: 'lax' as const, secure: env.NODE_ENV === 'production' };
/** bcrypt hash of a random value, compared against when the email is unknown. */
const TIMING_DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), 12);

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

function setSessionCookie(response: Response, token: string): void {
  response.cookie(SESSION_COOKIE, token, { ...cookieBase, httpOnly: true, maxAge: SESSION_TTL_MS });
}

function clearAuthCookies(response: Response): void {
  response.clearCookie(SESSION_COOKIE, { ...cookieBase, httpOnly: true });
  response.clearCookie(CSRF_COOKIE, {
    path: '/',
    sameSite: 'strict',
    secure: env.NODE_ENV === 'production',
  });
}

export async function login(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    response
      .status(400)
      .json({ error: { code: 'VALIDATION_ERROR', message: 'Enter a valid email and password.' } });
    return;
  }
  try {
    const user = await findUserForLogin(parsed.data.email);
    // Always run one bcrypt comparison so unknown emails take as long as wrong passwords
    // (otherwise response time reveals which accounts exist).
    const valid = await bcrypt.compare(
      parsed.data.password,
      user?.passwordHash ?? TIMING_DUMMY_HASH,
    );
    if (!user || !valid || !user.isActive) {
      await writeAuditLog('auth.login_failed', null);
      response.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' },
      });
      return;
    }
    const identity = await getUserIdentity(user.id);
    if (!identity) {
      response.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' },
      });
      return;
    }
    const token = await createSession(user.id);
    const session = await findSession(token);
    if (!session) {
      await AuthSession.destroy({ where: { tokenHash: digestToken(token) } });
      response.status(403).json({
        error: { code: 'ACCOUNT_UNAVAILABLE', message: 'This account is currently unavailable.' },
      });
      return;
    }
    user.lastLoginAt = new Date();
    await user.save();
    // Housekeeping: drop this user's expired sessions so the table does not grow forever.
    await AuthSession.destroy({ where: { userId: user.id, expiresAt: { [Op.lte]: new Date() } } });
    await writeAuditLog('auth.login', user.id);
    setSessionCookie(response, token);
    response.json({ user: session.user });
  } catch (error) {
    next(error);
  }
}

export async function currentUser(request: Request, response: Response): Promise<void> {
  response.json({ user: request.authUser });
}

export async function logout(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = getRequestCookie(request, SESSION_COOKIE);
    if (token) await AuthSession.destroy({ where: { tokenHash: digestToken(token) } });
    if (request.authUser) await writeAuditLog('auth.logout', request.authUser.id);
    clearAuthCookies(response);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200),
});

export async function changePassword(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = passwordSchema.safeParse(request.body);
  if (!parsed.success || !request.authUser) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'New password must be at least 12 characters.',
      },
    });
    return;
  }
  try {
    const user = await User.findByPk(request.authUser.id);
    if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
      response
        .status(400)
        .json({ error: { code: 'PASSWORD_INCORRECT', message: 'Current password is incorrect.' } });
      return;
    }
    user.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await user.save();
    await AuthSession.destroy({ where: { userId: user.id } });
    await writeAuditLog('auth.password_changed', user.id);
    clearAuthCookies(response);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
}
