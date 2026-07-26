/**
 * Follow-up activities for Temporal workflows.
 * These activities wrap existing domain functions and provide Temporal-compatible interfaces.
 */

export interface ExecuteFollowUpInput {
  tenantId: string;
  jobId: string;
  automationRuleId: string;
  triggerEvent: { type: string; timestamp: string; payload: Record<string, unknown> };
}

export interface NotifyCompletionInput {
  tenantId: string;
  jobId: string;
  status: 'COMPLETED' | 'FAILED';
}

/**
 * Executes a follow-up job by delegating to the automation worker's handler.
 * In production, this would call the actual domain function or API endpoint.
 */
export async function executeFollowUpActivity(input: ExecuteFollowUpInput): Promise<void> {
  const { tenantId, jobId, automationRuleId, triggerEvent } = input;

  // TODO: Integrate with actual automation execution
  // For now, simulate execution by calling the domain function
  // In production: await executeAutomation(adapter, tenantId, triggerEvent);

  console.log('[FollowUpActivity] Executing job', {
    tenantId,
    jobId,
    automationRuleId,
    eventType: triggerEvent.type,
  });

  // Simulate work
  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log('[FollowUpActivity] Job executed successfully', { jobId });
}

/**
 * Notifies completion status (best-effort, non-critical).
 */
export async function notifyCompletionActivity(input: NotifyCompletionInput): Promise<void> {
  const { tenantId, jobId, status } = input;

  // TODO: Integrate with notification service
  console.log('[FollowUpActivity] Notifying completion', {
    tenantId,
    jobId,
    status,
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
}
