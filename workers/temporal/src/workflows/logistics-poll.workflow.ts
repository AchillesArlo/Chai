import { proxyActivities, sleep as temporalSleep } from '@temporalio/workflow';
import type * as activities from '../activities/logistics.activities.js';

const {
  pollLogisticsStatusActivity,
  updateLogisticsStatusActivity,
  notifyLogisticsDeliveredActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 minutes',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumAttempts: 5,
  },
});

/**
 * LogisticsPollWorkflow polls logistics status until delivery or max polls reached.
 * Uses Temporal's durable timer for poll intervals.
 *
 * @param input - Poll input with tenant, order ID, and polling config
 * @returns Result with final status and poll count
 */
export async function LogisticsPollWorkflow(input: {
  tenantId: string;
  orderId: string;
  maxPolls?: number;
  pollIntervalSeconds?: number;
}): Promise<{
  orderId: string;
  finalStatus: string;
  pollsPerformed: number;
  lastPolledAt: string;
}> {
  const { tenantId, orderId, maxPolls = 20, pollIntervalSeconds = 60 } = input;

  let pollsPerformed = 0;
  let finalStatus = 'IN_TRANSIT';
  let delivered = false;

  while (pollsPerformed < maxPolls && !delivered) {
    // Wait before polling (skip first wait)
    if (pollsPerformed > 0) {
      await temporalSleep(pollIntervalSeconds * 1000);
    }

    pollsPerformed++;

    // Poll logistics status from provider
    const result = await pollLogisticsStatusActivity({
      tenantId,
      orderId,
    });

    if (!result) {
      // Order not found in provider, continue polling
      continue;
    }

    finalStatus = result.status;
    delivered = result.delivered;

    // Update internal status
    await updateLogisticsStatusActivity({
      tenantId,
      orderId,
      status: finalStatus,
      delivered,
    });
  }

  // Notify on delivery
  if (delivered) {
    try {
      await notifyLogisticsDeliveredActivity({
        tenantId,
        orderId,
        status: finalStatus,
      });
    } catch {
      // Notification failure doesn't fail the workflow
    }
  }

  return {
    orderId,
    finalStatus,
    pollsPerformed,
    lastPolledAt: new Date().toISOString(),
  };
}
