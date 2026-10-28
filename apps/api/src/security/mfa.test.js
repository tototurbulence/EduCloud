import { describe, expect, it } from 'vitest';
import {
  decryptMfaSecret,
  encryptMfaSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  matchingTotpStep,
} from './mfa.js';

const testKey = Buffer.alloc(32, 7);

describe('MFA primitives', () => {
  it('accepts the RFC 6238 SHA-1 test vector and rejects an invalid code', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

    expect(matchingTotpStep(secret, '287082', 59_000)).toBe(1);
    expect(matchingTotpStep(secret, '287083', 59_000)).toBeUndefined();
    expect(matchingTotpStep(secret, '28708', 59_000)).toBeUndefined();
  });

  it('encrypts secrets with authenticated encryption and rejects tampering or another key', () => {
    const encrypted = encryptMfaSecret('totp-secret', testKey);
    const [version, iv, tag, ciphertext] = encrypted.split('.');
    const changedTag = `${tag[0] === 'A' ? 'B' : 'A'}${tag.slice(1)}`;

    expect(decryptMfaSecret(encrypted, testKey)).toBe('totp-secret');
    expect(() => decryptMfaSecret(`${version}.${iv}.${changedTag}.${ciphertext}`, testKey)).toThrow();
    expect(() => decryptMfaSecret(encrypted, Buffer.alloc(32, 8))).toThrow();
  });

  it('creates unique recovery codes and hashes them independent of display separators', () => {
    const codes = generateRecoveryCodes();

    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((code) => /^[A-F0-9]{8}(?:-[A-F0-9]{8}){3}$/.test(code))).toBe(true);
    expect(hashRecoveryCode('AABB-CCDD', testKey)).toBe(hashRecoveryCode('aabbccdd', testKey));
    expect(hashRecoveryCode('AABB-CCDD', testKey)).not.toBe(hashRecoveryCode('AABB-CCDD', Buffer.alloc(32, 8)));
  });
});
