import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: '.env' });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  APP_URL: z.string().url().default('http://localhost:5173'),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),
  AI_SERVICE_URL: z.string().url().default('http://127.0.0.1:8001'),
  AI_SERVICE_TOKEN: z.string().default(''),
  AI_SERVICE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(90000),
  // Express "trust proxy": false locally; 1 (one hop) behind nginx/a load balancer.
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((value) =>
      value === 'true'
        ? true
        : value === 'false'
          ? false
          : /^\d+$/.test(value)
            ? Number(value)
            : value,
    ),
  UPLOAD_DIR: z.string().min(1).default('./storage/uploads'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().max(25).default(10),
  UPLOAD_LINK_TTL_HOURS: z.coerce.number().positive().max(168).default(48),
  UPLOAD_LINK_MAX_UPLOADS: z.coerce.number().int().min(1).max(20).default(5),
  // Reports group dates in this UTC offset (timestamps are stored in UTC).
  REPORT_UTC_OFFSET: z
    .string()
    .regex(/^[+-](0\d|1[0-4]):[0-5]\d$/, 'REPORT_UTC_OFFSET must look like +05:30')
    .default('+05:30'),
  STT_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.4),
  // Free-text answers (problem, location, name) are read back before saving, so can be lower.
  STT_MIN_CONFIDENCE_FREE_TEXT: z.coerce.number().min(0).max(1).default(0.25),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .refine(
      (value) =>
        value.split(',').every((origin) => {
          try {
            new URL(origin.trim());
            return true;
          } catch {
            return false;
          }
        }),
      'CORS_ORIGIN must contain valid comma-separated origins.',
    ),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(
    `Invalid environment configuration:\n${details}\nCopy .env.example to .env and set the required values.`,
  );
}

export const env = parsed.data;
