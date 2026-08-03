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
    url: '/api/service/v1/payments/webhook/mock-payment',
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

  /**
   * FASE 6 — checkout no longer accepts a client-supplied amount; it resolves
   * one from an invoice it creates through the real order/catalog endpoints.
   * Returns the invoiceId to pass as CreateCheckoutBody.invoiceId.
   */
  async function createInvoice(totalCents: number): Promise<string> {
    const unique = `${totalCents}-${Math.random().toString(36).slice(2, 10)}`;
    const catalog = await app.inject({
      headers: {
        'idempotency-key': `catalog-${unique}`,
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        currency: 'IDR',
        name: `Test item ${totalCents}`,
        sku: `sku-${unique}`,
        unitPriceCents: totalCents,
      },
      url: '/api/client/v1/orders/catalog',
    });
    const serviceItemId = (catalog.json().data as { id: string } | undefined)?.id;
    if (!serviceItemId) {
      throw new Error(`catalog create failed: ${catalog.statusCode} ${catalog.body}`);
    }

    const order = await app.inject({
      headers: {
        'idempotency-key': `order-${unique}`,
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { items: [{ quantity: 1, serviceItemId }] },
      url: '/api/client/v1/orders',
    });
    const orderId = (order.json().data as { id: string } | undefined)?.id;
    if (!orderId) {
      throw new Error(`order create failed: ${order.statusCode} ${order.body}`);
    }

    const invoice = await app.inject({
      headers: {
        'idempotency-key': `invoice-${unique}`,
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {},
      url: `/api/client/v1/orders/${orderId}/invoices`,
    });
    const invoiceId = (invoice.json().data as { id: string } | undefined)?.id;
    if (!invoiceId) {
      throw new Error(`invoice create failed: ${invoice.statusCode} ${invoice.body}`);
    }
    return invoiceId;
  }

  it('creates a checkout and collapses duplicate idempotency keys', async () => {
    const invoiceId = await createInvoice(75_000);
    const a = await app.inject({
      headers: {
        'idempotency-key': 'pay-http-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        idempotencyKey: 'order-42',
        invoiceId,
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
        idempotencyKey: 'order-42',
        invoiceId,
      },
      url: '/api/client/v1/payments/checkout',
    });
    expect(b.json().data.externalId).toBe(first.externalId);
  });

  it('polls session status and accepts verified webhook (stop-on-paid)', async () => {
    const invoiceId = await createInvoice(10_000);
    const created = await app.inject({
      headers: {
        'idempotency-key': 'pay-http-3',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        idempotencyKey: 'order-webhook',
        invoiceId,
      },
      url: '/api/client/v1/payments/checkout',
    });
    const externalId = (created.json().data as { externalId: string }).externalId;

    const webhook = await postWebhook(app, {
      eventAt: new Date().toISOString(),
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
      eventAt: new Date().toISOString(),
      externalId,
      providerEventId: 'evt-2',
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
    const invoiceId = await createInvoice(5_000);
    const created = await app.inject({
      headers: {
        'idempotency-key': 'pay-forged-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { idempotencyKey: 'order-forged', invoiceId },
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
      url: '/api/service/v1/payments/webhook/mock-payment',
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
      url: '/api/service/v1/payments/webhook/mock-payment',
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
    const invoiceId = await createInvoice(1);
    const response = await app.inject({
      headers: {
        'idempotency-key': 'pay-kill',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        idempotencyKey: 'killed',
        invoiceId,
      },
      url: '/api/client/v1/payments/checkout',
    });
    expect(response.statusCode).toBe(503);
    repository.setKillSwitch(false);
  });

  it('rejects checkout without an order or invoice reference', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'pay-no-ref',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { idempotencyKey: 'order-no-ref' },
      url: '/api/client/v1/payments/checkout',
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).toContain('CHECKOUT_REFERENCE_REQUIRED');
  });

  it('resolves checkout amount from the invoice total, not client input', async () => {
    const invoiceId = await createInvoice(42_500);
    const response = await app.inject({
      headers: {
        'idempotency-key': 'pay-amount-check',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { idempotencyKey: 'order-amount-check', invoiceId },
      url: '/api/client/v1/payments/checkout',
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.amount).toBe(42_500);
  });
});
