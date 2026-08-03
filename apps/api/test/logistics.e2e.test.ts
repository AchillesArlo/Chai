import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap';
import { LogisticsModule } from '../src/modules/logistics/logistics.module';
import {
  type InMemoryLogisticsRepository,
  LogisticsRepository,
} from '../src/modules/logistics/logistics.repository';

describe('logistics API — read-only tracking', () => {
  let app: NestFastifyApplication;
  let repository: InMemoryLogisticsRepository;

  beforeAll(() => {
    // Optional modules are OFF by default (GAP-012); this suite exercises them,
    // so it opts in explicitly instead of relying on a permissive default.
    process.env.CHAI_CAPABILITY_SHIPMENT_TRACKING = 'true';
  });

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    repository = app
      .select(LogisticsModule)
      .get(LogisticsRepository) as InMemoryLogisticsRepository;
  });

  afterAll(async () => app.close());

  it('links a shipment and returns customer-safe timeline', async () => {
    const link = await app.inject({
      headers: {
        'idempotency-key': 'log-link-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { carrier: 'mock-express', contactId: 'contact-trk100', trackingNumber: 'TRK-100' },
      url: '/api/client/v1/logistics/shipments',
    });
    expect(link.statusCode).toBe(201);

    await app.inject({
      headers: {
        'idempotency-key': 'log-evt-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        at: '2026-07-18T14:00:00Z',
        code: 'IN_TRANSIT',
        description: 'Departed hub',
      },
      url: '/api/client/v1/logistics/shipments/TRK-100/events',
    });

    const get = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/logistics/shipments/TRK-100?contactId=contact-trk100',
    });
    expect(get.statusCode).toBe(200);
    const data = get.json().data as {
      status: string;
      timeline: Array<{ code: string }>;
    };
    expect(data.status).toBe('IN_TRANSIT');
    expect(data.timeline.some((e) => e.code === 'LINKED')).toBe(true);
  });

  it('returns 404 for unknown tracking numbers (no leak)', async () => {
    const response = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/logistics/shipments/UNKNOWN',
    });
    expect(response.statusCode).toBe(404);
  });

  it('returns 503 when kill switch is on', async () => {
    repository.setKillSwitch(true);
    const response = await app.inject({
      headers: {
        'idempotency-key': 'log-kill',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { carrier: 'mock-express', trackingNumber: 'TRK-KILL' },
      url: '/api/client/v1/logistics/shipments',
    });
    expect(response.statusCode).toBe(503);
    repository.setKillSwitch(false);
  });
});
