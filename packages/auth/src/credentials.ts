import type { Audience } from './audiences';
import type { Principal } from './roles';
import { hashPasswordScrypt, isScryptHash, verifyPasswordScrypt } from './scrypt';

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

/**
 * Verifies a password against either a scrypt (`scrypt$…`) or legacy pbkdf2
 * (`pbkdf2$…`) hash, so a store can migrate hash schemes without a flag day.
 */
export async function verifyPasswordHash(
  password: string,
  stored: string,
): Promise<boolean> {
  if (isScryptHash(stored)) {
    return verifyPasswordScrypt(password, stored);
  }
  return verifyPassword(password, stored);
}

let dummyHashPromise: Promise<string> | null = null;

function dummyScryptHash(): Promise<string> {
  dummyHashPromise ??= hashPasswordScrypt('timing-uniformity-placeholder');
  return dummyHashPromise;
}

/**
 * Runs one scrypt verification against a throwaway hash so the unknown-user,
 * disabled, and locked branches cost the same as a real password check. Without
 * this, response timing would reveal whether an email exists (user enumeration).
 */
async function burnVerify(password: string): Promise<void> {
  await verifyPasswordScrypt(password, await dummyScryptHash());
}

export interface LockoutPolicy {
  /** Consecutive failures that trigger a temporary lock. */
  maxFailedAttempts: number;
  /** How long the lock lasts, in milliseconds. */
  lockDurationMs: number;
}

export const DEFAULT_LOCKOUT_POLICY: LockoutPolicy = {
  maxFailedAttempts: 5,
  lockDurationMs: 15 * 60 * 1_000,
};

/**
 * Shared lock computation so every store derives `locked_until` identically:
 * once the failure count reaches the threshold, lock for the configured window.
 */
export function computeLockedUntil(
  failedAttemptCount: number,
  now: Date,
  policy: LockoutPolicy = DEFAULT_LOCKOUT_POLICY,
): Date | null {
  return failedAttemptCount >= policy.maxFailedAttempts
    ? new Date(now.getTime() + policy.lockDurationMs)
    : null;
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
  /**
   * When set and in the future, the account is temporarily locked from prior
   * failed attempts and login must be refused before checking the password.
   */
  lockedUntil?: Date | null;
}

export interface LockoutOutcome {
  lockedUntil: Date | null;
  failedAttemptCount: number;
}

export interface CredentialStore {
  findByEmail(email: string, audience: Audience): Promise<CredentialLookupResult | null>;
  /**
   * Records one failed password attempt for the user and returns the resulting
   * lock state. Optional so simple stores can omit lockout; when present,
   * {@link authenticateCredentials} uses it to enforce lockout.
   */
  recordFailedAttempt?(userId: string, now?: Date): Promise<LockoutOutcome>;
  /** Clears the failed-attempt counter after a successful login. Optional. */
  resetFailedAttempts?(userId: string): Promise<void>;
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
  /** Reference time, injectable for tests. Defaults to now. */
  now?: Date;
}

export interface AuthenticateCredentialsFailure {
  ok: false;
  reason:
    | 'UNKNOWN_CREDENTIALS'
    | 'INVALID_PASSWORD'
    | 'ACCOUNT_DISABLED'
    | 'ACCOUNT_LOCKED';
}

export interface AuthenticateCredentialsSuccess {
  ok: true;
  principal: Principal;
}

export type AuthenticateCredentialsResult =
  | AuthenticateCredentialsFailure
  | AuthenticateCredentialsSuccess;

/**
 * Constant-message credential check. Every failure branch runs exactly one
 * scrypt verification (real or dummy) so unknown-email, wrong-password,
 * disabled, and locked all take the same time — no user enumeration by timing.
 * When the store supports it, consecutive failures raise a counter that
 * temporarily locks the account.
 */
export async function authenticateCredentials({
  email,
  password,
  audience,
  store,
  now = new Date(),
}: AuthenticateCredentialsInput): Promise<AuthenticateCredentialsResult> {
  const lookup = await store.findByEmail(normalizeEmail(email), audience);
  if (!lookup) {
    await burnVerify(password);
    return { ok: false, reason: 'UNKNOWN_CREDENTIALS' };
  }
  const { record } = lookup;
  if (lookup.lockedUntil && lookup.lockedUntil.getTime() > now.getTime()) {
    await burnVerify(password);
    return { ok: false, reason: 'ACCOUNT_LOCKED' };
  }
  if (!record.enabled) {
    await burnVerify(password);
    return { ok: false, reason: 'ACCOUNT_DISABLED' };
  }
  if (!record.passwordHash) {
    await burnVerify(password);
    return { ok: false, reason: 'UNKNOWN_CREDENTIALS' };
  }
  const valid = await verifyPasswordHash(password, record.passwordHash);
  if (!valid) {
    const outcome = await store.recordFailedAttempt?.(record.principal.id, now);
    if (
      outcome?.lockedUntil &&
      outcome.lockedUntil.getTime() > now.getTime()
    ) {
      return { ok: false, reason: 'ACCOUNT_LOCKED' };
    }
    return { ok: false, reason: 'INVALID_PASSWORD' };
  }
  await store.resetFailedAttempts?.(record.principal.id);
  return { ok: true, principal: record.principal };
}
