import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  decryptMfaSecret,
  encryptMfaSecret,
  isEncryptedMfaSecret,
  loadMfaSecretKey,
  MfaSecretKeyError,
} from '../src/auth/mfa-secret-crypto';

const KEY_HEX = randomBytes(32).toString('hex');
const KEY_B64 = randomBytes(32).toString('base64');
const SECRET = 'JBSWY3DPEHPK3PXP'; // sample base32 TOTP secret

function envWith(key: string | undefined): NodeJS.ProcessEnv {
  return key === undefined ? {} : { MFA_SECRET_KEY: key };
}

describe('mfa-secret-crypto', () => {
  it('round-trips a secret through encrypt/decrypt', () => {
    const env = envWith(KEY_HEX);
    const encrypted = encryptMfaSecret(SECRET, env);
    expect(encrypted).not.toBe(SECRET);
    expect(encrypted).not.toContain(SECRET);
    expect(isEncryptedMfaSecret(encrypted)).toBe(true);
    expect(decryptMfaSecret(encrypted, env)).toBe(SECRET);
  });

  it('uses a fresh IV so the same secret never yields the same ciphertext', () => {
    const env = envWith(KEY_B64);
    const a = encryptMfaSecret(SECRET, env);
    const b = encryptMfaSecret(SECRET, env);
    expect(a).not.toBe(b);
    expect(decryptMfaSecret(a, env)).toBe(SECRET);
    expect(decryptMfaSecret(b, env)).toBe(SECRET);
  });

  it('FAILS HARD when the key is absent — never silently keeps plaintext', () => {
    expect(() => encryptMfaSecret(SECRET, envWith(undefined))).toThrow(
      MfaSecretKeyError,
    );
    expect(() => loadMfaSecretKey(envWith(undefined))).toThrow(MfaSecretKeyError);
  });

  it('rejects a key of the wrong length', () => {
    expect(() => loadMfaSecretKey(envWith('too-short'))).toThrow(MfaSecretKeyError);
    expect(() =>
      loadMfaSecretKey(envWith(randomBytes(16).toString('base64'))),
    ).toThrow(MfaSecretKeyError);
  });

  it('accepts both 64-hex and 32-byte base64 keys', () => {
    expect(loadMfaSecretKey(envWith(KEY_HEX))).toHaveLength(32);
    expect(loadMfaSecretKey(envWith(KEY_B64))).toHaveLength(32);
  });

  it('detects tampering via the GCM auth tag', () => {
    const env = envWith(KEY_HEX);
    const encrypted = encryptMfaSecret(SECRET, env);
    const parts = encrypted.split('.');
    // Flip a byte in the ciphertext segment.
    const ct = Buffer.from(parts[3] as string, 'base64');
    ct[0] = (ct[0] ?? 0) ^ 0xff;
    const tampered = [parts[0], parts[1], parts[2], ct.toString('base64')].join('.');
    expect(() => decryptMfaSecret(tampered, env)).toThrow();
  });

  it('fails to decrypt an envelope with the wrong key', () => {
    const encrypted = encryptMfaSecret(SECRET, envWith(KEY_HEX));
    expect(() => decryptMfaSecret(encrypted, envWith(KEY_B64))).toThrow();
  });

  it('treats a non-envelope value as legacy plaintext (backward compatible)', () => {
    // A bare base32 secret (pre-0061) is returned as-is so an enrolled user is
    // not broken; no key needed to read it.
    expect(isEncryptedMfaSecret(SECRET)).toBe(false);
    expect(decryptMfaSecret(SECRET, envWith(undefined))).toBe(SECRET);
  });
});
