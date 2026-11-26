import bcrypt from 'bcryptjs';
import { env } from './config/env.js';
import { User } from './models/index.js';
import { logger } from './observability/logger.js';

/** The local bootstrap account (bootstrap-seeders/create-super-admin.cjs). */
const BOOTSTRAP_EMAIL = 'admin@nagar-seva.local';
const BOOTSTRAP_PASSWORD = 'Pass@1234';

/**
 * Refuses to start a production server with development defaults that would make it unsafe.
 * Returns the list of problems; an empty list means it is safe to start.
 */
export async function productionProblems(): Promise<string[]> {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  if (!env.ELEVENLABS_API_KEY)
    problems.push('ELEVENLABS_API_KEY must be configured for production voice sessions.');
  for (const origin of env.CORS_ORIGIN.split(',').map((value) => value.trim()))
    if (!origin.startsWith('https://'))
      problems.push(`CORS_ORIGIN must use https in production (got ${origin}).`);
  if (!env.APP_URL.startsWith('https://'))
    problems.push('APP_URL must use https in production (citizen upload links are built from it).');
  const bootstrap = await User.findOne({ where: { email: BOOTSTRAP_EMAIL, isActive: true } });
  if (bootstrap && (await bcrypt.compare(BOOTSTRAP_PASSWORD, bootstrap.passwordHash)))
    problems.push(
      `The local bootstrap account ${BOOTSTRAP_EMAIL} still has its default password. Change it or deactivate it.`,
    );
  return problems;
}

export async function assertSafeToStart(): Promise<void> {
  const problems = await productionProblems();
  if (!problems.length) return;
  for (const problem of problems) logger.error('unsafe production configuration', { problem });
  throw new Error(`Refusing to start: ${problems.length} unsafe production setting(s).`);
}
