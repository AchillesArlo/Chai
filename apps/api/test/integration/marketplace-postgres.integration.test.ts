import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_TENANT_B_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresMarketplaceRepository } from '../../src/modules/marketplace/marketplace.repository';

/**
 * The existing marketplace.integration.test.ts only exercises
 * InMemoryMarketplaceRepository, so PostgresMarketplaceRepository had no
 * database coverage at all. This suite exercises it against a real Postgres,
 * and specifically proves the jsonb columns round-trip as objects/arrays
 * rather than a double-encoded scalar string (MASALAH-01).
 */
describe('API Postgres marketplace repository (MASALAH-01)', () => {
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

  it('persists webhook events as a real jsonb array and isolates it by tenant', async () => {
    const repo = new PostgresMarketplaceRepository(runtime);
    const created = await repo.createWebhook(API_TENANT_ID, {
      url: 'https://example.com/hook',
      description: 'jsonb probe',
      events: ['order.created', 'payment.completed'],
    });
    expect(created.events).toEqual(['order.created', 'payment.completed']);

    const fetched = await repo.getWebhook(API_TENANT_ID, created.id);
    expect(fetched?.events).toEqual(['order.created', 'payment.completed']);
    expect(await repo.getWebhook(API_TENANT_B_ID, created.id)).toBeNull();

    const updated = await repo.updateWebhook(API_TENANT_ID, created.id, {
      events: ['order.updated'],
    });
    expect(updated.events).toEqual(['order.updated']);

    // A double-encoded write reads back as jsonb_typeof = 'string' and every
    // array element access fails: this is the regression 0074 repairs.
    const shape = await admin<{ typeof: string; first: string | null }[]>`
      SELECT jsonb_typeof(events) AS typeof, events ->> 0 AS first
      FROM chai.webhook_subscription WHERE id = ${created.id}::uuid
    `;
    expect(shape[0]?.typeof).toBe('array');
    expect(shape[0]?.first).toBe('order.updated');
  });

  it('persists listing configSchema and installation config as real jsonb objects', async () => {
    const repo = new PostgresMarketplaceRepository(runtime);
    const listing = await repo.createListing({
      providerId: `jsonb-probe-${Date.now()}`,
      name: 'Jsonb Probe Connector',
      description: 'MASALAH-01 probe',
      configSchema: { required: ['apiKey'] },
    });
    expect(listing.configSchema).toEqual({ required: ['apiKey'] });

    const listingShape = await admin<{ typeof: string; val: string | null }[]>`
      SELECT jsonb_typeof(config_schema) AS typeof, config_schema -> 'required' ->> 0 AS val
      FROM chai.marketplace_listing WHERE id = ${listing.id}::uuid
    `;
    expect(listingShape[0]?.typeof).toBe('object');
    expect(listingShape[0]?.val).toBe('apiKey');

    const installation = await repo.installListing(API_TENANT_ID, listing.id, {
      apiKey: 'test-key',
    });
    expect(installation.config).toEqual({ apiKey: 'test-key' });

    const updated = await repo.updateInstallation(API_TENANT_ID, listing.id, {
      config: { apiKey: 'rotated-key' },
    });
    expect(updated.config).toEqual({ apiKey: 'rotated-key' });

    // A double-encoded write reads back as jsonb_typeof = 'string' and
    // `-> 'key'` returns NULL: this is the regression 0074 repairs.
    const installShape = await admin<{ typeof: string; val: string | null }[]>`
      SELECT jsonb_typeof(config) AS typeof, config ->> 'apiKey' AS val
      FROM chai.marketplace_installation WHERE id = ${installation.id}::uuid
    `;
    expect(installShape[0]?.typeof).toBe('object');
    expect(installShape[0]?.val).toBe('rotated-key');
  });
});
