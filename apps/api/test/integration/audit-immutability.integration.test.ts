import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_TENANT_B_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresAuditImmutabilityRepository } from '../../src/modules/audit-immutability/postgres-audit-immutability.repository';

describe('API Postgres audit-immutability repository (D1)', () => {
  const adminUrl = inject('adminDatabaseUrl') as string;
  const runtimeUrl = inject('runtimeDatabaseUrl') as string;
  let admin: ReturnType<typeof createDatabase>;
  let runtime: ReturnType<typeof createDatabase>;

  const base = {
    action: 'create' as const,
    actorId: 'system-1',
    actorType: 'system' as const,
    correlationId: null,
    ipAddress: '127.0.0.1',
    metadata: {},
    previousState: null,
    userAgent: 'integration',
  };

  beforeAll(async () => {
    admin = createDatabase(adminUrl);
    runtime = createDatabase(runtimeUrl);
    await seedApiRuntime(admin);
  });

  afterAll(async () => {
    await runtime.end();
    await admin.end();
  });

  it('persists a hash-chained entry and reads it back through a fresh repo', async () => {
    const writer = new PostgresAuditImmutabilityRepository(runtime);

    const first = await writer.createEntry({
      ...base,
      eventType: 'user.created',
      newState: { name: 'Zed', role: 'admin' },
      resourceId: 'user-1',
      resourceType: 'user',
      tenantId: API_TENANT_ID,
    });
    const second = await writer.createEntry({
      ...base,
      action: 'update',
      eventType: 'user.updated',
      newState: { name: 'Zed', role: 'owner' },
      resourceId: 'user-1',
      resourceType: 'user',
      tenantId: API_TENANT_ID,
    });

    expect(first.previousHash).toBeNull();
    expect(second.previousHash).toBe(first.hash);

    // A brand-new instance has no in-process state: seeing the row proves it
    // lives in Postgres, not a per-process Map.
    const reader = new PostgresAuditImmutabilityRepository(runtime);
    const listed = await reader.listEntries(API_TENANT_ID);
    expect(listed.some((entry) => entry.id === first.id)).toBe(true);
    expect(listed.some((entry) => entry.id === second.id)).toBe(true);

    const fetched = await reader.getEntry(API_TENANT_ID, first.id);
    expect(fetched?.newState).toEqual({ name: 'Zed', role: 'admin' });

    const check = await reader.verifyChain(API_TENANT_ID, 'auditor-1');
    expect(check.status).toBe('passed');
    expect(check.brokenChains).toBe(0);
    expect(check.verifiedEntries).toBe(check.totalEntries);
    expect(check.totalEntries).toBeGreaterThanOrEqual(2);
  });

  it('isolates audit entries by tenant under RLS', async () => {
    const repo = new PostgresAuditImmutabilityRepository(runtime);
    const mine = await repo.createEntry({
      ...base,
      eventType: 'secret.event',
      newState: { secret: true },
      resourceId: 'secret-1',
      resourceType: 'secret',
      tenantId: API_TENANT_ID,
    });

    // Tenant B, on the same NOBYPASSRLS runtime role, cannot see tenant A's row.
    const crossList = await repo.listEntries(API_TENANT_B_ID);
    expect(crossList.some((entry) => entry.id === mine.id)).toBe(false);
    const crossGet = await repo.getEntry(API_TENANT_B_ID, mine.id);
    expect(crossGet).toBeNull();
  });

  it('rejects UPDATE and DELETE at the database (append-only trigger)', async () => {
    const repo = new PostgresAuditImmutabilityRepository(runtime);
    const entry = await repo.createEntry({
      ...base,
      eventType: 'immutable.check',
      newState: { attempt: 'mutate' },
      resourceId: 'res-immut',
      resourceType: 'thing',
      tenantId: API_TENANT_ID,
    });

    // admin is the superuser: it bypasses RLS, so this proves the TRIGGER (not a
    // missing grant) is what forbids mutation -- triggers fire even for superuser.
    await expect(
      admin`UPDATE chai.audit_entry SET event_type = 'tampered' WHERE id = ${entry.id}`,
    ).rejects.toThrow(/append-only/i);
    await expect(
      admin`DELETE FROM chai.audit_entry WHERE id = ${entry.id}`,
    ).rejects.toThrow(/append-only/i);

    // The row is still intact and the chain still verifies.
    const stillThere = await repo.getEntry(API_TENANT_ID, entry.id);
    expect(stillThere?.id).toBe(entry.id);
  });
});
