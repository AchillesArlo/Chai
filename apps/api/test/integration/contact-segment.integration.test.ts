import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_TENANT_B_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresContactSegmentRepository } from '../../src/modules/contact-segment/postgres-contact-segment.repository';

/**
 * D2: contact-segment moved from in-memory to Postgres. It is the one remaining
 * in-memory module that is both consumed by the frontend (client-portal
 * customers page GET /client/v1/contact-segments) and has a fully tenant-scoped
 * repository interface, so it persists cleanly against chai.contact_segment
 * (0028) under RLS FORCE. This test instantiates the repository directly (no
 * bootstrap import) and runs against the runtime connection, so the
 * NOBYPASSRLS role must satisfy the tenant_isolation policy on every statement.
 */
describe('PostgresContactSegmentRepository (D2 persistence)', () => {
  const adminUrl = inject('adminDatabaseUrl') as string;
  const runtimeUrl = inject('runtimeDatabaseUrl') as string;
  let admin: ReturnType<typeof createDatabase>;
  let runtime: ReturnType<typeof createDatabase>;
  let repo: PostgresContactSegmentRepository;

  beforeAll(async () => {
    admin = createDatabase(adminUrl);
    runtime = createDatabase(runtimeUrl);
    await seedApiRuntime(admin);
    repo = new PostgresContactSegmentRepository(runtime);
  });

  afterAll(async () => {
    await runtime.end();
    await admin.end();
  });

  it('round-trips a segment: create, get, list, update, delete', async () => {
    const created = await repo.createSegment(API_TENANT_ID, {
      description: 'High value',
      filterRules: { minSpend: 1_000_000 },
      name: 'VIP customers',
      tenantId: API_TENANT_ID,
    });
    expect(created.id).toBeTruthy();
    expect(created.memberCount).toBe(0);
    expect(created.filterRules).toEqual({ minSpend: 1_000_000 });

    const fetched = await repo.getSegment(API_TENANT_ID, created.id);
    expect(fetched?.name).toBe('VIP customers');

    const listed = await repo.listSegments(API_TENANT_ID);
    expect(listed.some((segment) => segment.id === created.id)).toBe(true);

    const updated = await repo.updateSegment(API_TENANT_ID, created.id, {
      memberCount: 5,
      name: 'VIP renamed',
    });
    expect(updated.name).toBe('VIP renamed');
    expect(updated.memberCount).toBe(5);
    // A field absent from the patch survives the merge unchanged.
    expect(updated.filterRules).toEqual({ minSpend: 1_000_000 });

    await repo.deleteSegment(API_TENANT_ID, created.id);
    expect(await repo.getSegment(API_TENANT_ID, created.id)).toBeNull();
  });

  it('isolates tenants: tenant A never sees tenant B rows', async () => {
    const ownSegment = await repo.createSegment(API_TENANT_ID, {
      description: null,
      filterRules: {},
      name: 'Tenant A only',
      tenantId: API_TENANT_ID,
    });
    const foreignSegment = await repo.createSegment(API_TENANT_B_ID, {
      description: null,
      filterRules: {},
      name: 'Tenant B only',
      tenantId: API_TENANT_B_ID,
    });

    const tenantAIds = (await repo.listSegments(API_TENANT_ID)).map(
      (segment) => segment.id,
    );
    expect(tenantAIds).toContain(ownSegment.id);
    expect(tenantAIds).not.toContain(foreignSegment.id);

    // A cross-tenant read by id returns nothing.
    expect(await repo.getSegment(API_TENANT_B_ID, ownSegment.id)).toBeNull();

    await repo.deleteSegment(API_TENANT_ID, ownSegment.id);
    await repo.deleteSegment(API_TENANT_B_ID, foreignSegment.id);
  });
});
