import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

const productionConfig = () => ({
  NODE_ENV: 'production',
  PORT: '4000',
  CLIENT_ORIGINS: 'https://lms.example',
  MONGODB_URI: 'mongodb://db.example:27017/educloud?tls=true',
  SESSION_SECRET: 's'.repeat(48),
  MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('hex'),
  TRUST_PROXY_HOPS: '1',
});

describe('environment configuration', () => {
  it('parses secure production settings and converts the MFA key to bytes', () => {
    const config = loadConfig(productionConfig());

    expect(config.NODE_ENV).toBe('production');
    expect(config.CLIENT_ORIGINS).toEqual(['https://lms.example']);
    expect(config.MFA_ENCRYPTION_KEY).toBeInstanceOf(Buffer);
    expect(config.MFA_ENCRYPTION_KEY).toHaveLength(32);
    expect(config.TRUST_PROXY_HOPS).toBe(1);
  });

  it('rejects missing production secrets and a MongoDB URI without TLS', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/MONGODB_URI.*SESSION_SECRET.*MFA_ENCRYPTION_KEY/);

    const config = productionConfig();
    config.MONGODB_URI = 'mongodb://db.example:27017/educloud';
    expect(() => loadConfig(config)).toThrow(/must use TLS/);
  });

  it('rejects non-HTTPS production origins and path-bearing origins', () => {
    const insecure = productionConfig();
    insecure.CLIENT_ORIGINS = 'http://lms.example';
    expect(() => loadConfig(insecure)).toThrow(/public HTTPS origins/);

    const pathBearing = productionConfig();
    pathBearing.CLIENT_ORIGINS = 'https://lms.example/app';
    expect(() => loadConfig(pathBearing)).toThrow(/without paths/);
  });
});
