import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  DEPLOYMENT_MODE: z.enum(['cloud', 'local']).default('cloud'),
  // Local-only — pins this installation to a single tenant.
  LOCAL_TENANT_SLUG: z.string().optional(),
  LOCAL_TENANT_NAME: z.string().optional(),
  LOCAL_API_KEY: z.string().optional(),
  // Cloud-only — trusted origins for CORS
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
