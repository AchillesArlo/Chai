import { expect, test, type APIRequestContext } from '@playwright/test';

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';

/**
 * E2E: Payment Flow
 * Checkout → webhook → reconciliation
 */
test.describe('payment flow', () => {
  /**
   * FASE 6 — checkout resolves its amount from a real invoice, not a
   * client-supplied number. Seeds a catalog item -> order -> invoice through
   * the real HTTP endpoints and returns the invoiceId plus the amount that
   * must come back from checkout.
   */
  async function createInvoice(
    request: APIRequestContext,
    unitPriceCents: number,
  ): Promise<{ invoiceId: string }> {
    const unique = `${unitPriceCents}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const catalog = await request.post(`${API_BASE}/api/client/v1/orders/catalog`, {
      headers: {
        'Idempotency-Key': `catalog-${unique}`,
        'x-test-subject': 'local|client-owner',
      },
      data: {
        currency: 'IDR',
        name: `Playwright item ${unique}`,
        sku: `pw-${unique}`,
        unitPriceCents,
      },
    });
    const serviceItemId = (await catalog.json()).data.id as string;

    const order = await request.post(`${API_BASE}/api/client/v1/orders`, {
      headers: {
        'Idempotency-Key': `order-${unique}`,
        'x-test-subject': 'local|client-owner',
      },
      data: { items: [{ quantity: 1, serviceItemId }] },
    });
    const orderId = (await order.json()).data.id as string;

    const invoice = await request.post(
      `${API_BASE}/api/client/v1/orders/${orderId}/invoices`,
      {
        headers: {
          'Idempotency-Key': `invoice-${unique}`,
          'x-test-subject': 'local|client-owner',
        },
        data: {},
      },
    );
    return { invoiceId: (await invoice.json()).data.id as string };
  }

  test('create checkout session', async ({ request }) => {
    const { invoiceId } = await createInvoice(request, 5000);
    const idempotencyKey = `checkout-${Date.now()}`;
    const checkout = await request.post(
      `${API_BASE}/api/client/v1/payments/checkout`,
      {
        headers: {
          'Idempotency-Key': idempotencyKey,
          'x-test-subject': 'local|client-owner',
        },
        data: {
          idempotencyKey,
          invoiceId,
        },
      },
    );
    expect(checkout.ok()).toBeTruthy();
    const body = await checkout.json();
    expect(body.data.amount).toBe(5000);
    // Canonical status vocabulary (packages/connectors/.../PaymentStatus) is
    // uppercase; a fresh checkout starts PENDING, not the lowercase 'open'.
    expect(body.data.status).toBe('PENDING');
    expect(body.data.externalId).toBeDefined();
    expect(body.data.checkoutUrl).toBeDefined();
  });

  test('retrieve payment session', async ({ request }) => {
    // Create a session first
    const { invoiceId } = await createInvoice(request, 2500);
    const idempotencyKey = `retrieve-${Date.now()}`;
    const checkout = await request.post(
      `${API_BASE}/api/client/v1/payments/checkout`,
      {
        headers: {
          'Idempotency-Key': idempotencyKey,
          'x-test-subject': 'local|client-owner',
        },
        data: {
          idempotencyKey,
          invoiceId,
        },
      },
    );
    const created = await checkout.json();

    // Retrieve it
    const retrieved = await request.get(
      `${API_BASE}/api/client/v1/payments/${created.data.externalId}`,
      { headers: { 'x-test-subject': 'local|client-owner' } },
    );
    expect(retrieved.ok()).toBeTruthy();
    const body = await retrieved.json();
    expect(body.data.externalId).toBe(created.data.externalId);
    expect(body.data.amount).toBe(2500);
  });

  test('webhook rejects an invalid signature', async ({ request }) => {
    // A forged/placeholder signature must never be treated as authentic —
    // verifyMockPaymentWebhookSignature (packages/connectors/src/connectors/mock-payment)
    // HMACs the raw body against MOCK_PAYMENT_WEBHOOK_SECRET, so an arbitrary
    // string can never match. Full signature-forming coverage lives in
    // packages/connectors/src/conformance/payment.test.ts.
    const webhookPayload = {
      event: 'payment.completed',
      externalId: 'mock-payment-001',
      status: 'completed',
    };

    const webhook = await request.post(
      `${API_BASE}/api/service/v1/payments/webhook/mock-payment`,
      {
        data: webhookPayload,
        headers: { 'x-payment-signature': 'test-signature' },
      },
    );
    expect(webhook.status()).toBe(400);
    const result = await webhook.json();
    expect(result.error.code).toBe('WEBHOOK_REJECTED');
  });

  test('checkout rejects missing order or invoice reference', async ({ request }) => {
    // FASE 6 — REQ-17-021: amount is no longer client-supplied, so the
    // equivalent "invalid amount" case is a checkout with no trusted
    // reference at all.
    const idempotencyKey = `invalid-${Date.now()}`;
    const checkout = await request.post(
      `${API_BASE}/api/client/v1/payments/checkout`,
      {
        headers: {
          'Idempotency-Key': idempotencyKey,
          'x-test-subject': 'local|client-owner',
        },
        data: {
          idempotencyKey,
        },
      },
    );
    expect(checkout.status()).toBe(400);
  });

  test('checkout requires authentication', async ({ request }) => {
    const checkout = await request.post(
      `${API_BASE}/api/client/v1/payments/checkout`,
      {
        data: {
          idempotencyKey: `no-auth-${Date.now()}`,
        },
      },
    );
    // No principal at all (no x-test-subject) is 401 Unauthorized; a wrong
    // audience/permission for an authenticated principal is 403 Forbidden
    // (audience.guard.ts UnauthorizedException vs a later guard's 403).
    expect(checkout.status()).toBe(401);
  });
});
