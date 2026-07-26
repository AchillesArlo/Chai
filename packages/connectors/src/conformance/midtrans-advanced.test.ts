import { describe, expect, it, vi } from 'vitest';

import { createMidtransAdapter } from '../connectors/midtrans/index.js';

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json' },
      status,
    }),
  ) as unknown as typeof globalThis.fetch;
}

describe('midtrans adapter refund + settlement (S4-1)', () => {
  it('issues a refund against a mock-mode session without network access', async () => {
    const adapter = createMidtransAdapter({});
    expect(adapter.isLive()).toBe(false);

    const session = await adapter.createCheckoutSession({
      amount: 25_000,
      currency: 'IDR',
      idempotencyKey: 'checkout-s4-1',
      tenantId: 'tenant-s4-1',
    });

    const refund = await adapter.issueRefund({
      amount: 5_000,
      externalId: session.externalId,
      idempotencyKey: 'refund-s4-1-1',
      reason: 'partial refund',
      tenantId: 'tenant-s4-1',
    });
    expect(refund.externalId).toBe(session.externalId);
    expect(refund.reason).toBe('partial refund');
    expect(refund.refundAmount).toBe(5_000);
    expect(refund.tenantId).toBe('tenant-s4-1');
    expect(refund.status).toBe('completed');
  });

  it('rejects a refund when the mock session does not exist', async () => {
    const adapter = createMidtransAdapter({});
    await expect(
      adapter.issueRefund({
        amount: 5_000,
        externalId: 'no-such-session',
        idempotencyKey: 'refund-s4-1-missing',
        reason: 'missing',
        tenantId: 'tenant-s4-1',
      }),
    ).rejects.toThrow('MIDTRANS_REFUND_TARGET_NOT_FOUND');
  });

  it('returns an empty settlement list in mock mode', async () => {
    const adapter = createMidtransAdapter({});
    const settlements = await adapter.listSettlements('tenant-s4-1');
    expect(settlements).toEqual([]);
  });

  it('issues a refund against the live sandbox endpoint and surfaces the provider ref', async () => {
    const fetchImpl = fakeFetch(200, {
      refund_chargeback_id: 'rb-ref-123',
      status_code: '200',
    });
    const adapter = createMidtransAdapter({
      fetch: fetchImpl,
      sandbox: true,
      serverKey: 'sb-server-key',
    });
    expect(adapter.isLive()).toBe(true);

    const refund = await adapter.issueRefund({
      amount: 7_500,
      externalId: 'ext-1',
      idempotencyKey: 'refund-s4-1-live',
      reason: 'sandbox refund',
      tenantId: 'tenant-s4-1',
    });
    expect(refund.providerRef).toBe('rb-ref-123');
    expect(refund.status).toBe('pending');
    expect(refund.refundAmount).toBe(7_500);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = vi.mocked(fetchImpl).mock.calls[0]?.[0];
    expect(typeof call).toBe('string');
    expect(call as string).toContain('/refund/online');
  });

  it('surfaces a refund failure from the live endpoint', async () => {
    const fetchImpl = fakeFetch(400, { status_code: '400' });
    const adapter = createMidtransAdapter({
      fetch: fetchImpl,
      sandbox: true,
      serverKey: 'sb-server-key',
    });
    await expect(
      adapter.issueRefund({
        amount: 7_500,
        externalId: 'ext-1',
        idempotencyKey: 'refund-s4-1-fail',
        reason: 'sandbox refund',
        tenantId: 'tenant-s4-1',
      }),
    ).rejects.toThrow('MIDTRANS_REFUND_FAILED');
  });

  it('maps a live settlement report to tenant-scoped records', async () => {
    const fetchImpl = fakeFetch(200, [
      {
        fee_amount: '750',
        gross_amount: '25000.00',
        net_amount: '24250.00',
        order_id: 'tenant-s4-1|ext-1',
        settlement_ref: 'set-ref-1',
        settlement_time: '2026-01-15T03:00:00Z',
      },
      {
        fee_amount: '500',
        gross_amount: '10000.00',
        net_amount: '9500.00',
        order_id: 'tenant-other|ext-2',
        settlement_ref: 'set-ref-2',
        settlement_time: '2026-01-16T03:00:00Z',
      },
    ]);
    const adapter = createMidtransAdapter({
      fetch: fetchImpl,
      sandbox: true,
      serverKey: 'sb-server-key',
    });
    const settlements = await adapter.listSettlements('tenant-s4-1');
    expect(settlements).toHaveLength(1);
    const record = settlements[0];
    expect(record?.externalId).toBe('ext-1');
    expect(record?.grossAmount).toBe(25_000);
    expect(record?.feeAmount).toBe(750);
    expect(record?.netAmount).toBe(24_250);
    expect(record?.tenantId).toBe('tenant-s4-1');
    expect(record?.settlementRef).toBe('set-ref-1');
    expect(record?.provider).toBe('midtrans');
    expect(record?.settledAt.toISOString()).toBe('2026-01-15T03:00:00.000Z');
  });
});
