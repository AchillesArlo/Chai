import type { Principal } from '@chai/auth';

/**
 * Tracks issued refresh tokens so logout can invalidate them and refresh
 * can detect replay/rotation. ponytail: in-memory; backed by a revocation
 * table (token_jti) before production traffic.
 */

export interface RefreshTokenEntry {
  jti: string;
  principalId: string;
  expiresAt: number;
  revoked: boolean;
}

export class RefreshTokenStore {
  private readonly entries = new Map<string, RefreshTokenEntry>();

  record(entry: RefreshTokenEntry): void {
    this.entries.set(entry.jti, { ...entry });
  }

  revoke(jti: string): boolean {
    const entry = this.entries.get(jti);
    if (!entry) return false;
    entry.revoked = true;
    return true;
  }

  isRevoked(jti: string): boolean {
    return this.entries.get(jti)?.revoked ?? false;
  }

  revokeAllForPrincipal(principalId: string, principal: Principal): void {
    for (const entry of this.entries.values()) {
      if (entry.principalId === principalId && this.matchesPrincipal(entry, principal)) {
        entry.revoked = true;
      }
    }
  }

  private matchesPrincipal(entry: RefreshTokenEntry, principal: Principal): boolean {
    return entry.principalId === principal.id;
  }
}

export const REFRESH_TOKEN_STORE = new RefreshTokenStore();
