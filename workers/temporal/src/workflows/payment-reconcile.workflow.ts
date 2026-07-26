import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/payment.activities.js';

const {
  pollPaymentSessionActivity,
  updatePaymentStatusActivity,
  notifyPaymentTerminalActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 minutes',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumAttempts: 5,
  },
});

/**
 * PaymentReconcileWorkflow reconciles payment sessions by polling provider status.
 * Implements stop-on-paid pattern with UNKNOWN_RESULT handling.
 *
 * @param input - Reconciliation input with tenant, external ID, and polling config
 * @returns Result with final status and attempt count
 */
export async function PaymentReconcileWorkflow(input: {
  tenantId: string;
  externalId: string;
  maxAttempts?: number;
  pollIntervalSeconds?: number;
}): Promise<{
  externalId: string;
  status: string;
  terminal: boolean;
  attempts: number;
  reconciledAt: string;
}> {
  const { tenantId, externalId, maxAttempts = 10, pollIntervalSeconds = 30 } = input;

  let attempts = 0;
  let terminal = false;
  let status = 'PENDING';

  while (attempts < maxAttempts && !terminal) {
    attempts++;

    // Poll payment session from provider
    const result = await pollPaymentSessionActivity({
      tenantId,
      externalId,
    });

    if (!result) {
      // Session not found, wait and retry
      await sleep(pollIntervalSeconds * 1000);
      continue;
    }

    status = result.status;
    terminal = result.terminal;

    // Update internal status
    await updatePaymentStatusActivity({
      tenantId,
      externalId,
      status,
      terminal,
    });

    if (!terminal) {
      // Wait before next poll
      await sleep(pollIntervalSeconds * 1000);
    }
  }

  // Notify if terminal status reached
  if (terminal) {
    try {
      await notifyPaymentTerminalActivity({
        tenantId,
        externalId,
        status,
      });
    } catch {
      // Notification failure doesn't fail the workflow
    }
  }

  return {
    externalId,
    status,
    terminal,
    attempts,
    reconciledAt: new Date().toISOString(),
  };
}

/**
 * Sleep for specified milliseconds using Temporal's timer.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
