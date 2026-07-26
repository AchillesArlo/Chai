import { describe, expect, it } from 'vitest';

import {
  createMockShippingAdapter,
} from '../connectors/mock-shipping/index.js';
import {
  JNE_STATUS_MAP_VERSION,
  mapJneMilestone,
} from '../connectors/jne/index.js';

/**
 * Fase 2 (R-08, R-14) regression for the logistics canonical layer.
 *
 * These fail if an unrecognised carrier code is ever guessed into a moving
 * status again, if the mapping stops carrying its version, or if a redelivered
 * scan can be appended to an immutable timeline twice.
 */
describe('canonical shipment status mapping', () => {
  it('maps known provider codes', () => {
    expect(mapJneMilestone('DELIVERED').code).toBe('DELIVERED');
    expect(mapJneMilestone('on delivery').code).toBe('OUT_FOR_DELIVERY');
    expect(mapJneMilestone('MANIFEST').code).toBe('PICKED_UP');
  });

  it('fails safe to UNKNOWN for a code it does not recognise', () => {
    const mapped = mapJneMilestone('SOME_NEW_CARRIER_CODE');
    expect(mapped.code).toBe('UNKNOWN');
    expect(mapped.unmapped).toBe(true);
    // The provider code is retained as diagnostic metadata for the mapping alert.
    expect(mapped.providerCode).toBe('SOME_NEW_CARRIER_CODE');
  });

  it('fails safe to UNKNOWN when the provider sends no code', () => {
    const mapped = mapJneMilestone(undefined);
    expect(mapped.code).toBe('UNKNOWN');
    expect(mapped.unmapped).toBe(true);
  });

  it('never guesses IN_TRANSIT for an unmapped code', () => {
    for (const code of ['???', 'HELD_AT_CUSTOMS_NEW', '']) {
      expect(mapJneMilestone(code).code).not.toBe('IN_TRANSIT');
    }
  });

  it('carries the mapping version so a projection is traceable', () => {
    expect(mapJneMilestone('DELIVERED').mappingVersion).toBe(
      JNE_STATUS_MAP_VERSION,
    );
  });
});

describe('tracking timeline deduplication', () => {
  it('ignores a redelivered provider event', () => {
    const adapter = createMockShippingAdapter();
    adapter.linkShipment({
      carrier: 'jne',
      tenantId: 't1',
      trackingNumber: 'TRK-1',
    });

    const scan = {
      at: new Date('2026-07-26T10:00:00Z'),
      code: 'IN_TRANSIT' as const,
      description: 'Departed hub',
      eventId: 'provider-evt-1',
    };
    adapter.appendEvent('t1', 'TRK-1', scan);
    const afterDuplicate = adapter.appendEvent('t1', 'TRK-1', scan);

    const transitEvents = afterDuplicate?.events.filter(
      (event) => event.eventId === 'provider-evt-1',
    );
    expect(transitEvents).toHaveLength(1);
  });

  it('orders out-of-order scans by provider time', () => {
    const adapter = createMockShippingAdapter();
    adapter.linkShipment({
      carrier: 'jne',
      tenantId: 't1',
      trackingNumber: 'TRK-2',
    });

    adapter.appendEvent('t1', 'TRK-2', {
      at: new Date('2026-07-26T12:00:00Z'),
      code: 'DELIVERED',
      description: 'Delivered',
      eventId: 'evt-late',
    });
    const record = adapter.appendEvent('t1', 'TRK-2', {
      at: new Date('2026-07-26T09:00:00Z'),
      code: 'IN_TRANSIT',
      description: 'Departed hub',
      eventId: 'evt-early',
    });

    // The earlier scan arriving later must not roll the status backwards.
    expect(record?.status).toBe('DELIVERED');
    expect(record?.events.map((event) => event.eventId)).toEqual([
      expect.any(String),
      'evt-early',
      'evt-late',
    ]);
  });
});
