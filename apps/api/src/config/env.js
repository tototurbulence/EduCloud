import dotenv from 'dotenv';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  MONGODB_URI: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().min(1).optional(),
  ),
  SESSION_SECRET: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().min(32, 'must contain at least 32 characters').optional(),
  ),
  MFA_ENCRYPTION_KEY: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().regex(/^[a-f\d]{64}$/i, 'must be a 32-byte hexadecimal key').optional(),
  ),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
});

export function loadConfig(source = process.env) {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(({ path, message }) => `${path.join('.')}: ${message}`)
      .join('; ');

    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  if (parsed.data.NODE_ENV === 'production') {
    const missing = [];
    if (!parsed.data.MONGODB_URI) missing.push('MONGODB_URI');
    if (!parsed.data.SESSION_SECRET) missing.push('SESSION_SECRET');
    if (!parsed.data.MFA_ENCRYPTION_KEY) missing.push('MFA_ENCRYPTION_KEY');
    if (missing.length > 0) {
      throw new Error(`Invalid environment configuration: ${missing.join(', ')} are required in production`);
    }
    const usesSrv = parsed.data.MONGODB_URI.startsWith('mongodb+srv://');
    const explicitlyUsesTls = /[?&](tls|ssl)=true(?:&|$)/i.test(parsed.data.MONGODB_URI);
    const explicitlyDisablesTls = /[?&](tls|ssl)=false(?:&|$)/i.test(parsed.data.MONGODB_URI);
    if ((!usesSrv && !explicitlyUsesTls) || explicitlyDisablesTls) {
      throw new Error('Invalid environment configuration: production MONGODB_URI must use TLS');
    }
  }

  const clientOrigins = parsed.data.CLIENT_ORIGINS
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (clientOrigins.length === 0) {
    throw new Error('Invalid environment configuration: CLIENT_ORIGINS must list at least one origin');
  }

  for (const origin of clientOrigins) {
    let url;
    try {
      url = new URL(origin);
    } catch {
      throw new Error('Invalid environment configuration: CLIENT_ORIGINS must contain valid origins');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error('Invalid environment configuration: CLIENT_ORIGINS must contain origins without paths');
    }
    if (parsed.data.NODE_ENV === 'production'
      && (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(url.hostname))) {
      throw new Error('Invalid environment configuration: production CLIENT_ORIGINS must use public HTTPS origins');
    }
  }

  return {
    ...parsed.data,
    // A fresh ephemeral key is convenient for local development only. Production
    // requires a stable key from the deployment secret manager.
    SESSION_SECRET: parsed.data.SESSION_SECRET ?? randomBytes(32).toString('hex'),
    MFA_ENCRYPTION_KEY: parsed.data.MFA_ENCRYPTION_KEY
      ? Buffer.from(parsed.data.MFA_ENCRYPTION_KEY, 'hex')
      : undefined,
    CLIENT_ORIGINS: clientOrigins,
  };
}
