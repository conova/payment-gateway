import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3002),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  // Oracle
  ORACLE_USER: z.string().min(1),
  ORACLE_PASSWORD: z.string().min(1),
  ORACLE_CONNECT_STRING: z.string().min(1),
  ORACLE_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  ORACLE_POOL_MAX: z.coerce.number().int().positive().default(10),

  // NEGDI
  NEGDI_BASE_URL: z.string().url(),
  NEGDI_TERMINAL_ID: z.string().min(1),
  NEGDI_USERNAME: z.string().min(1),
  NEGDI_PASSWORD: z.string().min(1),
  NEGDI_RETURN_URL: z.string().min(1),
  NEGDI_DEFAULT_THEME: z.enum(['W', 'D', 'B']).default('W'),
  NEGDI_DEFAULT_LANG: z.enum(['mn', 'en']).default('mn'),
  NEGDI_PUBLIC_KEY: z.string().optional(),
  NEGDI_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

  // Auth
  CORE_API_KEY: z.string().min(16),
  ADMIN_API_KEY: z.string().min(16),
  JWT_SECRET: z.string(),
  JWT_ISSUER: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Env validation алдаа:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
