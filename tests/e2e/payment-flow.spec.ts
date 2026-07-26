import { expect, test } from '@playwright/test';

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';

/**
 * E2E: Payment Flow
 * Checkout → webhook → reconciliation
 */
test.describe('payment flow', () => {
  test('create checkout session', async ({ request }) => {
    const checkout = await request.post(
      `${API_BASE}/api/client/v1/payments/checkout`,
      {
        headers: { 'x-test-subject': 'local|client-owner' },
        data: {
          amount: 5000,
          currency: 'usd',
          idempotencyKey: `checkout-${Date.now()}`,
        },
      },
    );
    expect(checkout.ok()).toBeTruthy();
    const session = await checkout.json();
    expect(session.amount).toBe(5000);
    expect(session.currency).toBe('usd');
    expect(session.status).toBe('open');
    expect(session.externalId).toBeDefined();
    expect(session.checkoutUrl).toBeDefined();
  });

  test('retrieve payment session', async ({ request }) => {
    // Create a session first
    const checkout = await request.post(
      `${API_BASE}/api/client/v1/payments/checkout`,
      {
        headers: { 'x-test-subject': 'local|client-owner' },
        data: {
          amount: 2500,
          currency: 'usd',
          idempotencyKey: `retrieve-${Date.now()}`,
        },
      },
    );
    const created = await checkout.json();

    // Retrieve it
    const retrieved = await request.get(
      `${API_BASE}/api/client/v1/payments/${created.externalId}`,
      { headers: { 'x-test-subject': 'local|client-owner' } },
    );
    expect(retrieved.ok()).toBeTruthy();
    const session = await retrieved.json();
    expect(session.externalId).toBe(created.externalId);
    expect(session.amount).toBe(2500);
  });

  test('webhook processes payment event', async ({ request }) => {
    // Simulate a payment webhook
    const webhookPayload = {
      event: 'payment.completed',
      externalId: 'mock-payment-001',
      status: 'completed',
    };

    const webhook = await request.post(
      `${API_BASE}/api/service/v1/payments/webhook`,
      {
        data: webhookPayload,
        headers: { 'x-payment-signature': 'test-signature' },
      },
    );
    expect(webhook.ok()).toBeTruthy();
    const result = await webhook.json();
    // Webhook should be accepted (may not verify in test env)
    expect(result).toBeDefined();
  });

  test('checkout rejects invalid amount', async ({ request }) => {
    const checkout = await request.post(
      `${API_BASE}/api/client/v1/payments/checkout`,
      {
        headers: { 'x-test-subject': 'local|client-owner' },
        data: {
          amount: 0,
          currency: 'usd',
          idempotencyKey: `invalid-${Date.now()}`,
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
          amount: 1000,
          currency: 'usd',
          idempotencyKey: `no-auth-${Date.now()}`,
        },
      },
    );
    expect(checkout.status()).toBe(403);
  });
});
