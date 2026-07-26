import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase, type Database } from '@chai/database';

import { API_SERVICE_PRINCIPAL_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresAutomationBuilderRepository } from '../../src/modules/automation-builder/automation-builder.repository';

const SAMPLE_DEFINITION = {
  nodes: [
    { id: 't1', type: 'trigger', trigger: 'onMessageReceived', config: {} },
    {
      id: 'c1',
      type: 'condition',
      condition: 'checkKeyword',
      config: { keyword: 'upgrade' },
    },
    { id: 'a1', type: 'action', action: 'sendMessage', config: { template: 'promo' } },
  ],
  edges: [
    { from: 't1', to: 'c1' },
    { from: 'c1', to: 'a1', label: 'true' },
  ],
};

describe('API Postgres automation-builder repository (S4-3)', () => {
  const adminUrl = inject('adminDatabaseUrl') as string;
  const runtimeUrl = inject('runtimeDatabaseUrl') as string;
  let admin: Database;
  let runtime: Database;

  beforeAll(async () => {
    admin = createDatabase(adminUrl);
    runtime = createDatabase(runtimeUrl);
    await seedApiRuntime(admin);
  });

  afterAll(async () => {
    await runtime.end();
    await admin.end();
  });

  it('creates a draft flow, simulates, publishes, and lists versions under RLS', async () => {
    const repo = new PostgresAutomationBuilderRepository(runtime);

    const created = await repo.createFlow(API_TENANT_ID, {
      name: 'S4-3 promo flow',
      description: 'upgrade keyword -> promo reply',
      definition: SAMPLE_DEFINITION,
      createdBy: API_SERVICE_PRINCIPAL_ID,
    });
    expect(created.id).toBeTruthy();
    expect(created.tenantId).toBe(API_TENANT_ID);
    expect(created.status).toBe('DRAFT');
    expect(created.version).toBe(1);

    const fetched = await repo.getFlow(API_TENANT_ID, created.id);
    expect(fetched?.name).toBe('S4-3 promo flow');

    const listed = await repo.listFlows(API_TENANT_ID);
    expect(listed.some((f) => f.id === created.id)).toBe(true);

    const sim = await repo.simulate(API_TENANT_ID, created.id, {
      input: { text: 'upgrade' },
    });
    expect(sim.flowId).toBe(created.id);
    expect(sim.status).toBeTruthy();

    const published = await repo.publish(API_TENANT_ID, created.id, API_SERVICE_PRINCIPAL_ID);
    expect(published.flow.status).toBe('ACTIVE');
    expect(published.flow.version).toBe(1);
    expect(published.version.publishedAt).toBeTruthy();

    const versions = await repo.listVersions(API_TENANT_ID, created.id);
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions[0]?.version).toBe(1);
  });

  it('isolates flows by tenant under RLS', async () => {
    const repo = new PostgresAutomationBuilderRepository(runtime);
    const otherTenant = '01890f47-9b3c-7cc2-98e8-000000000099';

    const created = await repo.createFlow(API_TENANT_ID, {
      name: 'S4-3 isolated flow',
      definition: SAMPLE_DEFINITION,
    });
    const cross = await repo.getFlow(otherTenant, created.id);
    expect(cross).toBeNull();
  });
});
