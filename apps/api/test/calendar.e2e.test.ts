import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap';

describe('calendar API — availability', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => app.close());

  it('returns mock availability slots for resources', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'cal-avail-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        resourceIds: ['chair-1'],
        windowEnd: '2026-08-01T18:00:00Z',
        windowStart: '2026-08-01T09:00:00Z',
      },
      url: '/api/client/v1/calendar/availability',
    });

    expect(response.statusCode).toBe(200);
    const slots = response.json().data as Array<{
      resourceId: string;
      startsAt: string;
    }>;
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((slot) => slot.resourceId === 'chair-1')).toBe(true);
  });

  it('rejects unauthenticated access', async () => {
    const response = await app.inject({
      method: 'POST',
      payload: {
        resourceIds: ['chair-1'],
        windowEnd: '2026-08-01T18:00:00Z',
        windowStart: '2026-08-01T09:00:00Z',
      },
      url: '/api/client/v1/calendar/availability',
    });
    expect(response.statusCode).toBe(401);
  });
});
