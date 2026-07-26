import { v7 as uuidv7 } from 'uuid';

import {
  type Audience,   type ClientRole,   type MembershipStatus,   type Principal,   type PrincipalStatus,
} from '@chai/auth';
import {
  computeLockedUntil,
  type CredentialLookupResult,
  DEFAULT_LOCKOUT_POLICY,
  type CredentialStore,
  type LockoutOutcome,
} from '@chai/auth/server';
import {
  type Database,
  withPrincipalTransaction,
  withTenantTransaction,
} from '@chai/database';

import type { MfaOperations, TotpFactorState } from './mfa-store';

/**
 * Durable, Postgres-backed credential + MFA store.
 *
 * RLS strategy (migration 0049): `chai.user_credential` / `chai.user_mfa_factor`
 * are platform tables with a role-scoped policy, so the email lookup and the
 * lockout/MFA writes run as plain runtime queries (only chai_app_runtime can
 * touch the rows at all). Building the Principal, however, reads
 * `chai.user_account` (principal-isolated), `chai.platform_role_assignment`
 * (principal-isolated) and `chai.membership` (tenant-isolated) — so those reads
 * happen inside a transaction that sets the exact principal/tenant context for
 * the resolved user. No RLS policy is weakened: role/status stay authoritative
 * in their own tables and are read live, never copied into the credential.
 */
export class PostgresCredentialStore implements CredentialStore, MfaOperations {
  constructor(private readonly database: Database) {}

  async findByEmail(
    email: string,
    audience: Audience,
  ): Promise<CredentialLookupResult | null> {
    const normalized = email.trim().toLowerCase();
    const rows = await this.database<
      {
        userId: string;
        email: string;
        passwordHash: string;
        homeTenantId: string | null;
        lockedUntil: Date | null;
      }[]
    >`
      SELECT
        user_id AS "userId",
        email,
        password_hash AS "passwordHash",
        home_tenant_id AS "homeTenantId",
        locked_until AS "lockedUntil"
      FROM chai.user_credential
      WHERE email = ${normalized}
      LIMIT 1
    `;
    const credential = rows[0];
    if (!credential) {
      return null;
    }

    const principal =
      audience === 'owner-console'
        ? await this.buildOwnerPrincipal(credential.userId)
        : await this.buildClientPrincipal(credential.userId, credential.homeTenantId);
    if (!principal) {
      // Email exists but not for this audience — same null as an unknown email
      // so the caller cannot distinguish (no cross-audience enumeration).
      return null;
    }

    return {
      lockedUntil: credential.lockedUntil,
      record: {
        email: credential.email,
        enabled: principal.status === 'ACTIVE',
        passwordHash: credential.passwordHash,
        principal,
      },
    };
  }

  private async buildOwnerPrincipal(userId: string): Promise<Principal | null> {
    return withPrincipalTransaction(this.database, userId, async (tx) => {
      const [account] = await tx<{ status: string }[]>`
        SELECT status FROM chai.user_account WHERE id = ${userId} LIMIT 1
      `;
      if (!account) {
        return null;
      }
      const [role] = await tx<{ role: string }[]>`
        SELECT role
        FROM chai.platform_role_assignment
        WHERE user_id = ${userId} AND role = 'PLATFORM_OWNER' AND status = 'ACTIVE'
        LIMIT 1
      `;
      if (!role) {
        return null;
      }
      return {
        audience: 'owner-console',
        authenticatedAt: new Date(),
        id: userId,
        kind: 'USER',
        // Password login never satisfies MFA on its own: a platform owner starts
        // REQUIRED and is upgraded to ENROLLED only by the TOTP step-up endpoint.
        mfaState: 'REQUIRED',
        platformRole: 'PLATFORM_OWNER',
        status: toPrincipalStatus(account.status),
      } satisfies Principal;
    });
  }

  private async buildClientPrincipal(
    userId: string,
    homeTenantId: string | null,
  ): Promise<Principal | null> {
    if (!homeTenantId) {
      return null;
    }
    return withTenantTransaction(
      this.database,
      { principalId: userId, tenantId: homeTenantId },
      async (tx) => {
        const [account] = await tx<{ status: string }[]>`
          SELECT status FROM chai.user_account WHERE id = ${userId} LIMIT 1
        `;
        const [membership] = await tx<
          { role: string; status: string; tenantId: string }[]
        >`
          SELECT role, status, tenant_id AS "tenantId"
          FROM chai.membership
          WHERE user_id = ${userId}
          LIMIT 1
        `;
        if (!account || !membership) {
          return null;
        }
        return {
          audience: 'client-portal',
          authenticatedAt: new Date(),
          id: userId,
          kind: 'USER',
          membership: {
            role: membership.role as ClientRole,
            status: membership.status as MembershipStatus,
            tenantId: membership.tenantId,
          },
          status: toPrincipalStatus(account.status),
        } satisfies Principal;
      },
    );
  }

