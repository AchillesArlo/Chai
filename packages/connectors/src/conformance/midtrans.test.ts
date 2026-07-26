import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { createMidtransAdapter } from '../connectors/midtrans/index.js';

function sign(orderId: string, statusCode: string, grossAmount: string, serverKey: string): string {
  return createHash('sha512')
    .update(orderId + statusCode + grossAmount + serverKey)
    .digest('hex');
}

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json' },
      status,
    }),
  ) as unknown as typeof globalThis.fetch;
}

describe('midtrans adapter (fallback / no server key)', () => {
  it('creates a session in mock mode and reports not live', async () => {
    const adapter = createMidtransAdapter({});
    expect(adapter.isLive()).toBe(false);
    const session = await adapter.createCheckoutSession({
      amount: 25000,
      currency: 'IDR',
      idempotencyKey: 'k1',
      tenantId: 'tenant-a',
    });
    expect(session.provider).toBe('midtrans');
    expect(session.status).toBe('PENDING');
    expect(session.tenantId).toBe('tenant-a');
  });

  it('rejects the webhook without the mock signature', () => {
    const adapter = createMidtransAdapter({});
    const payload = JSON.stringify({
      gross_amount: '25000.00',
      order_id: 'tenant-a|abc',
      status_code: '200',
      transaction_id: 'tx-1',
      transaction_status: 'settlement',
      transaction_time: new Date().toISOString(),
    });
    const result = adapter.handleWebhook(payload, 'wrong-signature');
    expect(result.verified).toBe(false);
    expect(result.event).toBeNull();
  });

  it('refuses a webhook when no server key is configured', () => {
    // Sandbox is not an excuse to skip verification: without a key there is
    // nothing to verify against, so the webhook is refused.
    const adapter = createMidtransAdapter({});
    const payload = JSON.stringify({
      gross_amount: '25000.00',
      order_id: 'tenant-a|abc',
      status_code: '200',
      transaction_id: 'tx-1',
      transaction_status: 'settlement',
      transaction_time: new Date().toISOString(),
    });

    expect(adapter.handleWebhook(payload, 'any-signature').verified).toBe(false);
  });

  it('accepts a webhook signed with the configured server key', () => {
    const serverKey = 'sandbox-server-key';
    const adapter = createMidtransAdapter({ serverKey });
    const body = {
      gross_amount: '25000.00',
      order_id: 'tenant-a|abc',
      status_code: '200',
      transaction_id: 'tx-1',
      transaction_status: 'settlement',
      transaction_time: new Date().toISOString(),
    };
    const signature = createHash('sha512')
      .update(
        `${body.order_id}${body.status_code}${body.gross_amount}${serverKey}`,
      )
      .digest('hex');

    const result = adapter.handleWebhook(JSON.stringify(body), signature);
    expect(result.verified).toBe(true);
    expect(result.event?.status).toBe('PAID');
    expect(result.event?.tenantId).toBe('tenant-a');
    expect(result.event?.externalId).toBe('abc');
  });

  it('respects the kill switch', async () => {
    const adapter = createMidtransAdapter({});
    adapter.setKillSwitch(true);
    await expect(
      adapter.createCheckoutSession({
        amount: 1,
        currency: 'IDR',
        idempotencyKey: 'k',
        tenantId: 't',
      }),
    ).rejects.toThrow('PAYMENT_KILL_SWITCH');
  });
});

