import { describe, expect, it } from 'vitest';

import {
  createMockPaymentAdapter,
  signMockPaymentWebhook,
} from '../connectors/mock-payment/index.js';

describe('mock-payment adapter', () => {
  it('creates checkout idempotently and stops transitions after PAID', async () => {
    const adapter = createMockPaymentAdapter();
    const a = await adapter.createCheckout({
      amount: 50_000,
      currency: 'IDR',
      idempotencyKey: 'ord-1',
      tenantId: 'tenant-a',
    });
    const b = await adapter.createCheckout({
      amount: 50_000,
      currency: 'IDR',
      idempotencyKey: 'ord-1',
      tenantId: 'tenant-a',
    });
    expect(a.externalId).toBe(b.externalId);

    adapter.settle(a.externalId, 'PAID');
    const after = adapter.settle(a.externalId, 'FAILED');
    expect(after?.status).toBe('PAID');
  });

  it('rejects webhooks with bad signature', async () => {
    const adapter = createMockPaymentAdapter();
    const session = await adapter.createCheckout({
      amount: 10,
      currency: 'IDR',
      idempotencyKey: 'w1',
      tenantId: 't1',
    });
    const raw = new TextEncoder().encode(
      JSON.stringify({
        externalId: session.externalId,
        status: 'PAID',
        tenantId: 't1',
      }),
    );
    expect(adapter.verifyWebhook(raw, 'bad').verified).toBe(false);
    expect(adapter.verifyWebhook(raw, signMockPaymentWebhook(raw)).verified).toBe(true);
  });

  it('honors kill switch', async () => {
    const adapter = createMockPaymentAdapter({ killSwitch: true });
    await expect(
      adapter.createCheckout({
        amount: 1,
        currency: 'IDR',
        idempotencyKey: 'k',
        tenantId: 't',
      }),
    ).rejects.toThrow('PAYMENT_KILL_SWITCH');
  });
});
