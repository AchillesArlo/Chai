import type { Audience } from './audiences';
import type { Principal } from './roles';

/**
 * PBKDF2 password hashing via Web Crypto (stdlib, no bcrypt dep).
 * Stored format: pbkdf2$<iterations>$<saltB64>$<hashB64>
 */

const PBKDF2_ITERATIONS = 120_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const ALGORITHM = 'SHA-512';

export interface PasswordHashConfig {
  iterations?: number;
  saltBytes?: number;
  hashBytes?: number;
}

function bytesToB64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += 1) {
    binary += String.fromCharCode(view[i] as number);
  }
  return Buffer.from(binary, 'binary').toString('base64');
}

function b64ToBytes(value: string): Uint8Array {
  const binary = Buffer.from(value, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function importPbkdf2Key(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password) as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
}

export async function hashPassword(
  password: string,
  config: PasswordHashConfig = {},
): Promise<string> {
  const iterations = config.iterations ?? PBKDF2_ITERATIONS;
  const saltBytes = config.saltBytes ?? SALT_BYTES;
  const hashBytes = config.hashBytes ?? HASH_BYTES;

  const salt = crypto.getRandomValues(new Uint8Array(saltBytes));
  const key = await importPbkdf2Key(password);
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: ALGORITHM },
    key,
    hashBytes * 8,
  );
  return `pbkdf2$${iterations}$${bytesToB64(salt)}$${bytesToB64(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const algorithm = parts[0];
  const iterationsStr = parts[1];
  const saltB64 = parts[2];
  const hashB64 = parts[3];
  if (!algorithm || !iterationsStr || !saltB64 || !hashB64) return false;

  const iterations = Number.parseInt(iterationsStr, 10);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;

  const salt = b64ToBytes(saltB64);
  const expectedHash = b64ToBytes(hashB64);
  const key = await importPbkdf2Key(password);
  const candidateHash = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: ALGORITHM },
      key,
      expectedHash.length * 8,
    ),
  );
  return timingSafeEqual(candidateHash, expectedHash);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= (a[i] as number) ^ (b[i] as number);
  }
  return diff === 0;
}

export interface CredentialRecord {
  principal: Principal;
  /**
   * Email normalized to lowercase, trimmed.
   */
  email: string;
  /**
   * Output of hashPassword(). Empty / undefined means no password (cannot log in).
   */
  passwordHash?: string;
  /**
   * When false, login is blocked even with correct password.
   */
  enabled: boolean;
}

export interface CredentialLookupResult {
  record: CredentialRecord;
}

export interface CredentialStore {
  findByEmail(email: string, audience: Audience): Promise<CredentialLookupResult | null>;
  recordRefreshToken?(principalId: string, jti: string, expiresAt: number): Promise<void>;
  revokeRefreshToken?(jti: string): Promise<void>;
  isRefreshTokenRevoked?(jti: string): Promise<boolean>;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface AuthenticateCredentialsInput {
  email: string;
  password: string;
  audience: Audience;
  store: CredentialStore;
}

export interface AuthenticateCredentialsFailure {
  ok: false;
  reason: 'UNKNOWN_CREDENTIALS' | 'INVALID_PASSWORD' | 'ACCOUNT_DISABLED';
}

export interface AuthenticateCredentialsSuccess {
  ok: true;
  principal: Principal;
}

export type AuthenticateCredentialsResult =
  | AuthenticateCredentialsFailure
  | AuthenticateCredentialsSuccess;

/**
 * Constant-message credential check: returns the same opaque reason for
 * unknown-email and wrong-password to avoid user enumeration.
 */
export async function authenticateCredentials({
  email,
  password,
  audience,
  store,
}: AuthenticateCredentialsInput): Promise<AuthenticateCredentialsResult> {
  const lookup = await store.findByEmail(normalizeEmail(email), audience);
  if (!lookup) {
    // ponytail: still run a dummy hash to keep timing uniform.
    await hashPassword(password);
    return { ok: false, reason: 'UNKNOWN_CREDENTIALS' };
  }
  const { record } = lookup;
  if (!record.enabled) {
    return { ok: false, reason: 'ACCOUNT_DISABLED' };
  }
  if (!record.passwordHash) {
    return { ok: false, reason: 'UNKNOWN_CREDENTIALS' };
  }
  const valid = await verifyPassword(password, record.passwordHash);
  if (!valid) {
    return { ok: false, reason: 'INVALID_PASSWORD' };
  }
  return { ok: true, principal: record.principal };
}
