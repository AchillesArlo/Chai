import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_TENANT_ID } from '../../src/database/api-ids';
import { PostgresAdvancedLogisticsRepository } from '../../src/modules/advanced-logistics/advanced-logistics.repository';
import { PostgresLogisticsRepository } from '../../src/modules/logistics/postgres-logistics.repository';
import { seedApiRuntime } from '../../src/database/seed-runtime';

/**
 * The existing advanced-logistics.integration.test.ts only exercises
 * InMemoryAdvancedLogisticsRepository, so PostgresAdvancedLogisticsRepository
 * had no database coverage at all. This proves persistEtaPrediction's
 * chai.eta_prediction.factors round-trips as a real jsonb object rather than a
 * double-encoded scalar string (MASALAH-01).
 */
describe('API Postgres advanced-logistics repository — ETA (MASALAH-01)', () => {
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

  it('persists eta_prediction.factors as a real jsonb object', async () => {
    const logistics = new PostgresLogisticsRepository(runtime);
    const trackingNumber = `TRK-ETA-JSONB-${Date.now()}`;
    await logistics.link(API_TENANT_ID, {
      carrier: 'mock-shipping',
      trackingNumber,
    });
    const shipmentRow = await admin<{ id: string }[]>`
      SELECT id FROM chai.shipment
      WHERE tenant_id = ${API_TENANT_ID}::uuid AND tracking_number = ${trackingNumber}
    `;
    const shipmentId = shipmentRow[0]?.id;
    if (!shipmentId) throw new Error('shipment missing after link');

    const repo = new PostgresAdvancedLogisticsRepository(runtime);
    const prediction = await repo.predictEta(API_TENANT_ID, {
      carrierTransitDays: 3,
      shipmentId,
      shippedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    expect(prediction.shipmentId).toBe(shipmentId);

    const fetched = await repo.getEta(API_TENANT_ID, shipmentId);
    expect(fetched?.id).toBe(prediction.id);
    expect(fetched?.factors).toEqual(prediction.factors);

    // A double-encoded write reads back as jsonb_typeof = 'string' and every
    // key lookup returns NULL: this is the regression 0077 repairs.
    const shape = await admin<{ typeof: string }[]>`
      SELECT jsonb_typeof(factors) AS typeof
      FROM chai.eta_prediction WHERE id = ${prediction.id}::uuid
    `;
    expect(shape[0]?.typeof).toBe('object');
  });
});
