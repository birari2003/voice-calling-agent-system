import { app } from './app.js';
import { sequelize } from './config/database.js';
import { env } from './config/env.js';
import { describeError, logger } from './observability/logger.js';
import { assertSafeToStart } from './startupChecks.js';

try {
  await assertSafeToStart();
} catch (error) {
  logger.error('startup aborted', describeError(error, false));
  process.exit(1);
}

const server = app.listen(env.PORT, () => {
  logger.info('NagarSeva API listening', { port: env.PORT, environment: env.NODE_ENV });
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('shutting down', { signal });
  // Stop accepting requests, let in-flight ones finish, then close the database pool.
  server.close(() => {
    sequelize
      .close()
      .catch((error: unknown) => logger.error('database close failed', describeError(error, false)))
      .finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => shutdown(signal));
process.on('unhandledRejection', (reason) =>
  logger.error('unhandled promise rejection', describeError(reason, env.NODE_ENV !== 'production')),
);
