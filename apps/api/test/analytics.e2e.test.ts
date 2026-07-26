import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap';
import { AnalyticsModule } from '../src/modules/analytics/analytics.module';
import {
  AnalyticsRepository,
  type InMemoryAnalyticsRepository,
} from '../src/modules/analytics/analytics.repository';

const TENANT_A = '01890f47-9b3c-7cc2-98e8-123456789203';
const TENANT_B = '01890f47-9b3c-7cc2-98e8-123456789204';

describe('analytics API — outcomes lineage', () => {
  let app: NestFastifyApplication;
  let repository: InMemoryAnalyticsRepository;

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    repository = app
      .select(AnalyticsModule)
      .get(AnalyticsRepository) as InMemoryAnalyticsRepository;

    repository.seed(TENANT_A, {
      conversations: [
        {
          aiHandled: true,
          endedAt: new Date('2026-07-18T10:00:00Z'),
          qualified: true,
          resolved: true,
          satisfactionScore: 5,
        },
        {
          aiHandled: false,
          endedAt: new Date('2026-07-18T11:00:00Z'),
          qualified: true,
          resolved: true,
          satisfactionScore: 4,
        },
      ],
      leads: [
        { converted: false, qualified: true, stage: 'QUALIFIED' },
        { converted: true, qualified: true, stage: 'WON' },
        { converted: false, qualified: false, stage: 'NEW' },
      ],
      bookings: [
        {
          endsAt: new Date('2026-07-18T12:00:00Z'),
          resourceConflict: false,
          startsAt: new Date('2026-07-18T11:00:00Z'),
          status: 'COMPLETED',
        },
        {
          endsAt: new Date('2026-07-18T14:00:00Z'),
          resourceConflict: true,
          startsAt: new Date('2026-07-18T13:00:00Z'),
          status: 'CONFIRMED',
        },
      ],
    });

    repository.seed(TENANT_B, {
      conversations: [
        {
          aiHandled: true,
          endedAt: new Date('2026-07-18T10:00:00Z'),
          qualified: true,
          resolved: true,
          satisfactionScore: 1,
        },
      ],
    });
  });

  afterAll(async () => app.close());

  it('returns lineage-aware outcomes for the caller tenant', async () => {
    const response = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/analytics/outcomes',
    });

    expect(response.statusCode).toBe(200);
    const data = response.json().data as {
      automationRate: { denominator: number; value: number; mix: string };
      averageCsat: { denominator: number; value: number };
      qualificationRate: { denominator: number; value: number };
      bookingExceptionRate: { denominator: number; value: number };
      sourceUntil: string;
    };

    expect(data.automationRate.denominator).toBe(2);
    expect(data.automationRate.value).toBe(0.5);
    expect(data.automationRate.mix).toBe('BLENDED');
    expect(data.averageCsat.denominator).toBe(2);
    expect(data.averageCsat.value).toBe(4.5);
    expect(data.qualificationRate.denominator).toBe(3);
    expect(data.qualificationRate.value).toBeCloseTo(2 / 3);
    expect(data.bookingExceptionRate.value).toBe(0.5);
    expect(data.sourceUntil).toBeTruthy();
  });

  it('does not leak foreign tenant facts', async () => {
    const response = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/analytics/outcomes',
    });

    const data = response.json().data as {
      automationRate: { denominator: number };
      averageCsat: { value: number };
    };
    // Tenant B has a single conversation with CSAT 1 — must not affect tenant A.
    expect(data.automationRate.denominator).toBe(2);
    expect(data.averageCsat.value).toBe(4.5);
  });

  it('rejects unauthenticated access', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/client/v1/analytics/outcomes',
    });
    expect(response.statusCode).toBe(401);
  });
});
