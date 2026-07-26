import {
  type Audience,
  type CredentialRecord,
  type CredentialStore,
  hashPassword,
} from '@chai/auth';

import { API_CLIENT_AGENT_ID, API_CLIENT_OWNER_ID, API_TENANT_ID } from '../database/api-ids';

/**
 * ponytail: in-memory credential store seeded with deterministic dev accounts.
 * Swap with the Postgres-backed store (CredentialStore contract unchanged)
 * when the iam/users table lands a password_hash column — interface is stable.
 */

const SEED_PASSWORD = 'Password123!';

async function seedRecords(): Promise<readonly CredentialRecord[]> {
  const passwordHash = await hashPassword(SEED_PASSWORD);
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

const revokedJTIs = new Set<string>();

export class InMemoryCredentialStore implements CredentialStore {
  async findByEmail(
    email: string,
    audience: Audience,
  ): Promise<{ record: CredentialRecord } | null> {
    const records = await seed();
    const normalized = email.trim().toLowerCase();
    const match = records.find(
      (record) => record.email === normalized && record.principal.audience === audience,
    );
    return match ? { record: match } : null;
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
    revokedJTIs.delete(jti);
  }

  async revokeRefreshToken(jti: string): Promise<void> {
    revokedJTIs.add(jti);
  }

  async isRefreshTokenRevoked(jti: string): Promise<boolean> {
    return revokedJTIs.has(jti);
  }
}

export const SEED_PASSWORD_HINT = SEED_PASSWORD;
