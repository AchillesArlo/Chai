export type FollowUpJobStatus = 'PENDING' | 'CLAIMED' | 'DONE' | 'FAILED';

export interface FollowUpJob {
  id: string;
  tenant_id: string;
  conversation_id: string | null;
  due_at: Date;
  status: FollowUpJobStatus;
  attempt: number;
  max_attempts: number;
  payload: Record<string, unknown>;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ScheduleFollowUpInput {
  tenantId: string;
  conversationId?: string | null;
  dueAt: Date;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
}

export interface RunAutomationWorkerOptions {
  tenantId: string;
  intervalMs?: number;
  maxIterations?: number;
  handler?: (job: FollowUpJob) => Promise<void>;
  now?: () => Date;
  /** Ends the loop when aborted (roster window boundary / shutdown). */
  signal?: AbortSignal;
}
