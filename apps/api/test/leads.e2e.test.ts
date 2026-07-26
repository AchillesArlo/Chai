import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap';
import { LeadsModule } from '../src/modules/leads/leads.module';
import { LeadsRepository } from '../src/modules/leads/leads.repository';
import type { InMemoryLeadsRepository } from '../src/modules/leads/leads.repository';

const TENANT_ID = '01890f47-9b3c-7cc2-98e8-123456789203';

describe('leads and appointments API', () => {
  let app: NestFastifyApplication;
  let repository: InMemoryLeadsRepository;

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    repository = app.select(LeadsModule).get(LeadsRepository) as InMemoryLeadsRepository;
    repository.seedLead({
      contactId: 'contact-1',
      score: 0,
      stage: 'NEW',
      status: 'OPEN',
      tenantId: TENANT_ID,
    });
  });

  afterAll(async () => app.close());

  it('lists leads for the tenant', async () => {
    const response = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/leads',
    });

    expect(response.statusCode).toBe(200);
    const data = response.json().data as Array<{ stage: string }>;
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  it('qualifies a lead with a normalized score', async () => {
    const list = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/leads',
    });
    const leadId = (list.json().data as Array<{ id: string }>)[0]?.id;
    if (!leadId) throw new Error('no leads seeded');

    const response = await app.inject({
      headers: {
        'idempotency-key': 'qualify-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'PATCH',
      payload: { score: 72 },
      url: `/api/client/v1/leads/${leadId}/qualify`,
    });

    expect(response.statusCode).toBe(200);
    expect((response.json().data as { score: number }).score).toBe(72);
  });

  it('books an appointment and reports a slot conflict', async () => {
    const startsAt = '2026-08-01T09:00:00Z';
    const book = await app.inject({
      headers: {
        'idempotency-key': 'book-idem-a',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        contactId: 'contact-1',
        endsAt: '2026-08-01T10:00:00Z',
        idempotencyKey: 'appt-1',
        resourceId: 'chair-1',
        startsAt,
        title: 'Pemeriksaan',
      },
      url: '/api/client/v1/appointments',
    });
    expect(book.statusCode).toBe(201);

    const conflict = await app.inject({
      headers: {
        'idempotency-key': 'book-idem-b',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        contactId: 'contact-1',
        endsAt: '2026-08-01T10:00:00Z',
        idempotencyKey: 'appt-2',
        resourceId: 'chair-1',
        startsAt: '2026-08-01T09:30:00Z',
        title: 'Benturan',
      },
      url: '/api/client/v1/appointments',
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('SLOT_CONFLICT');
  });
});
