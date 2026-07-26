/**
 * Temporal Client helper for triggering workflows from API endpoints.
 */

import { Connection, Client } from '@temporalio/client';
import { FollowUpWorkflow } from './workflows/follow-up.workflow.js';
import { PaymentReconcileWorkflow } from './workflows/payment-reconcile.workflow.js';
import { LogisticsPollWorkflow } from './workflows/logistics-poll.workflow.js';
import { TASK_QUEUES } from './types.js';

const TEMPORAL_ADDRESS = process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233';
const TEMPORAL_NAMESPACE = process.env['TEMPORAL_NAMESPACE'] ?? 'default';

let connection: Connection | null = null;
let client: Client | null = null;

/**
 * Gets or creates Temporal client connection.
 */
async function getClient(): Promise<Client> {
  if (!client) {
    connection = await Connection.connect({ address: TEMPORAL_ADDRESS });
    client = new Client({ connection, namespace: TEMPORAL_NAMESPACE });
  }
  return client;
}

/**
 * Starts a follow-up workflow.
 */
export async function startFollowUpWorkflow(input: {
  tenantId: string;
  jobId: string;
  automationRuleId: string;
  triggerEvent: { type: string; timestamp: string; payload: Record<string, unknown> };
}): Promise<string> {
  const client = await getClient();
  const handle = await client.workflow.start(FollowUpWorkflow, {
    args: [input],
    taskQueue: TASK_QUEUES.FOLLOW_UP,
    workflowId: `follow-up-${input.tenantId}-${input.jobId}`,
  });

  console.log('[TemporalClient] Started follow-up workflow', {
    workflowId: handle.workflowId,
    runId: handle.firstExecutionRunId,
  });

  return handle.workflowId;
}

/**
 * Starts a payment reconciliation workflow.
 */
export async function startPaymentReconcileWorkflow(input: {
  tenantId: string;
  externalId: string;
  maxAttempts?: number;
  pollIntervalSeconds?: number;
}): Promise<string> {
  const client = await getClient();
  const handle = await client.workflow.start(PaymentReconcileWorkflow, {
    args: [input],
    taskQueue: TASK_QUEUES.PAYMENT_RECONCILE,
    workflowId: `payment-reconcile-${input.tenantId}-${input.externalId}`,
  });

  console.log('[TemporalClient] Started payment reconcile workflow', {
    workflowId: handle.workflowId,
    runId: handle.firstExecutionRunId,
  });

  return handle.workflowId;
}

/**
 * Starts a logistics polling workflow.
 */
export async function startLogisticsPollWorkflow(input: {
  tenantId: string;
  orderId: string;
  maxPolls?: number;
  pollIntervalSeconds?: number;
}): Promise<string> {
  const client = await getClient();
  const handle = await client.workflow.start(LogisticsPollWorkflow, {
    args: [input],
    taskQueue: TASK_QUEUES.LOGISTICS_POLL,
    workflowId: `logistics-poll-${input.tenantId}-${input.orderId}`,
  });

  console.log('[TemporalClient] Started logistics poll workflow', {
    workflowId: handle.workflowId,
    runId: handle.firstExecutionRunId,
  });

  return handle.workflowId;
}

/**
 * Closes Temporal connection.
 */
export async function closeConnection(): Promise<void> {
  if (connection) {
    await connection.close();
    connection = null;
    client = null;
  }
}
