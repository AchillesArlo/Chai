export interface FulfillmentItem {
  itemId: string;
  quantity: number;
  sku?: string;
  title?: string;
}

export interface FulfillmentPackage {
  packageId: string;
  trackingNumber: string;
  carrierId: string;
  status: 'PENDING' | 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED' | 'EXCEPTION';
  items: FulfillmentItem[];
  shippedAt?: Date;
  deliveredAt?: Date;
}

export interface SplitShipmentInput {
  orderId: string;
  shipmentId: string;
  packages: Array<{
    carrierId: string;
    items: FulfillmentItem[];
    trackingNumber: string;
  }>;
}

export type OrderFulfillmentStatus = 'UNFULFILLED' | 'PARTIAL' | 'FULFILLED' | 'EXCEPTION';

/**
 * Evaluates the overall fulfillment status of an order given its set of packages
 * and required total items count (REQ-17-071 multi-package partial fulfillment).
 */
export function calculateFulfillmentStatus(
  totalRequiredItems: number,
  packages: FulfillmentPackage[],
): OrderFulfillmentStatus {
  if (packages.length === 0) return 'UNFULFILLED';
  if (packages.some((p) => p.status === 'EXCEPTION')) return 'EXCEPTION';

  const fulfilledItemsCount = packages.reduce((sum, pkg) => {
    return sum + pkg.items.reduce((itemSum, item) => itemSum + item.quantity, 0);
  }, 0);

  if (fulfilledItemsCount >= totalRequiredItems) {
    return 'FULFILLED';
  }
  if (fulfilledItemsCount > 0) {
    return 'PARTIAL';
  }
  return 'UNFULFILLED';
}

/**
 * Splits an inbound shipment into multiple distinct packages for partial fulfillment.
 */
export function splitShipmentIntoPackages(
  input: SplitShipmentInput,
): FulfillmentPackage[] {
  return input.packages.map((pkg, index) => ({
    carrierId: pkg.carrierId,
    items: pkg.items,
    packageId: `pkg-${input.shipmentId}-${index + 1}`,
    status: 'DISPATCHED',
    trackingNumber: pkg.trackingNumber,
  }));
}
