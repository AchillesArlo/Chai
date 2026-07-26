/**
 * Payment reconciliation activities for Temporal workflows.
 * Wraps payment provider polling logic.
 */

export interface PollPaymentInput {
  tenantId: string;
  externalId: string;
}

export interface PollPaymentResult {
  status: string;
  terminal: boolean;
}

export interface UpdatePaymentStatusInput {
  tenantId: string;
  externalId: string;
  status: string;
  terminal: boolean;
}

export interface NotifyPaymentTerminalInput {
  tenantId: string;
  externalId: string;
  status: string;
}

/**
 * Polls payment session from provider and returns status.
 * In production, delegates to payment connector.
 */
export async function pollPaymentSessionActivity(
  input: PollPaymentInput,
): Promise<PollPaymentResult | null> {
  const { tenantId, externalId } = input;

  console.log('[PaymentActivity] Polling payment session', {
    tenantId,
    externalId,
  });

  // Mock response - in production, call payment adapter
  return {
    status: 'PENDING',
    terminal: false,
  };
}

/**
 * Updates internal payment status in database.
 */
export async function updatePaymentStatusActivity(
  input: UpdatePaymentStatusInput,
): Promise<void> {
  const { tenantId, externalId, status, terminal } = input;

  console.log('[PaymentActivity] Updating payment status', {
    tenantId,
    externalId,
    status,
    terminal,
  });

  // TODO: Integrate with payment repository
  // await paymentRepository.updateStatus(tenantId, externalId, status, terminal);
}

/**
 * Notifies when payment reaches terminal status.
 */
export async function notifyPaymentTerminalActivity(
  input: NotifyPaymentTerminalInput,
): Promise<void> {
  const { tenantId, externalId, status } = input;

  console.log('[PaymentActivity] Payment reached terminal status', {
    tenantId,
    externalId,
    status,
  });

  // TODO: Integrate with notification service
  // await notificationService.send(tenantId, { type: 'PAYMENT_TERMINAL', externalId, status });
}
