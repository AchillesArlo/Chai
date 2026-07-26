import postgres from 'postgres';
import { beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase, readActiveTenantRoster } from '../src';
import { DATABASE_IDS, seedFoundation } from './fixtures';

/**
 * Migration 0050: chai.active_tenant_roster() is the ONLY sanctioned cross-tenant
 * read for the worker runtime. These tests pin its contract:
 *  - it returns the ACTIVE tenants (and only those) with the service principal;
 *  - the worker role MAY execute it;
 *  - the app runtime, the analytics reader, and PUBLIC may NOT;
 *  - the worker still cannot read chai.tenant directly, so the function is the
 *    sole path across the RLS boundary.
 */

// Well-known platform worker service principal returned for every tenant. Must
// stay in sync with migration 0050. A valid UUIDv7 so it passes ActorIdSchema.
const SERVICE_PRINCIPAL_ID = '00000000-0000-7000-8000-000000000001';

const ROSTER_IDS = {
  // A SUSPENDED tenant that must be absent from the roster. Valid UUIDv7,
  // distinct from every fixtures id.
  suspendedTenant: '01890f47-9b3c-7ccc-98e8-1234567890f0',
} as const;

describe('chai.active_tenant_roster() SECURITY DEFINER function', () => {
  beforeAll(async () => {
    await seedFoundation(inject('adminDatabaseUrl'));

    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });
    try {
      await admin`
        INSERT INTO chai.tenant (id, slug, name, status)
        VALUES (
          ${ROSTER_IDS.suspendedTenant},
          'roster-suspended-tenant',
          'Roster Suspended Tenant',
          'SUSPENDED'
        )
        ON CONFLICT (id) DO NOTHING
      `;
    } finally {
      await admin.end();
    }
  });

  it('returns active tenants with the service principal to the worker role', async () => {
    const worker = createDatabase(inject('workerDatabaseUrl'));

    try {
      const roster = await readActiveTenantRoster(worker);
      const tenantIds = roster.map((entry) => entry.tenantId);

      expect(tenantIds).toContain(DATABASE_IDS.tenantA);
      expect(tenantIds).toContain(DATABASE_IDS.tenantB);
      // A non-ACTIVE tenant must never appear in the roster.
      expect(tenantIds).not.toContain(ROSTER_IDS.suspendedTenant);
      // Every entry carries the platform service principal.
      expect(roster.length).toBeGreaterThan(0);
      expect(
        roster.every((entry) => entry.principalId === SERVICE_PRINCIPAL_ID),
      ).toBe(true);
    } finally {
      await worker.end();
    }
  });

  it('denies EXECUTE to the app runtime role (has schema usage, lacks function grant)', async () => {
    const app = createDatabase(inject('runtimeDatabaseUrl'));

    try {
      await expect(
        app`SELECT tenant_id, principal_id FROM chai.active_tenant_roster()`,
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await app.end();
    }
  });

  it('denies EXECUTE to the analytics reader and to PUBLIC', async () => {
    const analytics = createDatabase(inject('analyticsDatabaseUrl'));

    try {
      await expect(
        analytics`SELECT tenant_id, principal_id FROM chai.active_tenant_roster()`,
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await analytics.end();
    }
  });

  it('keeps the worker role unable to read chai.tenant directly (function is the only path)', async () => {
    const worker = createDatabase(inject('workerDatabaseUrl'));

    try {
      await expect(worker`SELECT id FROM chai.tenant`).rejects.toThrow(
        /permission denied/i,
      );
    } finally {
      await worker.end();
    }
  });
});