describe('midtrans adapter (live / server key present)', () => {
  const serverKey = 'SB-Mid-server-TEST1234';

  it('creates a checkout session via Snap API with Basic auth', async () => {
    const captured: { headers: Headers; body: string; url: string } = {
      body: '',
      headers: new Headers(),
      url: '',
    };
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      captured.body = String(init.body);
      captured.headers = new Headers(init.headers);
      captured.url = String(url);
      return new Response(
        JSON.stringify({ redirect_url: 'https://snap.example/xyz', token: 'snap-token-123' }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      );
    }) as unknown as typeof globalThis.fetch;

    const adapter = createMidtransAdapter({ serverKey, fetch: fetchImpl });
    expect(adapter.isLive()).toBe(true);

    const session = await adapter.createCheckoutSession({
      amount: 99000,
      currency: 'IDR',
      idempotencyKey: 'idem-1',
      tenantId: 'tenant-b',
    });

    expect(session.status).toBe('PENDING');
    expect(session.providerToken).toBe('snap-token-123');
    expect(session.redirectUrl).toBe('https://snap.example/xyz');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(captured.url).toBe('https://app.sandbox.midtrans.com/snap/v1/transactions');
    expect(captured.headers.get('Authorization')).toBe(
      'Basic ' + Buffer.from(`${serverKey}:`).toString('base64'),
    );
    const sent = JSON.parse(captured.body);
    expect(sent.transaction_details.gross_amount).toBe(99000);
    expect(sent.transaction_details.order_id).toBe(`tenant-b|${session.externalId}`);
    expect(captured.headers.get('Idempotency-Key')).toBe('idem-1');
  });

  it('throws on non-ok Snap response', async () => {
    const fetchImpl = fakeFetch(400, { error_message: 'bad request' });
    const adapter = createMidtransAdapter({ serverKey, fetch: fetchImpl });
    await expect(
      adapter.createCheckoutSession({
        amount: 1,
        currency: 'IDR',
        idempotencyKey: 'k',
        tenantId: 't',
      }),
    ).rejects.toThrow('MIDTRANS_CREATE_FAILED');
  });

  it('rehydrates status from cache after creation and updates on poll', async () => {
    let statusCall = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes('/snap/v1/transactions')) {
        return new Response(JSON.stringify({ token: 'tok', redirect_url: 'r' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      statusCall += 1;
      return new Response(
        JSON.stringify({
          gross_amount: '99000.00',
          order_id: 'tenant-b|abc',
          status_code: '200',
          transaction_status: statusCall === 1 ? 'pending' : 'settlement',
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      );
    }) as unknown as typeof globalThis.fetch;

    const adapter = createMidtransAdapter({ serverKey, fetch: fetchImpl });
    const created = await adapter.createCheckoutSession({
      amount: 99000,
      currency: 'IDR',
      idempotencyKey: 'idem-1',
      tenantId: 'tenant-b',
    });
    const first = await adapter.getSessionStatus('tenant-b', created.externalId);
    const second = await adapter.getSessionStatus('tenant-b', created.externalId);
    expect(first?.status).toBe('PENDING');
    expect(second?.status).toBe('PAID');
    expect(second?.amount).toBe(99000);
  });

  it('returns null on 404 status lookup', async () => {
    const fetchImpl = fakeFetch(404, { error_message: 'not found' });
    const adapter = createMidtransAdapter({ serverKey, fetch: fetchImpl });
    const result = await adapter.getSessionStatus('tenant-b', 'missing');
    expect(result).toBeNull();
  });

  it('verifies a real Midtrans SHA-512 webhook signature', () => {
    const adapter = createMidtransAdapter({ serverKey });
    const orderId = 'tenant-b|order-42';
    const statusCode = '200';
    const grossAmount = '50000.00';
    const signature = sign(orderId, statusCode, grossAmount, serverKey);
    const payload = JSON.stringify({
      gross_amount: grossAmount,
      order_id: orderId,
      status_code: statusCode,
      transaction_id: 'tx-99',
      transaction_status: 'settlement',
      transaction_time: new Date().toISOString(),
    });
    const result = adapter.handleWebhook(payload, signature);
    expect(result.verified).toBe(true);
    expect(result.event?.status).toBe('PAID');
  });

  it('rejects a tampered signature', () => {
    const adapter = createMidtransAdapter({ serverKey });
    const payload = JSON.stringify({
      gross_amount: '50000.00',
      order_id: 'tenant-b|order-42',
      status_code: '200',
      transaction_id: 'tx-99',
      transaction_status: 'settlement',
      transaction_time: new Date().toISOString(),
    });
    const result = adapter.handleWebhook(payload, 'a'.repeat(128));
    expect(result.verified).toBe(false);
  });

  it('maps expire/cancel/deny transaction statuses correctly', () => {
    const adapter = createMidtransAdapter({ serverKey });
    const cases: Array<[string, string]> = [
      ['expire', 'EXPIRED'],
      ['cancel', 'FAILED'],
      ['deny', 'FAILED'],
      ['capture', 'PAID'],
      ['pending', 'PENDING'],
      ['authorize', 'PENDING'],
    ];
    for (const [raw, expected] of cases) {
      const sig = sign('t|o', '200', '1.00', serverKey);
      const result = adapter.handleWebhook(
        JSON.stringify({
          gross_amount: '1.00',
          order_id: 't|o',
          status_code: '200',
          transaction_id: 'tx',
          transaction_status: raw,
          transaction_time: new Date().toISOString(),
        }),
        sig,
      );
      expect(result.event?.status, `raw=${raw}`).toBe(expected as never);
    }
  });
});
