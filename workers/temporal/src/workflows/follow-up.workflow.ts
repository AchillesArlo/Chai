import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/follow-up.activities.js';

const { executeFollowUpActivity, notifyCompletionActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
});

/**
 * FollowUpWorkflow processes follow-up jobs triggered by automation rules.
 *
 * @param input - Job input containing tenant, rule, and trigger event
 * @returns Result with execution status and timestamp
 */
export async function FollowUpWorkflow(input: {
  tenantId: string;
  jobId: string;
  automationRuleId: string;
  triggerEvent: { type: string; timestamp: string; payload: Record<string, unknown> };
}): Promise<{
  jobId: string;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  executedAt: string;
  error?: string;
}> {
  const { tenantId, jobId, automationRuleId, triggerEvent } = input;

  try {
    // Execute the follow-up job
    await executeFollowUpActivity({
      tenantId,
      jobId,
      automationRuleId,
      triggerEvent,
    });

    // Notify completion (best-effort)
    try {
      await notifyCompletionActivity({
        tenantId,
        jobId,
        status: 'COMPLETED',
      });
    } catch {
      // Notification failure doesn't fail the workflow
    }

    return {
      jobId,
      status: 'COMPLETED',
      executedAt: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Attempt to notify failure
    try {
      await notifyCompletionActivity({
        tenantId,
        jobId,
        status: 'FAILED',
      });
    } catch {
      // Notification failure doesn't fail the workflow
    }

    return {
      jobId,
      status: 'FAILED',
      executedAt: new Date().toISOString(),
      error: errorMessage,
    };
  }
}
