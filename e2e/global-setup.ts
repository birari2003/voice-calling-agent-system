import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Rebuilds the integration database (same script as the API integration suite). */
export default function globalSetup(): void {
  execSync('npx tsx test/integration/prepare.ts', {
    cwd: path.resolve(here, '../backend'),
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DB_NAME: process.env.TEST_DB_NAME ?? 'nagar_seva_test',
      UPLOAD_DIR: './storage/test-uploads',
    },
  });
}
