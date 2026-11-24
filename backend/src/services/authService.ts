import { createHash, randomBytes } from 'node:crypto';
import { Op } from 'sequelize';
import { AuthSession, Organization, Permission, Role, User } from '../models/index.js';

export const SESSION_COOKIE = 'nagar_session';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  organizationId: number;
  organizationName: string;
  role: string;
  permissions: string[];
}

export function digestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function findUserForLogin(email: string): Promise<User | null> {
  return User.findOne({
    where: { email: email.toLowerCase() },
    include: [{ model: Role, as: 'role' }],
  });
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await AuthSession.create({
    userId,
    tokenHash: digestToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

const identityIncludes = [
  {
    model: Role,
    as: 'role',
    include: [{ model: Permission, as: 'permissions', through: { attributes: [] } }],
  },
  { model: Organization, as: 'organization' },
];

export async function findSession(token: string) {
  const session = await AuthSession.findOne({
    where: { tokenHash: digestToken(token), expiresAt: { [Op.gt]: new Date() } },
    include: [{ model: User, as: 'user', include: identityIncludes }],
  });
  if (!session) return null;
  const user = (session as AuthSession & { user: User }).user;
  if (!user?.isActive || !user.organization?.isActive || !user.role) return null;
  const authenticatedUser: AuthenticatedUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    organizationId: user.organizationId,
    organizationName: user.organization.name,
    role: user.role.name,
    permissions: user.role.permissions?.map(({ name }) => name) ?? [],
  };
  return { sessionId: session.id, user: authenticatedUser };
}

export async function getUserIdentity(userId: number): Promise<AuthenticatedUser | null> {
  const user = await User.findByPk(userId, { include: identityIncludes });
  if (!user?.isActive || !user.organization?.isActive || !user.role) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    organizationId: user.organizationId,
    organizationName: user.organization.name,
    role: user.role.name,
    permissions: user.role.permissions?.map(({ name }) => name) ?? [],
  };
}
