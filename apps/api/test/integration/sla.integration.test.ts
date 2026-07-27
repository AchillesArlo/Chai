import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_TENANT_B_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresSLARepository } from '../../src/modules/sla/postgres-sla.repository';

describe('API Postgres sla repository (D1)', () => {
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

  it('persists a definition and a breach, and honours the delete grant', async () => {
    const writer = new PostgresSLARepository(runtime);
    const definition = await writer.createDefinition(API_TENANT_ID, {
      firstResponseTime: 300,
      name: 'Premium',
      resolutionTime: 3600,
    });

    const reader = new PostgresSLARepository(runtime);
    const fetched = await reader.getDefinition(API_TENANT_ID, definition.id);
    expect(fetched?.firstResponseTime).toBe(300);
    expect(fetched?.resolutionTime).toBe(3600);

    const updated = await reader.updateDefinition(API_TENANT_ID, definition.id, {
      firstResponseTime: 120,
    });
    expect(updated.firstResponseTime).toBe(120);

    // sla_breach FKs require a real ticket; seed a minimal one out of band.
    const ticketId = randomUUID();
    await admin`
      INSERT INTO chai.ticket (id, tenant_id, subject)
      VALUES (${ticketId}, ${API_TENANT_ID}, 'sla-int-ticket')
    `;
    const breach = await reader.createBreach(API_TENANT_ID, {
      breachType: 'FIRST_RESPONSE',
      breachedAt: new Date().toISOString(),
      resolvedAt: null,
      slaDefinitionId: definition.id,
      ticketId,
    });
    const breaches = await new PostgresSLARepository(runtime).listBreaches(
      API_TENANT_ID,
      ticketId,
    );
    expect(breaches.some((row) => row.id === breach.id)).toBe(true);

    const resolvedBreach = await reader.updateBreach(API_TENANT_ID, breach.id, {
      resolvedAt: new Date().toISOString(),
    });
    expect(resolvedBreach.resolvedAt).toBeTruthy();

    // deleteDefinition exercises the DELETE grant (migration 0053). Use a
    // throwaway definition with no breach referencing it.
    const disposable = await writer.createDefinition(API_TENANT_ID, {
      firstResponseTime: 60,
      name: 'Disposable',
      resolutionTime: 600,
    });
    await writer.deleteDefinition(API_TENANT_ID, disposable.id);
    expect(await writer.getDefinition(API_TENANT_ID, disposable.id)).toBeNull();
  });

  it('isolates definitions by tenant under RLS', async () => {
    const repo = new PostgresSLARepository(runtime);
    const mine = await repo.createDefinition(API_TENANT_ID, {
      firstResponseTime: 300,
      name: 'Tenant A Only',
      resolutionTime: 3600,
    });

    const cross = await repo.listDefinitions(API_TENANT_B_ID);
    expect(cross.some((row) => row.id === mine.id)).toBe(false);
    expect(await repo.getDefinition(API_TENANT_B_ID, mine.id)).toBeNull();
  });
});
