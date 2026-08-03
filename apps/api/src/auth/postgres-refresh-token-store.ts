import type { Database } from '@chai/database';

import type { RefreshTokenEntry, RefreshTokenStore } from './refresh-token-store';

/**
 * Durable, Postgres-backed refresh token store (migration 0083).
 *
 * Backs rotation + reuse detection across every API replica, unlike the
 * in-memory store which lost all history on restart and could not be shared
 * across replicas (REQ-10-013). Stores `jti` as-is, not a hash of it: `jti`
 * is part of the JWT payload (readable, not a secret by itself), and the
 * token's HMAC signature — which is what makes the refresh token
 * bearer-equivalent to a password — is verified by `verifyRefreshToken()`
 * before this store is ever consulted.
 */
export class PostgresRefreshTokenStore implements RefreshTokenStore {
  constructor(private readonly database: Database) {}

  async record(entry: RefreshTokenEntry): Promise<void> {
    await this.database.begin(async (tx) => {
      await tx`
        INSERT INTO chai.refresh_token_family (family_id, principal_id)
        VALUES (${entry.familyId}, ${entry.principalId})
        ON CONFLICT (family_id) DO NOTHING
      `;
      await tx`
        INSERT INTO chai.refresh_token
          (jti, family_id, principal_id, expires_at, revoked_at)
        VALUES (
          ${entry.jti},
          ${entry.familyId},
          ${entry.principalId},
          to_timestamp(${entry.expiresAt / 1000}),
          ${entry.revoked ? new Date() : null}
        )
      `;
    });
  }

  async isRevoked(jti: string): Promise<boolean> {
    const rows = await this.database<{ revokedAt: Date | null }[]>`
      SELECT revoked_at AS "revokedAt"
      FROM chai.refresh_token
      WHERE jti = ${jti}
      LIMIT 1
    `;
    // A jti this store has never seen is not "revoked" — verifyRefreshToken
    // already rejected malformed/expired/mis-signed tokens before this is
    // consulted, so an unknown-but-validly-signed jti falls through to the
    // normal rotation path rather than being treated as reuse.
    return rows[0]?.revokedAt != null;
  }

  async getFamilyId(jti: string): Promise<string | null> {
    const rows = await this.database<{ familyId: string }[]>`
      SELECT family_id AS "familyId"
      FROM chai.refresh_token
      WHERE jti = ${jti}
      LIMIT 1
    `;
    return rows[0]?.familyId ?? null;
  }

  async revoke(jti: string): Promise<void> {
    await this.database`
      UPDATE chai.refresh_token
      SET revoked_at = now()
      WHERE jti = ${jti} AND revoked_at IS NULL
    `;
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.database`
      UPDATE chai.refresh_token
      SET revoked_at = now()
      WHERE family_id = ${familyId} AND revoked_at IS NULL
    `;
  }

  async revokeAllForPrincipal(principalId: string): Promise<void> {
    await this.database`
      UPDATE chai.refresh_token
      SET revoked_at = now()
      WHERE principal_id = ${principalId} AND revoked_at IS NULL
    `;
  }
}
