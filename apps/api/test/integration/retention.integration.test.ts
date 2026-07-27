import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_TENANT_B_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresRetentionRepository } from '../../src/modules/retention/postgres-retention.repository';

describe('API Postgres retention repository (Fase 5.2)', () => {
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

  it('persists a policy and a job across a new instance, and honours the delete grant', async () => {
    const writer = new PostgresRetentionRepository(runtime);

    const policy = await writer.createPolicy(API_TENANT_ID, {
      cascadeDelete: true,
      dataClass: 'conversations',
      deletionMethod: 'soft_delete',
      exceptions: [{ reason: 'legal_hold' }],
      retentionDays: 365,
    });

    const job = await writer.createJob({
      dataClass: 'conversations',
      errorMessage: null,
      startedAt: new Date().toISOString(),
      status: 'running',
      tenantId: API_TENANT_ID,
    });

    // Round-trip through a brand-new repository instance — proves the data
    // lives in Postgres, not in the writer's process memory.
    const reader = new PostgresRetentionRepository(runtime);

    const fetchedPolicy = await reader.getPolicy(API_TENANT_ID, policy.id);
    expect(fetchedPolicy?.exceptions).toEqual([{ reason: 'legal_hold' }]);

    const fetchedJob = await reader.getJob(API_TENANT_ID, job.id);
    expect(fetchedJob?.status).toBe('running');

    const completedJob = await reader.updateJob(API_TENANT_ID, job.id, {
      completedAt: new Date().toISOString(),
      recordsDeleted: 12,
      recordsProcessed: 50,
      status: 'completed',
    });
    expect(completedJob.recordsDeleted).toBe(12);
    expect(completedJob.status).toBe('completed');

    const jobs = await reader.listJobs(API_TENANT_ID, 'completed');
    expect(jobs.some((row) => row.id === job.id)).toBe(true);

    // deletePolicy exercises the DELETE grant (migration 0068).
    await writer.deletePolicy(API_TENANT_ID, policy.id);
    expect(await writer.getPolicy(API_TENANT_ID, policy.id)).toBeNull();
  });

  it('isolates policies and jobs by tenant under RLS', async () => {
    const repo = new PostgresRetentionRepository(runtime);
    const policy = await repo.createPolicy(API_TENANT_ID, {
      cascadeDelete: false,
      dataClass: 'tenant-only-class',
      deletionMethod: 'hard_delete',
      exceptions: [],
      retentionDays: 30,
    });

    const crossTenantPolicies = await repo.listPolicies(API_TENANT_B_ID);
    expect(crossTenantPolicies.some((row) => row.id === policy.id)).toBe(false);
    expect(await repo.getPolicy(API_TENANT_B_ID, policy.id)).toBeNull();

    const job = await repo.createJob({
      dataClass: 'tenant-only-class',
      errorMessage: null,
      startedAt: new Date().toISOString(),
      status: 'running',
      tenantId: API_TENANT_ID,
    });
    expect(await repo.getJob(API_TENANT_B_ID, job.id)).toBeNull();
  });
});
