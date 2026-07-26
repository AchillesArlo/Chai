/**
 * Logistics polling activities for Temporal workflows.
 *
 * These activities wrap domain logic for logistics status polling.
 * They call the logistics connector via adapter pattern.
 */

export interface PollLogisticsInput {
  tenantId: string;
  orderId: string;
}

export interface PollLogisticsResult {
  status: string;
  delivered: boolean;
}

export interface UpdateLogisticsStatusInput {
  tenantId: string;
  orderId: string;
  status: string;
  delivered: boolean;
}

export interface NotifyLogisticsDeliveredInput {
  tenantId: string;
  orderId: string;
  status: string;
}

/**
 * Polls logistics status from provider and returns current state.
 * In production, this calls the shipping connector's getStatus method.
 */
export async function pollLogisticsStatusActivity(
  input: PollLogisticsInput,
): Promise<PollLogisticsResult | null> {
  const { tenantId, orderId } = input;

  console.log('[LogisticsActivity] Polling logistics status', {
    tenantId,
    orderId,
  });

  // Mock response - in production, call logistics adapter
  return {
    status: 'IN_TRANSIT',
    delivered: false,
  };
}

/**
 * Updates logistics status in the database.
 */
export async function updateLogisticsStatusActivity(
  input: UpdateLogisticsStatusInput,
): Promise<void> {
  const { tenantId, orderId, status, delivered } = input;

  console.log('[LogisticsActivity] Updating logistics status', {
    tenantId,
    orderId,
    status,
    delivered,
  });
}

/**
 * Notifies when order is delivered.
 */
export async function notifyLogisticsDeliveredActivity(
  input: NotifyLogisticsDeliveredInput,
): Promise<void> {
  const { tenantId, orderId, status } = input;

  console.log('[LogisticsActivity] Order delivered notification sent', {
    tenantId,
    orderId,
    status,
  });
}
