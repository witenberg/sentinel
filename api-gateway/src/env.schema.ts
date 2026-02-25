import { z } from 'zod';

const envSchema = z.object({
  // Optional with defaults
  PORT: z.coerce.number().optional().default(3000),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .optional()
    .default('development'),
  UPLOAD_MAX_FILE_SIZE: z.coerce
    .number()
    .positive()
    .optional()
    .default(100 * 1024 * 1024),

  // Required
  FRONTEND_URL: z.string().min(1, 'FRONTEND_URL is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  RABBITMQ_URL: z.string().min(1, 'RABBITMQ_URL is required'),
  RABBITMQ_JOBS_QUEUE: z.string().min(1, 'RABBITMQ_JOBS_QUEUE is required'),
  RABBITMQ_RESULTS_QUEUE: z.string().min(1, 'RABBITMQ_RESULTS_QUEUE is required'),
  S3_ENDPOINT: z.string().min(1, 'S3_ENDPOINT is required'),
  S3_ACCESS_KEY: z.string().min(1, 'S3_ACCESS_KEY is required'),
  S3_SECRET_KEY: z.string().min(1, 'S3_SECRET_KEY is required'),
  S3_BUCKET: z.string().min(1, 'S3_BUCKET is required'),
  S3_REGION: z.string().min(1, 'S3_REGION is required'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const formatted = z.prettifyError(parsed.error);
    throw new Error(`Environment validation failed:\n${formatted}`);
  }
  return parsed.data;
}
