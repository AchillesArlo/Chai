import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

/**
 * Encryption-at-rest for TOTP shared secrets (finding: secret stored plaintext).
 *
 * A stored TOTP secret is a bearer credential: anyone who reads it can mint valid
 * codes forever, so it must not sit in the database in the clear. This wraps it
 * in AES-256-GCM (authenticated encryption) using a key supplied ONLY via the
 * environment — `node:crypto`, no new dependency.
 *
 * KEY IS MANDATORY, NEVER DEFAULTED. Unlike AUTH_TOKEN_SECRET (which has a
 * dev/test fallback), a missing/short MFA_SECRET_KEY throws. Enrolment calls
 * {@link encryptMfaSecret}, so without the key enrolment FAILS HARD rather than
 * silently persisting a plaintext secret — the exact anti-pattern this closes.
 */

const ENVELOPE_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard nonce
const TAG_BYTES = 16;

export class MfaSecretKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MfaSecretKeyError';
  }
}

/**
 * Decodes MFA_SECRET_KEY to a 32-byte key. Accepts either 64 hex chars or a
 * base64 string that decodes to exactly 32 bytes. No fallback: an unset,
 * malformed, or wrong-length key throws so MFA can never operate on a weak or
 * absent key.
 */
export function loadMfaSecretKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.MFA_SECRET_KEY?.trim();
  if (!raw) {
    throw new MfaSecretKeyError(
      'MFA_SECRET_KEY is required to encrypt TOTP secrets at rest; refusing to store MFA secrets without it.',
    );
  }
  if (/^[0-9a-fA-F]{64}$/u.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  // Try base64 / base64url. Buffer is lenient, so validate the decoded length.
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length === KEY_BYTES) {
    return decoded;
  }
  throw new MfaSecretKeyError(
    `MFA_SECRET_KEY must decode to ${KEY_BYTES} bytes (64 hex chars or 32-byte base64).`,
  );
}

/** True when a stored value is one this module produced (vs a legacy plaintext). */
export function isEncryptedMfaSecret(stored: string): boolean {
  return stored.startsWith(`${ENVELOPE_VERSION}.`);
}

/**
 * Encrypts a base32 TOTP secret into `v1.<ivB64>.<tagB64>.<ciphertextB64>`.
 * A fresh random IV per call means the same secret never encrypts to the same
 * envelope. Throws (no key) before any value is produced.
 */
export function encryptMfaSecret(
  plaintext: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const key = loadMfaSecretKey(env);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    ENVELOPE_VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

/**
 * Reverses {@link encryptMfaSecret}. A value not in envelope form is treated as
 * a legacy plaintext secret (pre-migration rows, see 0061) and returned as-is so
 * an already-enrolled user keeps working.
 *
 * ponytail: legacy plaintext rows stay in the clear at rest until the user
 * re-enrols (which rewrites the secret through {@link encryptMfaSecret}). Upgrade
 * path: a one-off re-encrypt pass over rows failing {@link isEncryptedMfaSecret}
 * using this module. New enrolments are always encrypted. GCM auth failure
 * (wrong key / tampered row) throws rather than returning a bogus secret.
 */
export function decryptMfaSecret(
  stored: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!isEncryptedMfaSecret(stored)) {
    return stored;
  }
  const parts = stored.split('.');
  if (parts.length !== 4) {
    throw new MfaSecretKeyError('Malformed encrypted MFA secret envelope.');
  }
  const key = loadMfaSecretKey(env);
  const iv = Buffer.from(parts[1] as string, 'base64');
  const tag = Buffer.from(parts[2] as string, 'base64');
  const ciphertext = Buffer.from(parts[3] as string, 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new MfaSecretKeyError('Malformed encrypted MFA secret envelope.');
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
