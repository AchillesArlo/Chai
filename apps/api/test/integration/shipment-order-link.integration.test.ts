import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresLogisticsRepository } from '../../src/modules/logistics/postgres-logistics.repository';

/**
 * REQ-17-071 (multi-package): one order fans out across many shipments. The
 * minimal, order-lifecycle-preserving model is a nullable chai.shipment.order_id
 * (migration 0095) with NO unique constraint on it — so a single order id may
 * repeat across shipment rows. This proves exactly that: two shipments (two
 * packages) linked to one order id both persist, tenant-scoped, with nothing
 * rejecting the shared order id. Per-item partial-fulfilment is out of scope.
 */
describe('shipment order link — multi-package (REQ-17-071)', () => {
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

  it('links two shipments to one order id without a unique constraint blocking it', async () => {
    const logistics = new PostgresLogisticsRepository(runtime);
    const orderId = randomUUID();
    const stamp = Date.now();
    const trackingA = `TRK-MP-A-${stamp}`;
    const trackingB = `TRK-MP-B-${stamp}`;

    // FK prerequisite: the order must exist. Insert via admin like the other
    // test fixtures (seedApiRuntime); every non-listed column has a default.
    await admin`
      INSERT INTO chai.order (id, tenant_id)
      VALUES (${orderId}::uuid, ${API_TENANT_ID}::uuid)
      ON CONFLICT (id) DO NOTHING
    `;

    // Two packages, one order, distinct tracking numbers.
    const first = await logistics.link(API_TENANT_ID, {
      carrier: 'mock-shipping',
      orderId,
      trackingNumber: trackingA,
    });
    const second = await logistics.link(API_TENANT_ID, {
      carrier: 'mock-shipping',
      orderId,
      trackingNumber: trackingB,
    });
    expect(first.trackingNumber).toBe(trackingA);
    expect(second.trackingNumber).toBe(trackingB);

    // Both rows persist under the same order id — the core multi-package claim.
    const rows = await admin<{ order_id: string; tracking_number: string }[]>`
      SELECT order_id, tracking_number
      FROM chai.shipment
      WHERE tenant_id = ${API_TENANT_ID}::uuid AND order_id = ${orderId}::uuid
      ORDER BY tracking_number
    `;
    expect(rows.length).toBe(2);
    expect(rows.map((row) => row.tracking_number)).toEqual([trackingA, trackingB]);
    expect(rows.every((row) => row.order_id === orderId)).toBe(true);
  });
});
