import { describe, expect, it } from 'vitest';

import { createMockPaymentAdapter } from '@chai/connectors/mock-payment';

import { pollAndReconcile } from '../src/index';

describe('payment reconciliation', () => {
  it('reports terminal after PAID', async () => {
    const adapter = createMockPaymentAdapter();
    const session = await adapter.createCheckout({
      amount: 100,
      currency: 'IDR',
      idempotencyKey: 'r1',
      tenantId: 't1',
    });
    adapter.settle(session.externalId, 'PAID');
    const result = await pollAndReconcile(adapter, 't1', session.externalId);
    expect(result).toEqual({ status: 'PAID', terminal: true });
  });

  it('keeps PENDING non-terminal', async () => {
    const adapter = createMockPaymentAdapter();
    const session = await adapter.createCheckout({
      amount: 100,
      currency: 'IDR',
      idempotencyKey: 'r2',
      tenantId: 't1',
    });
    const result = await pollAndReconcile(adapter, 't1', session.externalId);
    expect(result?.terminal).toBe(false);
  });
});
