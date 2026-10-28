import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

function deriveKey(key, purpose) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('MFA encryption key must be 32 bytes');
  return Buffer.from(hkdfSync(
    'sha256',
    key,
    Buffer.from('EduCloud MFA key derivation v1'),
    Buffer.from(purpose),
    32,
  ));
}

function encodeBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value) {
  let bits = 0;
  let accumulator = 0;
  const output = [];
  for (const character of value.toUpperCase().replace(/=+$/g, '')) {
    const digit = BASE32_ALPHABET.indexOf(character);
    if (digit < 0) throw new Error('Invalid encoded MFA secret');
    accumulator = (accumulator << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      output.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function counterBuffer(step) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(step));
  return buffer;
}

function tokenAtStep(secret, step) {
  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer(step)).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, '0');
}

export function generateTotpSecret() {
  return encodeBase32(randomBytes(20));
}

export function totpUri(secret, accountName, issuer = 'EduCloud') {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const parameters = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${parameters.toString()}`;
}

export function matchingTotpStep(secret, token, now = Date.now()) {
  if (!/^\d{6}$/.test(token)) return undefined;
  const currentStep = Math.floor(now / (TOTP_PERIOD_SECONDS * 1000));
  const supplied = Buffer.from(token);
  for (const step of [currentStep - 1, currentStep, currentStep + 1]) {
    if (step < 0) continue;
    const expected = Buffer.from(tokenAtStep(secret, step));
    if (timingSafeEqual(supplied, expected)) return step;
  }
  return undefined;
}

export function encryptMfaSecret(secret, key) {
  const encryptionKey = deriveKey(key, 'totp-secret-encryption');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptMfaSecret(encrypted, key) {
  const encryptionKey = deriveKey(key, 'totp-secret-encryption');
  const [version, encodedIv, encodedTag, encodedCiphertext] = String(encrypted).split('.');
  if (version !== 'v1' || !encodedIv || !encodedTag || !encodedCiphertext) {
    throw new Error('Stored MFA secret has an invalid format');
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(encodedIv, 'base64url'));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function normalizeRecoveryCode(code) {
  return String(code).replace(/[\s-]/g, '').toUpperCase();
}

export function generateRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => randomBytes(16).toString('hex').toUpperCase().match(/.{1,8}/g).join('-'));
}

export function hashRecoveryCode(code, key) {
  const hmacKey = deriveKey(key, 'recovery-code-hmac');
  return createHmac('sha256', hmacKey).update(normalizeRecoveryCode(code)).digest('hex');
}
