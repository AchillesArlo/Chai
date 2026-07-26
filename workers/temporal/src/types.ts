/**
 * Shared types for Temporal workflows and activities.
 */

// ── Follow-Up Types ──────────────────────────────────────────────────────────

export interface FollowUpJobInput {
  tenantId: string;
  jobId: string;
  automationRuleId: string;
  triggerEvent: AutomationEvent;
}

export interface AutomationEvent {
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface FollowUpJobResult {
  jobId: string;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  executedAt: string;
  error?: string;
}

// ── Payment Reconciliation Types ─────────────────────────────────────────────

export interface PaymentReconcileInput {
  tenantId: string;
  externalId: string;
  maxAttempts?: number;
  pollIntervalSeconds?: number;
}

export interface PaymentReconcileResult {
  externalId: string;
  status: string;
  terminal: boolean;
  attempts: number;
  reconciledAt: string;
}

// ── Logistics Polling Types ──────────────────────────────────────────────────

export interface LogisticsPollInput {
  tenantId: string;
  orderId: string;
  maxPolls?: number;
  pollIntervalSeconds?: number;
}

export interface LogisticsPollResult {
  orderId: string;
  finalStatus: string;
  pollsPerformed: number;
  lastPolledAt: string;
}

// ── Task Queue Names ─────────────────────────────────────────────────────────

export const TASK_QUEUES = {
  FOLLOW_UP: 'follow-up-queue',
  PAYMENT_RECONCILE: 'payment-reconcile-queue',
  LOGISTICS_POLL: 'logistics-poll-queue',
} as const;

// ── Workflow IDs ─────────────────────────────────────────────────────────────

export const WORKFLOW_IDS = {
  FOLLOW_UP: 'follow-up-workflow',
  PAYMENT_RECONCILE: 'payment-reconcile-workflow',
  LOGISTICS_POLL: 'logistics-poll-workflow',
} as const;
