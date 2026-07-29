import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_TENANT_B_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresTemplateRepository } from '../../src/modules/template/postgres-template.repository';

describe('API Postgres template repository (D1)', () => {
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

  it('persists a template with variables, updates it, and filters by category', async () => {
    const writer = new PostgresTemplateRepository(runtime);
    const created = await writer.createTemplate(API_TENANT_ID, {
      body: 'Welcome {{name}}!',
      category: 'UTILITY',
      language: 'id',
      name: 'welcome-int',
      providerRef: null,
      status: 'APPROVED',
      variables: ['name'],
    });

    const reader = new PostgresTemplateRepository(runtime);
    const fetched = await reader.getTemplate(API_TENANT_ID, created.id);
    expect(fetched?.variables).toEqual(['name']);
    expect(fetched?.body).toContain('Welcome');

    const updated = await reader.updateTemplate(API_TENANT_ID, created.id, {
      body: 'Halo {{name}}',
    });
    expect(updated.body).toBe('Halo {{name}}');

    const utility = await reader.listTemplates(API_TENANT_ID, 'UTILITY');
    expect(utility.some((row) => row.id === created.id)).toBe(true);
    const marketing = await reader.listTemplates(API_TENANT_ID, 'MARKETING');
    expect(marketing.some((row) => row.id === created.id)).toBe(false);

    // deleteTemplate exercises the DELETE grant (migration 0053).
    const disposable = await writer.createTemplate(API_TENANT_ID, {
      body: 'x',
      category: 'UTILITY',
      language: 'en',
      name: 'disposable-int',
      providerRef: null,
      status: 'DRAFT',
      variables: [],
    });
    await writer.deleteTemplate(API_TENANT_ID, disposable.id);
    expect(await writer.getTemplate(API_TENANT_ID, disposable.id)).toBeNull();
  });

  it('isolates templates by tenant under RLS', async () => {
    const repo = new PostgresTemplateRepository(runtime);
    const mine = await repo.createTemplate(API_TENANT_ID, {
      body: 'secret',
      category: 'MARKETING',
      language: 'id',
      name: 'tenant-a-only',
      providerRef: null,
      status: 'DRAFT',
      variables: [],
    });

    const cross = await repo.listTemplates(API_TENANT_B_ID);
    expect(cross.some((row) => row.id === mine.id)).toBe(false);
    expect(await repo.getTemplate(API_TENANT_B_ID, mine.id)).toBeNull();
  });

  it('stores variables as a real jsonb array, not a double-encoded string (MASALAH-01)', async () => {
    const repo = new PostgresTemplateRepository(runtime);
    const created = await repo.createTemplate(API_TENANT_ID, {
      body: 'Hi {{name}}, order {{orderId}}',
      category: 'UTILITY',
      language: 'id',
      name: 'jsonb-probe-template',
      providerRef: null,
      status: 'APPROVED',
      variables: ['name', 'orderId'],
    });

    // A double-encoded write reads back as jsonb_typeof = 'string' and every
    // array element access fails: this is the regression 0079 repairs.
    const shape = await admin<{ typeof: string; second: string | null }[]>`
      SELECT jsonb_typeof(variables) AS typeof, variables ->> 1 AS second
      FROM chai.message_template WHERE id = ${created.id}::uuid
    `;
    expect(shape[0]?.typeof).toBe('array');
    expect(shape[0]?.second).toBe('orderId');
  });
});
