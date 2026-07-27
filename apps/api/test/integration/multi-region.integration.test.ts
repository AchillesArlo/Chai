import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_CLIENT_OWNER_ID, API_TENANT_B_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresMultiRegionRepository } from '../../src/modules/multi-region/postgres-multi-region.repository';

describe('API Postgres multi-region repository (Fase 4.4)', () => {
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

  it('persists a tenant region, a routing rule, a replication status and a residency audit across a new instance', async () => {
    const writer = new PostgresMultiRegionRepository(runtime);

    const region = await writer.createTenantRegion(API_TENANT_ID, {
      dataResidencyPolicy: 'eu-only',
      isPrimary: true,
      region: 'eu-west-1',
      tenantId: API_TENANT_ID,
    });

    const rule = await writer.createRoutingRule(API_TENANT_ID, {
      isActive: true,
      priority: 10,
      routingType: 'latency',
      sourceRegion: 'eu-west-1',
      targetRegion: 'eu-central-1',
      tenantId: API_TENANT_ID,
    });

    const replication = await writer.upsertReplicationStatus(API_TENANT_ID, {
      entityId: 'conversation-1',
      entityType: 'conversation',
      lastReplicatedAt: null,
      replicationLagMs: null,
      sourceRegion: 'eu-west-1',
      status: 'pending',
      targetRegion: 'eu-central-1',
      tenantId: API_TENANT_ID,
    });

    const audit = await writer.createResidencyAudit(API_TENANT_ID, {
      action: 'create',
      complianceCheckPassed: true,
      entityId: 'conversation-1',
      entityType: 'conversation',
      performedAt: new Date().toISOString(),
      performedBy: API_CLIENT_OWNER_ID,
      region: 'eu-west-1',
      tenantId: API_TENANT_ID,
      violationReason: null,
    });

    // Round-trip through a brand-new repository instance — proves the data
    // lives in Postgres, not in the writer's process memory.
    const reader = new PostgresMultiRegionRepository(runtime);

    const fetchedRegion = await reader.getTenantRegion(API_TENANT_ID, 'eu-west-1');
    expect(fetchedRegion?.id).toBe(region.id);

    const rules = await reader.listRoutingRules(API_TENANT_ID);
    expect(rules.some((row) => row.id === rule.id)).toBe(true);

    const replications = await reader.listReplicationStatus(
      API_TENANT_ID,
      'conversation',
      'conversation-1',
    );
    expect(replications.some((row) => row.id === replication.id)).toBe(true);

    // upsertReplicationStatus with the same unique key updates, not duplicates.
    const updatedReplication = await reader.upsertReplicationStatus(API_TENANT_ID, {
      entityId: 'conversation-1',
      entityType: 'conversation',
      lastReplicatedAt: new Date().toISOString(),
      replicationLagMs: 120,
      sourceRegion: 'eu-west-1',
      status: 'synced',
      targetRegion: 'eu-central-1',
      tenantId: API_TENANT_ID,
    });
    expect(updatedReplication.id).toBe(replication.id);
    expect(updatedReplication.status).toBe('synced');

    const audits = await reader.listResidencyAudit(API_TENANT_ID, 'conversation');
    expect(audits.some((row) => row.id === audit.id)).toBe(true);

    // deleteRoutingRule / deleteTenantRegion exercise the DELETE grant.
    await reader.deleteRoutingRule(API_TENANT_ID, rule.id);
    expect((await reader.listRoutingRules(API_TENANT_ID)).some((row) => row.id === rule.id)).toBe(
      false,
    );
    await reader.deleteTenantRegion(API_TENANT_ID, region.id);
    expect(await reader.getTenantRegion(API_TENANT_ID, 'eu-west-1')).toBeNull();
  });

  it('isolates tenant regions and routing rules by tenant under RLS', async () => {
    const repo = new PostgresMultiRegionRepository(runtime);
    const region = await repo.createTenantRegion(API_TENANT_ID, {
      dataResidencyPolicy: 'standard',
      isPrimary: true,
      region: 'us-east-1',
      tenantId: API_TENANT_ID,
    });

    const crossTenantRegions = await repo.listTenantRegions(API_TENANT_B_ID);
    expect(crossTenantRegions.some((row) => row.id === region.id)).toBe(false);
    expect(await repo.getTenantRegion(API_TENANT_B_ID, 'us-east-1')).toBeNull();

    const rule = await repo.createRoutingRule(API_TENANT_ID, {
      isActive: true,
      priority: 1,
      routingType: 'manual',
      sourceRegion: 'us-east-1',
      targetRegion: 'us-west-2',
      tenantId: API_TENANT_ID,
    });
    const crossTenantRules = await repo.listRoutingRules(API_TENANT_B_ID);
    expect(crossTenantRules.some((row) => row.id === rule.id)).toBe(false);
  });
});
