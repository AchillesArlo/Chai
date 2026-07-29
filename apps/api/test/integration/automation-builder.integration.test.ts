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

  it('stores flow definition, version definition, and simulation input/output as real jsonb objects (MASALAH-01)', async () => {
    const repo = new PostgresAutomationBuilderRepository(runtime);

    const created = await repo.createFlow(API_TENANT_ID, {
      name: 'Jsonb probe flow',
      definition: SAMPLE_DEFINITION,
      createdBy: API_SERVICE_PRINCIPAL_ID,
    });
    const sim = await repo.simulate(API_TENANT_ID, created.id, {
      input: { text: 'upgrade' },
      output: { matched: true },
    });
    await repo.publish(API_TENANT_ID, created.id, API_SERVICE_PRINCIPAL_ID);

    // A double-encoded write reads back as jsonb_typeof = 'string' and every
    // key lookup returns NULL: this is the regression 0075 repairs.
    const flowShape = await admin<{ typeof: string; val: string | null }[]>`
      SELECT jsonb_typeof(definition) AS typeof, definition -> 'nodes' -> 0 ->> 'id' AS val
      FROM chai.automation_flow WHERE id = ${created.id}::uuid
    `;
    expect(flowShape[0]?.typeof).toBe('object');
    expect(flowShape[0]?.val).toBe('t1');

    const versionShape = await admin<{ typeof: string; val: string | null }[]>`
      SELECT jsonb_typeof(definition) AS typeof, definition -> 'nodes' -> 0 ->> 'id' AS val
      FROM chai.automation_flow_version WHERE flow_id = ${created.id}::uuid AND version = 1
    `;
    expect(versionShape[0]?.typeof).toBe('object');
    expect(versionShape[0]?.val).toBe('t1');

    const simShape = await admin<{ input_type: string; input_val: string | null; output_type: string; output_val: string | null }[]>`
      SELECT
        jsonb_typeof(input) AS input_type, input ->> 'text' AS input_val,
        jsonb_typeof(output) AS output_type, output ->> 'matched' AS output_val
      FROM chai.automation_simulation WHERE id = ${sim.id}::uuid
    `;
    expect(simShape[0]?.input_type).toBe('object');
    expect(simShape[0]?.input_val).toBe('upgrade');
    expect(simShape[0]?.output_type).toBe('object');
    expect(simShape[0]?.output_val).toBe('true');
  });
});
