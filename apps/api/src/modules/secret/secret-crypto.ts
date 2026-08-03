import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

/**
 * Encryption-at-rest for connector / webhook secrets (FASE 5 — REQ-10-022,
 * REQ-05-003, REQ-17-049, REQ-09-029).
 *
 * Kolom DB hanya menyimpan referensi `v1:{tenantId}:{key}:{version}`; nilai
 * plaintext dienkripsi AES-256-GCM dan disimpan lewat SecretManager. Pola ini
 * meniru `mfa-secret-crypto.ts` (rung ponytail: reuse pola yang sudah ada).
 *
 * KEY WAJIB, tidak ada fallback. Tanpa CHAI_SECRET_MASTER_KEY, operasi store/
 * rotate gagal keras — tidak pernah menyimpan plaintext diam-diam.
 */

const ENVELOPE_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class SecretCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretCryptoError';
  }
}

/**
 * Decode CHAI_SECRET_MASTER_KEY ke 32-byte key. Menerima 64 hex chars atau
 * base64 yang decode ke 32 byte. Tidak ada fallback: key hilang/pendek/rusak
 * -> throw.
 */
export function loadSecretMasterKey(
  env: NodeJS.ProcessEnv = process.env,
): Buffer {
  const raw = env.CHAI_SECRET_MASTER_KEY?.trim();
  if (!raw) {
    throw new SecretCryptoError(
      'CHAI_SECRET_MASTER_KEY is required to encrypt connector/webhook secrets at rest; refusing to store secrets without it.',
    );
  }
  if (/^[0-9a-fA-F]{64}$/u.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length !== KEY_BYTES) {
    throw new SecretCryptoError(
      `CHAI_SECRET_MASTER_KEY must decode to ${KEY_BYTES} bytes (got ${decoded.length}).`,
    );
  }
  return decoded;
}

export function encryptSecret(
  plaintext: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const key = loadSecretMasterKey(env);
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

export function decryptSecret(
  stored: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const parts = stored.split('.');
  if (parts.length !== 4) {
    throw new SecretCryptoError('Malformed encrypted secret envelope.');
  }
  const key = loadSecretMasterKey(env);
  const iv = Buffer.from(parts[1] as string, 'base64');
  const tag = Buffer.from(parts[2] as string, 'base64');
  const ciphertext = Buffer.from(parts[3] as string, 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new SecretCryptoError('Malformed encrypted secret envelope.');
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  } catch (err) {
    // GCM final() throws pada tag tidak valid / ciphertext rusak.
    throw new SecretCryptoError(
      `Failed to decrypt secret (auth tag mismatch or corrupted ciphertext): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export function isEncryptedSecret(stored: string): boolean {
  return stored.startsWith(`${ENVELOPE_VERSION}.`);
}

export const SECRET_ENVELOPE_VERSION = ENVELOPE_VERSION;
