/**
 * Tracks issued refresh tokens so logout can invalidate them and refresh can
 * detect rotation/replay. A "family" is the chain of tokens produced by
 * successive rotations of one original login: the family id is the jti of
 * the token issued at login, and every rotation keeps that same family id.
 *
 * Reusing an already-rotated (or already-revoked) token is the signal that a
 * token was stolen, so `recordReuse` revokes every token in that family, not
 * just the one that was replayed — this is the fix for the bug where reuse
 * only threw without actually revoking the family (REQ-10-013).
 */
export interface RefreshTokenEntry {
  jti: string;
  familyId: string;
  principalId: string;
  expiresAt: number;
  revoked: boolean;
}

export interface RefreshTokenStore {
  /** Records a freshly issued token. `familyId` is `jti` for a login-issued token. */
  record(entry: RefreshTokenEntry): Promise<void>;
  /** True when this jti has already been revoked (rotated away, reused, or logged out). */
  isRevoked(jti: string): Promise<boolean>;
  /** The family this jti belongs to, or null if this store has never seen it. */
  getFamilyId(jti: string): Promise<string | null>;
  /** Revokes exactly this jti (normal rotation of a still-valid token). */
  revoke(jti: string): Promise<void>;
  /**
   * Reuse of an already-rotated/revoked token was detected: revoke every
   * token in its family so a stolen token cannot be used again even if the
   * legitimate holder already rotated past it.
   */
  revokeFamily(familyId: string): Promise<void>;
  /** Revokes every token for a principal (logout, account disable). */
  revokeAllForPrincipal(principalId: string): Promise<void>;
}

export class InMemoryRefreshTokenStore implements RefreshTokenStore {
  private readonly entries = new Map<string, RefreshTokenEntry>();

  async record(entry: RefreshTokenEntry): Promise<void> {
    this.entries.set(entry.jti, { ...entry });
  }

  async isRevoked(jti: string): Promise<boolean> {
    return this.entries.get(jti)?.revoked ?? false;
  }

  async getFamilyId(jti: string): Promise<string | null> {
    return this.entries.get(jti)?.familyId ?? null;
  }

  async revoke(jti: string): Promise<void> {
    const entry = this.entries.get(jti);
    if (entry) {
      entry.revoked = true;
    }
  }

  async revokeFamily(familyId: string): Promise<void> {
    for (const entry of this.entries.values()) {
      if (entry.familyId === familyId) {
        entry.revoked = true;
      }
    }
  }

  async revokeAllForPrincipal(principalId: string): Promise<void> {
    for (const entry of this.entries.values()) {
      if (entry.principalId === principalId) {
        entry.revoked = true;
      }
    }
  }
}
