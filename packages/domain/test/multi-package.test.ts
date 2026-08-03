import { describe, expect, it } from 'vitest';

import {
  calculateFulfillmentStatus,
  splitShipmentIntoPackages,
  type FulfillmentPackage,
} from '../src/advanced-logistics/multi-package';

describe('Multi-package partial fulfillment (REQ-17-071)', () => {
  it('returns UNFULFILLED when no packages exist', () => {
    expect(calculateFulfillmentStatus(10, [])).toBe('UNFULFILLED');
  });

  it('returns PARTIAL when some items are packaged', () => {
    const packages: FulfillmentPackage[] = [
      {
        carrierId: 'jne',
        items: [{ itemId: 'item-1', quantity: 3 }],
        packageId: 'pkg-1',
        status: 'DISPATCHED',
        trackingNumber: 'JNE123',
      },
    ];
    expect(calculateFulfillmentStatus(5, packages)).toBe('PARTIAL');
  });

  it('returns FULFILLED when all items are packaged', () => {
    const packages: FulfillmentPackage[] = [
      {
        carrierId: 'jne',
        items: [{ itemId: 'item-1', quantity: 3 }],
        packageId: 'pkg-1',
        status: 'DISPATCHED',
        trackingNumber: 'JNE123',
      },
      {
        carrierId: 'jnt',
        items: [{ itemId: 'item-2', quantity: 2 }],
        packageId: 'pkg-2',
        status: 'DISPATCHED',
        trackingNumber: 'JNT456',
      },
    ];
    expect(calculateFulfillmentStatus(5, packages)).toBe('FULFILLED');
  });

  it('splits shipment into distinct packages', () => {
    const result = splitShipmentIntoPackages({
      orderId: 'ord-100',
      packages: [
        {
          carrierId: 'sicepat',
          items: [{ itemId: 'item-1', quantity: 2 }],
          trackingNumber: 'REG123',
        },
        {
          carrierId: 'sicepat',
          items: [{ itemId: 'item-2', quantity: 1 }],
          trackingNumber: 'REG124',
        },
      ],
      shipmentId: 'ship-50',
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.packageId).toBe('pkg-ship-50-1');
    expect(result[1]?.packageId).toBe('pkg-ship-50-2');
  });
});
