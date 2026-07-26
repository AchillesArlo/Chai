import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap';
import {
  LeadsRepository,
  type InMemoryLeadsRepository,
} from '../src/modules/leads/leads.repository';
import { LeadsModule } from '../src/modules/leads/leads.module';
import {
  LogisticsRepository,
  type InMemoryLogisticsRepository,
} from '../src/modules/logistics/logistics.repository';
import { LogisticsModule } from '../src/modules/logistics/logistics.module';
import {
  PaymentsRepository,
  type InMemoryPaymentsRepository,
} from '../src/modules/payments/payments.repository';
import { PaymentsModule } from '../src/modules/payments/payments.module';

/**
 * Fase 4 (tahap 1): the new LIST endpoints must return the caller tenant's rows
 * and nothing else. `local|client-owner` resolves to TENANT_A; TENANT_B is a
 * foreign tenant seeded in the same in-memory stores, and its rows must never
 * appear in TENANT_A's responses.
 */
const TENANT_A = '01890f47-9b3c-7cc2-98e8-123456789203';
const TENANT_B = '01890f47-9b3c-7cc2-98e8-123456789204';

describe('list endpoints — tenant-scoped reads', () => {
  let app: NestFastifyApplication;
  let payments: InMemoryPaymentsRepository;
  let logistics: InMemoryLogisticsRepository;
  let leads: InMemoryLeadsRepository;
  const previousEnv: Record<string, string | undefined> = {};
  let ownPaymentId = '';
  let foreignPaymentId = '';
  let ownAppointmentId = '';
  let foreignAppointmentId = '';

  beforeAll(async () => {
    // Optional modules are OFF by default (GAP-012); the payment and shipment
    // surfaces are gated on capabilities, so opt in explicitly.
    for (const key of [
      'CHAI_CAPABILITY_PAYMENT_ORCHESTRATION',
      'CHAI_CAPABILITY_SHIPMENT_TRACKING',
    ]) {
      previousEnv[key] = process.env[key];
      process.env[key] = 'true';
    }

    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    payments = app
      .select(PaymentsModule)
      .get(PaymentsRepository) as InMemoryPaymentsRepository;
    logistics = app
      .select(LogisticsModule)
      .get(LogisticsRepository) as InMemoryLogisticsRepository;
    leads = app
      .select(LeadsModule)
      .get(LeadsRepository) as InMemoryLeadsRepository;

    // Seed each vertical for the caller tenant AND a foreign tenant.
    ownPaymentId = (
      await payments.createCheckout(TENANT_A, {
        amount: 50_000,
        currency: 'IDR',
        idempotencyKey: 'list-pay-a',
      })
    ).externalId;
    foreignPaymentId = (
      await payments.createCheckout(TENANT_B, {
        amount: 99_000,
        currency: 'IDR',
        idempotencyKey: 'list-pay-b',
      })
    ).externalId;

    await logistics.link(TENANT_A, {
      carrier: 'mock-express',
      trackingNumber: 'TRK-LIST-A',
    });
    await logistics.link(TENANT_B, {
      carrier: 'mock-express',
      trackingNumber: 'TRK-LIST-B',
    });

    ownAppointmentId = (
      await leads.bookAppointment(TENANT_A, {
        contactId: 'contact-a',
        endsAt: '2026-09-01T10:00:00Z',
        idempotencyKey: 'list-appt-a',
        resourceId: 'chair-a',
        startsAt: '2026-09-01T09:00:00Z',
        title: 'Tenant A booking',
      })
    ).appointment.id;
    foreignAppointmentId = (
      await leads.bookAppointment(TENANT_B, {
        contactId: 'contact-b',
        endsAt: '2026-09-01T10:00:00Z',
        idempotencyKey: 'list-appt-b',
        resourceId: 'chair-b',
        startsAt: '2026-09-01T09:00:00Z',
        title: 'Tenant B booking',
      })
    ).appointment.id;
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
    await app.close();
  });

  it('lists only the caller tenant’s payment sessions', async () => {
    const response = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/payments',
    });
    expect(response.statusCode).toBe(200);
    const data = response.json().data as Array<{ externalId: string }>;
    const ids = data.map((session) => session.externalId);
    expect(ids).toContain(ownPaymentId);
    expect(ids).not.toContain(foreignPaymentId);
  });

  it('lists only the caller tenant’s shipments', async () => {
    const response = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/logistics/shipments',
    });
    expect(response.statusCode).toBe(200);
    const data = response.json().data as Array<{ trackingNumber: string }>;
    const numbers = data.map((shipment) => shipment.trackingNumber);
    expect(numbers).toContain('TRK-LIST-A');
    expect(numbers).not.toContain('TRK-LIST-B');
  });

  it('lists only the caller tenant’s appointments', async () => {
    const response = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/appointments',
    });
    expect(response.statusCode).toBe(200);
    const data = response.json().data as Array<{ id: string }>;
    const ids = data.map((appointment) => appointment.id);
    expect(ids).toContain(ownAppointmentId);
    expect(ids).not.toContain(foreignAppointmentId);
  });
});
