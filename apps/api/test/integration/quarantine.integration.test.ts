import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_CLIENT_OWNER_ID, API_TENANT_B_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresQuarantineRepository } from '../../src/modules/quarantine/postgres-quarantine.repository';

describe('API Postgres quarantine repository (Fase 5.1)', () => {
  const adminUrl = inject('adminDatabaseUrl') as string;
  const runtimeUrl = inject('runtimeDatabaseUrl') as string;
  let admin: ReturnType<typeof createDatabase>;
  let runtime: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    admin = createDatabase(adminUrl);
    runtime = createDatabase(runtimeUrl);
    await seedApiRuntime(admin);
  });

  afterAll(async () => {
    await runtime.end();
    await admin.end();
  });

  it('persists a tenant-scoped entry, allows owner-console by-id access across tenants, and logs access', async () => {
    const writer = new PostgresQuarantineRepository(runtime);

    const entry = await writer.createEntry({
      rawPayload: { headers: {}, source: 'webhook' },
      reason: 'unknown_tenant',
      redactedPayload: null,
      redactionOrder: null,
      reviewedAt: null,
      reviewedBy: null,
      reviewNotes: null,
      retentionUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      sourceIdentifier: 'wh-1',
      sourceType: 'webhook',
      status: 'pending',
      tenantId: API_TENANT_ID,
    });

    // Round-trip through a brand-new repository instance — proves the data
    // lives in Postgres, not in the writer's process memory.
    const reader = new PostgresQuarantineRepository(runtime);

    // getEntry is a by-id owner-console lookup with no tenantId parameter —
    // it must work regardless of which tenant the caller's own context is.
    const fetched = await reader.getEntry(entry.id);
    expect(fetched?.id).toBe(entry.id);
    expect(fetched?.tenantId).toBe(API_TENANT_ID);

    // listEntries with a real tenantId only sees that tenant's rows.
    const listed = await reader.listEntries(API_TENANT_ID, 'pending');
    expect(listed.some((row) => row.id === entry.id)).toBe(true);

    const reviewed = await reader.updateEntry(entry.id, {
      reviewedAt: new Date().toISOString(),
      reviewedBy: API_CLIENT_OWNER_ID,
      status: 'reviewed',
    });
    expect(reviewed.status).toBe('reviewed');
    expect(reviewed.reviewedBy).toBe(API_CLIENT_OWNER_ID);

    const log = await reader.logAccess({
      accessedBy: API_CLIENT_OWNER_ID,
      accessType: 'view',
      ipAddress: null,
      quarantineEntryId: entry.id,
      reason: 'routine review',
      userAgent: null,
    });
    expect(log.quarantineEntryId).toBe(entry.id);

    // logAccess bumps access_count/last_accessed_at on the entry (mirrors the
    // in-memory repository's side effect).
    const afterAccess = await reader.getEntry(entry.id);
    expect(afterAccess?.accessCount).toBe(1);
    expect(afterAccess?.lastAccessedAt).not.toBeNull();

    const logs = await reader.listAccessLogs(entry.id);
    expect(logs.some((row) => row.id === log.id)).toBe(true);

    // deleteEntry exercises the SECURITY DEFINER delete function.
    await reader.deleteEntry(entry.id);
    expect(await reader.getEntry(entry.id)).toBeNull();
  });

  it('persists a genuinely tenant-less entry (unknown tenant) via createEntry(tenantId: null)', async () => {
    const repo = new PostgresQuarantineRepository(runtime);
    const entry = await repo.createEntry({
      rawPayload: { note: 'no tenant could be resolved' },
      reason: 'unknown_tenant',
      redactedPayload: null,
      redactionOrder: null,
      reviewedAt: null,
      reviewedBy: null,
      reviewNotes: null,
      retentionUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      sourceIdentifier: 'wh-unknown',
      sourceType: 'unknown_payload',
      status: 'pending',
      tenantId: null,
    });
    expect(entry.tenantId).toBeNull();

    // The owner-console by-id path (SECURITY DEFINER) still finds it even
    // though it belongs to no tenant.
    const fetched = await repo.getEntry(entry.id);
    expect(fetched?.id).toBe(entry.id);

    await repo.deleteEntry(entry.id);
    expect(await repo.getEntry(entry.id)).toBeNull();
  });

  it('isolates listEntries by tenant under RLS', async () => {
    const repo = new PostgresQuarantineRepository(runtime);
    const entry = await repo.createEntry({
      rawPayload: {},
      reason: 'validation_failed',
      redactedPayload: null,
      redactionOrder: null,
      reviewedAt: null,
      reviewedBy: null,
      reviewNotes: null,
      retentionUntil: new Date(Date.now() + 86_400_000).toISOString(),
      sourceIdentifier: 'wh-2',
      sourceType: 'webhook',
      status: 'pending',
      tenantId: API_TENANT_ID,
    });

    const crossTenantList = await repo.listEntries(API_TENANT_B_ID);
    expect(crossTenantList.some((row) => row.id === entry.id)).toBe(false);

    await repo.deleteEntry(entry.id);
  });
});
