import { describe, expect, it } from 'vitest';

import { createMockShippingAdapter } from '../connectors/mock-shipping/index.js';

describe('mock-shipping adapter', () => {
  it('links once and keeps timeline append-only sorted', () => {
    const adapter = createMockShippingAdapter();
    const linked = adapter.linkShipment({
      carrier: 'mock-express',
      tenantId: 't1',
      trackingNumber: 'TRK1',
    });
    const again = adapter.linkShipment({
      carrier: 'mock-express',
      tenantId: 't1',
      trackingNumber: 'TRK1',
    });
    expect(linked.trackingNumber).toBe(again.trackingNumber);

    const late = new Date('2026-07-18T12:00:00Z');
    const early = new Date('2026-07-18T10:00:00Z');
    adapter.appendEvent('t1', 'TRK1', {
      at: late,
      code: 'DELIVERED',
      description: 'Delivered',
    });
    adapter.appendEvent('t1', 'TRK1', {
      at: early,
      code: 'IN_TRANSIT',
      description: 'In transit',
    });
    const view = adapter.customerView('t1', 'TRK1');
    expect(view?.timeline.map((e) => e.code)).toEqual([
      'LINKED',
      'IN_TRANSIT',
      'DELIVERED',
    ]);
  });

  it('isolates tenants', () => {
    const adapter = createMockShippingAdapter();
    adapter.linkShipment({
      carrier: 'mock-express',
      tenantId: 'a',
      trackingNumber: 'X',
    });
    expect(adapter.getShipment('b', 'X')).toBeNull();
  });
});
