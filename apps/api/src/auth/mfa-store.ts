/**
 * MFA persistence surface, layered on top of the @chai/auth CredentialStore.
 *
 * Kept here (not in @chai/auth) because these are storage operations, whereas
 * the TOTP cryptography and the login/lockout contract live in the auth
 * package. Both the in-memory and Postgres credential stores implement it, so
 * the DI type is `CredentialStore & MfaOperations` and controllers never guard
 * on optional methods.
 */

export interface TotpFactorState {
  /** base32 shared secret. Never logged. */
  secret: string;
  /** Null until the user proves possession with a valid code. */
  confirmedAt: Date | null;
  /** Highest step already consumed; a code at or below this is a replay. */
  lastUsedStep: number;
}

export interface MfaOperations {
  /** The user's TOTP factor, confirmed or pending, or null if none. */
  getTotpFactor(userId: string): Promise<TotpFactorState | null>;
  /** Create or replace a pending (unconfirmed) TOTP factor with a new secret. */
  startTotpEnrollment(userId: string, secret: string): Promise<void>;
  /** Mark the pending factor confirmed and record the step used to confirm. */
  confirmTotpFactor(userId: string, usedStep: number): Promise<void>;
  /** Advance the replay watermark after a successful login verification. */
  markTotpStepUsed(userId: string, step: number): Promise<void>;
  /** True when the user has a confirmed factor and must present a code at login. */
  mfaChallengeRequired(userId: string): Promise<boolean>;
}
