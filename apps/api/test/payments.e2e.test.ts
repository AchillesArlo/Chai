import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signMockPaymentWebhook } from '@chai/connectors/mock-payment';

import { createApplication } from '../src/bootstrap';

/**
 * Signs the payload exactly as a provider would, so the webhook path exercises
 * real signature verification rather than a shared constant.
 */
async function postWebhook(
  app: NestFastifyApplication,
  body: Record<string, unknown>,
) {
  const raw = JSON.stringify(body);
  return app.inject({
    headers: { 'x-payment-signature': signMockPaymentWebhook(raw) },
    method: 'POST',
    payload: body,
    url: '/api/service/v1/payments/webhook',
  });
}
import { PaymentsModule } from '../src/modules/payments/payments.module';
import {
  type InMemoryPaymentsRepository,
  PaymentsRepository,
} from '../src/modules/payments/payments.repository';

describe('payments API — hosted checkout', () => {
  let app: NestFastifyApplication;
  let repository: InMemoryPaymentsRepository;

  beforeAll(() => {
    // Optional modules are OFF by default (GAP-012); this suite exercises them,
    // so it opts in explicitly instead of relying on a permissive default.
    process.env.CHAI_CAPABILITY_PAYMENT_ORCHESTRATION = 'true';
  });

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    repository = app
      .select(PaymentsModule)
      .get(PaymentsRepository) as InMemoryPaymentsRepository;
  });

  afterAll(async () => app.close());

  it('creates a checkout and collapses duplicate idempotency keys', async () => {
    const a = await app.inject({
      headers: {
        'idempotency-key': 'pay-http-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        amount: 75_000,
        currency: 'IDR',
        idempotencyKey: 'order-42',
      },
      url: '/api/client/v1/payments/checkout',
    });
    expect(a.statusCode).toBe(201);
    const first = a.json().data as { externalId: string; status: string };

    const b = await app.inject({
      headers: {
        'idempotency-key': 'pay-http-2',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        amount: 75_000,
        currency: 'IDR',
        idempotencyKey: 'order-42',
      },
      url: '/api/client/v1/payments/checkout',
    });
    expect(b.json().data.externalId).toBe(first.externalId);
  });

  it('polls session status and accepts verified webhook (stop-on-paid)', async () => {
    const created = await app.inject({
      headers: {
        'idempotency-key': 'pay-http-3',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        amount: 10_000,
        currency: 'IDR',
        idempotencyKey: 'order-webhook',
      },
      url: '/api/client/v1/payments/checkout',
    });
    const externalId = (created.json().data as { externalId: string }).externalId;

    const webhook = await postWebhook(app, {
      externalId,
      providerEventId: 'evt-1',
      status: 'PAID',
      tenantId: '01890f47-9b3c-7cc2-98e8-123456789203',
    });
    expect(webhook.statusCode).toBe(200);
    expect(webhook.json().data.accepted).toBe(true);

    const get = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: `/api/client/v1/payments/${externalId}`,
    });
    expect(get.json().data.status).toBe('PAID');

    // false-paid / duplicate: second FAILED webhook must not downgrade PAID
    await postWebhook(app, {
      externalId,
      status: 'FAILED',
      tenantId: '01890f47-9b3c-7cc2-98e8-123456789203',
    });
    const still = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: `/api/client/v1/payments/${externalId}`,
    });
    expect(still.json().data.status).toBe('PAID');
  });

  it('rejects a webhook whose signature does not verify', async () => {
    const created = await app.inject({
      headers: {
        'idempotency-key': 'pay-forged-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { amount: 5_000, currency: 'IDR', idempotencyKey: 'order-forged' },
      url: '/api/client/v1/payments/checkout',
    });
    const externalId = (created.json().data as { externalId: string }).externalId;

    const forged = await app.inject({
      headers: { 'x-payment-signature': 'not-a-real-signature' },
      method: 'POST',
      payload: {
        externalId,
        status: 'PAID',
        tenantId: '01890f47-9b3c-7cc2-98e8-123456789203',
      },
      url: '/api/service/v1/payments/webhook',
    });
    expect(forged.statusCode).toBe(400);
    expect(forged.body).toContain('WEBHOOK_REJECTED');

    const unchanged = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: `/api/client/v1/payments/${externalId}`,
    });
    // A forged webhook must not be able to mark a payment paid.
    expect(unchanged.json().data.status).toBe('PENDING');
  });

  it('refuses a webhook with no signature at all', async () => {
    const missing = await app.inject({
      method: 'POST',
      payload: {
        externalId: 'pay_whatever',
        status: 'PAID',
        tenantId: '01890f47-9b3c-7cc2-98e8-123456789203',
      },
      url: '/api/service/v1/payments/webhook',
    });
    expect(missing.statusCode).toBe(400);
  });

  it('hides foreign tenant sessions', async () => {
    repository.settle('pay_nonexistent', 'PAID');
    const response = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/payments/pay_nonexistent',
    });
    expect(response.statusCode).toBe(404);
  });

  it('returns 503 when kill switch is on', async () => {
    repository.setKillSwitch(true);
    const response = await app.inject({
      headers: {
        'idempotency-key': 'pay-kill',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        amount: 1,
        currency: 'IDR',
        idempotencyKey: 'killed',
      },
      url: '/api/client/v1/payments/checkout',
    });
    expect(response.statusCode).toBe(503);
    repository.setKillSwitch(false);
  });
});
