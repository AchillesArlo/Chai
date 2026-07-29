import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresLogisticsRepository } from '../../src/modules/logistics/postgres-logistics.repository';

describe('API Postgres logistics repository (S2-1)', () => {
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

  it('links a shipment, views it, and appends milestone events', async () => {
    const logistics = new PostgresLogisticsRepository(runtime);
    const trackingNumber = `TRK-S2-1-${Date.now()}`;

    const linked = await logistics.link(API_TENANT_ID, {
      carrier: 'mock-shipping',
      trackingNumber,
    });
    expect(linked.trackingNumber).toBe(trackingNumber);
    expect(linked.status).toBe('LINKED');
    expect(linked.events.length).toBe(1);
    expect(linked.events[0]?.code).toBe('LINKED');

    const view = await logistics.customerView(API_TENANT_ID, trackingNumber);
    expect(view).not.toBeNull();
    if (!view) throw new Error('view missing');
    expect(view.status).toBe('LINKED');
    expect(view.timeline.length).toBe(1);

    const appended = await logistics.appendEvent(
      API_TENANT_ID,
      trackingNumber,
      {
        at: new Date(),
        code: 'PICKED_UP',
        description: 'Package picked up at origin',
      },
    );
    expect(appended).not.toBeNull();
    if (!appended) throw new Error('appended missing');
    expect(appended.status).toBe('PICKED_UP');
    expect(appended.events.length).toBe(2);

    const viewAfter = await logistics.customerView(
      API_TENANT_ID,
      trackingNumber,
    );
    if (!viewAfter) throw new Error('viewAfter missing');
    expect(viewAfter.timeline.length).toBe(2);
    expect(viewAfter.timeline[1]?.code).toBe('PICKED_UP');
  });

  it('isolates shipments by tenant under RLS', async () => {
    const logistics = new PostgresLogisticsRepository(runtime);
    const trackingNumber = `TRK-S2-1-ISO-${Date.now()}`;

    const linked = await logistics.link(API_TENANT_ID, {
      carrier: 'mock-shipping',
      trackingNumber,
    });
    expect(linked.tenantId).toBe(API_TENANT_ID);

    // ponytail: bogus tenant must see nothing — RLS + tenant_id filter.
    const cross = await logistics.get(
      '01890f47-9b3c-7cc2-98e8-000000000099',
      trackingNumber,
    );
    expect(cross).toBeNull();

    const crossView = await logistics.customerView(
      '01890f47-9b3c-7cc2-98e8-000000000099',
      trackingNumber,
    );
    expect(crossView).toBeNull();
  });

  it('makes link idempotent by tenant + tracking number', async () => {
    const logistics = new PostgresLogisticsRepository(runtime);
    const trackingNumber = `TRK-S2-1-IDEM-${Date.now()}`;

    const first = await logistics.link(API_TENANT_ID, {
      carrier: 'mock-shipping',
      trackingNumber,
    });
    const second = await logistics.link(API_TENANT_ID, {
      carrier: 'mock-shipping',
      trackingNumber,
    });
    expect(second.events.length).toBe(first.events.length);
  });

  it('stores shipment events as a real jsonb array, not a double-encoded string (MASALAH-01)', async () => {
    const logistics = new PostgresLogisticsRepository(runtime);
    const trackingNumber = `TRK-S2-1-JSONB-${Date.now()}`;

    await logistics.link(API_TENANT_ID, {
      carrier: 'mock-shipping',
      trackingNumber,
    });
    await logistics.appendEvent(API_TENANT_ID, trackingNumber, {
      at: new Date(),
      code: 'PICKED_UP',
      description: 'Package picked up at origin',
    });

    // A double-encoded write reads back as jsonb_typeof = 'string' and every
    // array element access fails: this is the regression 0077 repairs.
    const shape = await admin<{ typeof: string; val: string | null }[]>`
      SELECT jsonb_typeof(events) AS typeof, events -> 1 ->> 'code' AS val
      FROM chai.shipment
      WHERE tenant_id = ${API_TENANT_ID}::uuid AND tracking_number = ${trackingNumber}
    `;
    expect(shape[0]?.typeof).toBe('array');
    expect(shape[0]?.val).toBe('PICKED_UP');
  });
});