  async recordFailedAttempt(userId: string, now = new Date()): Promise<LockoutOutcome> {
    const lockSeconds = Math.floor(DEFAULT_LOCKOUT_POLICY.lockDurationMs / 1_000);
    const threshold = DEFAULT_LOCKOUT_POLICY.maxFailedAttempts;
    const [row] = await this.database<
      { failedAttemptCount: number; lockedUntil: Date | null }[]
    >`
      UPDATE chai.user_credential
      SET failed_attempt_count = failed_attempt_count + 1,
          locked_until = CASE
            WHEN failed_attempt_count + 1 >= ${threshold}
              THEN now() + ${`${lockSeconds} seconds`}::interval
            ELSE locked_until
          END,
          updated_at = now()
      WHERE user_id = ${userId}
      RETURNING failed_attempt_count AS "failedAttemptCount", locked_until AS "lockedUntil"
    `;
    if (!row) {
      // No credential row (unknown user). Report a synthetic outcome so the
      // caller's timing/flow is unchanged; nothing was written.
      return { failedAttemptCount: 0, lockedUntil: computeLockedUntil(0, now) };
    }
    return { failedAttemptCount: row.failedAttemptCount, lockedUntil: row.lockedUntil };
  }

  async resetFailedAttempts(userId: string): Promise<void> {
    await this.database`
      UPDATE chai.user_credential
      SET failed_attempt_count = 0, locked_until = NULL, updated_at = now()
      WHERE user_id = ${userId}
    `;
  }

  async getTotpFactor(userId: string): Promise<TotpFactorState | null> {
    const [row] = await this.database<
      { secret: string; confirmedAt: Date | null; lastUsedStep: string }[]
    >`
      SELECT secret, confirmed_at AS "confirmedAt", last_used_step AS "lastUsedStep"
      FROM chai.user_mfa_factor
      WHERE user_id = ${userId} AND kind = 'TOTP'
      LIMIT 1
    `;
    if (!row) {
      return null;
    }
    return {
      confirmedAt: row.confirmedAt,
      lastUsedStep: Number(row.lastUsedStep),
      secret: row.secret,
    };
  }

  async startTotpEnrollment(userId: string, secret: string): Promise<void> {
    await this.database`
      INSERT INTO chai.user_mfa_factor (id, user_id, kind, secret)
      VALUES (${uuidv7()}, ${userId}, 'TOTP', ${secret})
      ON CONFLICT (user_id, kind) DO UPDATE
        SET secret = EXCLUDED.secret,
            confirmed_at = NULL,
            last_used_step = 0,
            updated_at = now()
    `;
  }

  async confirmTotpFactor(userId: string, usedStep: number): Promise<void> {
    await this.database`
      UPDATE chai.user_mfa_factor
      SET confirmed_at = now(), last_used_step = ${usedStep}, updated_at = now()
      WHERE user_id = ${userId} AND kind = 'TOTP'
    `;
  }

  async markTotpStepUsed(userId: string, step: number): Promise<void> {
    // Only ever advance the watermark, so a concurrent double-verify cannot roll
    // it back and re-open a replay window.
    await this.database`
      UPDATE chai.user_mfa_factor
      SET last_used_step = ${step}, updated_at = now()
      WHERE user_id = ${userId} AND kind = 'TOTP' AND ${step} > last_used_step
    `;
  }

  async mfaChallengeRequired(userId: string): Promise<boolean> {
    const rows = await this.database<{ present: number }[]>`
      SELECT 1 AS present
      FROM chai.user_mfa_factor
      WHERE user_id = ${userId} AND kind = 'TOTP' AND confirmed_at IS NOT NULL
      LIMIT 1
    `;
    return rows.length > 0;
  }
}

function toPrincipalStatus(status: string): PrincipalStatus {
  return status === 'SUSPENDED' || status === 'DISABLED' ? status : 'ACTIVE';
}
