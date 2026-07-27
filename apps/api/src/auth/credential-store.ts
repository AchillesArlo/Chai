import {
  type Audience,
} from '@chai/auth';
import {
  computeLockedUntil,
  type CredentialLookupResult,
  type CredentialRecord,
  type CredentialStore,
  hashPasswordScrypt,
  type LockoutOutcome,
} from '@chai/auth/server';

import { API_CLIENT_AGENT_ID, API_CLIENT_OWNER_ID, API_TENANT_ID } from '../database/api-ids';
import { decryptMfaSecret, encryptMfaSecret } from './mfa-secret-crypto';
import type { MfaOperations, TotpFactorState } from './mfa-store';

/**
 * ponytail: in-memory credential store for local/test only. Accounts, lockout
 * counters, and enrolled MFA factors live in per-instance maps and reset on
 * restart. `createCredentialStore` swaps in the Postgres store whenever a
 * DATABASE handle exists; the CredentialStore + MfaOperations contract is the
 * same, so callers do not branch.
 */

const SEED_PASSWORD = 'Password123!';

async function seedRecords(): Promise<readonly CredentialRecord[]> {
  const passwordHash = await hashPasswordScrypt(SEED_PASSWORD);
  return [
    {
      email: 'owner@chai.local',
      enabled: true,
      passwordHash,
      principal: {
        audience: 'owner-console',
        authenticatedAt: new Date(0),
        id: '01890f47-9b3c-7cc2-98e8-1234567892ff',
        kind: 'USER',
        mfaState: 'ENROLLED',
        platformRole: 'PLATFORM_OWNER',
        status: 'ACTIVE',
      },
    },
    {
      email: 'client@chai.local',
      enabled: true,
      passwordHash,
      principal: {
        audience: 'client-portal',
        authenticatedAt: new Date(0),
        id: API_CLIENT_OWNER_ID,
        kind: 'USER',
        membership: {
          role: 'CLIENT_OWNER',
          status: 'ACTIVE',
          tenantId: API_TENANT_ID,
        },
        status: 'ACTIVE',
      },
    },
    {
      email: 'agent@chai.local',
      enabled: true,
      passwordHash,
      principal: {
        audience: 'client-portal',
        authenticatedAt: new Date(0),
        id: API_CLIENT_AGENT_ID,
        kind: 'USER',
        membership: {
          role: 'CLIENT_AGENT',
          status: 'ACTIVE',
          tenantId: API_TENANT_ID,
        },
        status: 'ACTIVE',
      },
    },
    {
      email: 'disabled@chai.local',
      enabled: false,
      passwordHash,
      principal: {
        audience: 'client-portal',
        authenticatedAt: new Date(0),
        id: API_CLIENT_OWNER_ID,
        kind: 'USER',
        membership: {
          role: 'CLIENT_VIEWER',
          status: 'SUSPENDED',
          tenantId: API_TENANT_ID,
        },
        status: 'ACTIVE',
      },
    },
  ] as const;
}

let cachedSeedPromise: Promise<readonly CredentialRecord[]> | null = null;

function seed(): Promise<readonly CredentialRecord[]> {
  if (!cachedSeedPromise) {
    cachedSeedPromise = seedRecords();
  }
  return cachedSeedPromise;
}

interface LockoutState {
  failedAttemptCount: number;
  lockedUntil: Date | null;
}

export class InMemoryCredentialStore implements CredentialStore, MfaOperations {
  private readonly revokedJTIs = new Set<string>();
  private readonly lockouts = new Map<string, LockoutState>();
  private readonly totpFactors = new Map<string, TotpFactorState>();

  async findByEmail(
    email: string,
    audience: Audience,
  ): Promise<CredentialLookupResult | null> {
    const records = await seed();
    const normalized = email.trim().toLowerCase();
    const match = records.find(
      (record) => record.email === normalized && record.principal.audience === audience,
    );
    if (!match) {
      return null;
    }
    return {
      record: match,
      lockedUntil: this.lockouts.get(match.principal.id)?.lockedUntil ?? null,
    };
  }

  async recordFailedAttempt(userId: string, now = new Date()): Promise<LockoutOutcome> {
    const current = this.lockouts.get(userId) ?? { failedAttemptCount: 0, lockedUntil: null };
    const failedAttemptCount = current.failedAttemptCount + 1;
    const lockedUntil = computeLockedUntil(failedAttemptCount, now);
    this.lockouts.set(userId, { failedAttemptCount, lockedUntil });
    return { failedAttemptCount, lockedUntil };
  }

  async resetFailedAttempts(userId: string): Promise<void> {
    this.lockouts.delete(userId);
  }

  async getTotpFactor(userId: string): Promise<TotpFactorState | null> {
    const factor = this.totpFactors.get(userId);
    if (!factor) {
      return null;
    }
    // Stored encrypted (like the durable store); hand callers the plaintext.
    return { ...factor, secret: decryptMfaSecret(factor.secret) };
  }

  async startTotpEnrollment(userId: string, secret: string): Promise<void> {
    // encryptMfaSecret throws without MFA_SECRET_KEY, so enrolment fails hard
    // rather than persisting a plaintext secret.
    this.totpFactors.set(userId, {
      confirmedAt: null,
      failedAttemptCount: 0,
      lastUsedStep: 0,
      lockedUntil: null,
      secret: encryptMfaSecret(secret),
    });
  }

  async confirmTotpFactor(userId: string, usedStep: number): Promise<void> {
    const factor = this.totpFactors.get(userId);
    if (!factor) {
      return;
    }
    this.totpFactors.set(userId, {
      ...factor,
      confirmedAt: new Date(),
      lastUsedStep: usedStep,
    });
  }

  async markTotpStepUsed(userId: string, step: number): Promise<void> {
    const factor = this.totpFactors.get(userId);
    if (!factor) {
      return;
    }
    this.totpFactors.set(userId, { ...factor, lastUsedStep: step });
  }

  async mfaChallengeRequired(userId: string): Promise<boolean> {
    return this.totpFactors.get(userId)?.confirmedAt != null;
  }

  async recordMfaFailure(userId: string, now = new Date()): Promise<LockoutOutcome> {
    const factor = this.totpFactors.get(userId);
    if (!factor) {
      return { failedAttemptCount: 0, lockedUntil: computeLockedUntil(0, now) };
    }
    const failedAttemptCount = factor.failedAttemptCount + 1;
    const lockedUntil = computeLockedUntil(failedAttemptCount, now);
    this.totpFactors.set(userId, { ...factor, failedAttemptCount, lockedUntil });
    return { failedAttemptCount, lockedUntil };
  }

  async resetMfaFailures(userId: string): Promise<void> {
    const factor = this.totpFactors.get(userId);
    if (!factor) {
      return;
    }
    this.totpFactors.set(userId, {
      ...factor,
      failedAttemptCount: 0,
      lockedUntil: null,
    });
  }

  async recordRefreshToken(
    principalId: string,
    jti: string,
    expiresAt: number,
  ): Promise<void> {
    // ponytail: in-memory revocation only; principalId/expiresAt ignored
    // until a durable store replaces this implementation.
    void principalId;
    void expiresAt;
    this.revokedJTIs.delete(jti);
  }

  async revokeRefreshToken(jti: string): Promise<void> {
    this.revokedJTIs.add(jti);
  }

  async isRefreshTokenRevoked(jti: string): Promise<boolean> {
    return this.revokedJTIs.has(jti);
  }
}

export const SEED_PASSWORD_HINT = SEED_PASSWORD;
