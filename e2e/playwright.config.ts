import { defineConfig } from '@playwright/test';

/**
 * Browser tests against a throwaway database (nagar_seva_test, rebuilt by global setup) and
 * dedicated ports, so local development servers and data are never touched.
 */
const API_PORT = 5056;
const WEB_PORT = 5175;
const testEnv = {
  NODE_ENV: 'test',
  DB_NAME: process.env.TEST_DB_NAME ?? 'nagar_seva_test',
  UPLOAD_DIR: './storage/test-uploads',
  AI_SERVICE_URL: 'http://127.0.0.1:9',
  AI_SERVICE_TIMEOUT_MS: '2000',
};

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npx tsx src/server.ts',
      cwd: '../backend',
      url: `http://127.0.0.1:${API_PORT}/api/v1/health/live`,
      reuseExistingServer: false,
      env: {
        ...testEnv,
        PORT: String(API_PORT),
        CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
        APP_URL: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: '../frontend',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      env: { VITE_API_BASE_URL: `http://localhost:${API_PORT}/api/v1` },
    },
  ],
});
