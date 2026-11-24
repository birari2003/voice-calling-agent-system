import { access, constants, mkdir } from 'node:fs/promises';
import type { Request, Response } from 'express';
import { speechService } from '../ai/speech.js';
import { sequelize } from '../config/database.js';
import { env } from '../config/env.js';

const startedAt = Date.now();

async function check(task: () => Promise<unknown>, timeoutMs = 3000): Promise<'ok' | 'error'> {
  try {
    await Promise.race([
      task(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return 'ok';
  } catch {
    return 'error';
  }
}

/** Liveness: the process is up and serving requests. */
export function getLiveness(_request: Request, response: Response): void {
  response.json({ status: 'ok' });
}

/**
 * Readiness: the database and upload storage are required; the speech service is optional
 * (text sessions still work without it), so it is reported but does not fail the check.
 */
export async function getHealth(_request: Request, response: Response): Promise<void> {
  const [database, storage, speech] = await Promise.all([
    check(() => sequelize.authenticate()),
    check(async () => {
      await mkdir(env.UPLOAD_DIR, { recursive: true });
      await access(env.UPLOAD_DIR, constants.W_OK);
    }),
    speechService.health(),
  ]);
  const healthy = database === 'ok' && storage === 'ok';
  response.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    database,
    storage,
    speechService: speech.reachable ? 'ok' : 'unavailable',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    environment: env.NODE_ENV,
  });
}
