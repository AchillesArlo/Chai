import { randomUUID } from 'node:crypto';

import type { Database, DatabaseTransaction } from '@chai/database';

import type { FollowUpJob, FollowUpJobStatus, ScheduleFollowUpInput } from './types';

function rowToJob(row: FollowUpJobRow): FollowUpJob {
  return {
    ...row,
    payload: (row.payload ?? {}) as Record<string, unknown>,
  };
}

interface FollowUpJobRow {
  id: string;
  tenant_id: string;
  conversation_id: string | null;
  due_at: Date;
  status: FollowUpJobStatus;
  attempt: number;
  max_attempts: number;
  payload: unknown;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function scheduleFollowUp(
  tx: DatabaseTransaction,
  input: ScheduleFollowUpInput,): Promise<FollowUpJob> {
  const id = randomUUID();
  const rows = await tx<FollowUpJobRow[]>`
    INSERT INTO chai.follow_up_job
      (id, tenant_id, conversation_id, due_at, max_attempts, payload)
    VALUES
      (${id}, ${input.tenantId}, ${input.conversationId ?? null},
       ${input.dueAt}, ${input.maxAttempts ?? 3},
       ${tx.json((input.payload ?? {}) as Parameters<typeof tx.json>[0])})
    RETURNING id, tenant_id, conversation_id, due_at, status, attempt,
              max_attempts, payload, last_error, created_at, updated_at
  `;
  return rowToJob(rows[0] as FollowUpJobRow);
}

export async function claimDueJobs(
  tx: DatabaseTransaction,
  tenantId: string,
  now: Date,
  limit = 10,
): Promise<FollowUpJob[]> {
  const rows = await tx<FollowUpJobRow[]>`
    UPDATE chai.follow_up_job
    SET status = 'CLAIMED', updated_at = now()
    WHERE id IN (
      SELECT id FROM chai.follow_up_job
      WHERE tenant_id = ${tenantId}
        AND status = 'PENDING'
        AND due_at <= ${now}
      ORDER BY due_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    RETURNING id, tenant_id, conversation_id, due_at, status, attempt,
              max_attempts, payload, last_error, created_at, updated_at
  `;
  return rows.map((row) => rowToJob(row as FollowUpJobRow));
}

export async function completeJob(
  tx: DatabaseTransaction,
  jobId: string,
): Promise<FollowUpJob | null> {
  const rows = await tx<FollowUpJobRow[]>`
    UPDATE chai.follow_up_job
    SET status = 'DONE', last_error = NULL, updated_at = now()
    WHERE id = ${jobId}
    RETURNING id, tenant_id, conversation_id, due_at, status, attempt,
              max_attempts, payload, last_error, created_at, updated_at
  `;
  return rows.length === 0 ? null : rowToJob(rows[0] as FollowUpJobRow);
}

export async function failJob(
  tx: DatabaseTransaction,
  jobId: string,
  error: unknown,
): Promise<FollowUpJob | null> {
  const message = errorMessage(error);
  const rows = await tx<FollowUpJobRow[]>`
    UPDATE chai.follow_up_job
    SET attempt = attempt + 1,
        status = CASE
          WHEN attempt + 1 >= max_attempts THEN 'FAILED'
          ELSE 'PENDING'
        END,
        last_error = ${message},
        updated_at = now()
    WHERE id = ${jobId}
    RETURNING id, tenant_id, conversation_id, due_at, status, attempt,
              max_attempts, payload, last_error, created_at, updated_at
  `;
  return rows.length === 0 ? null : rowToJob(rows[0] as FollowUpJobRow);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function getJob(
  database: Database | DatabaseTransaction,
  jobId: string,
): Promise<FollowUpJob | null> {
  const rows = await database<FollowUpJobRow[]>`
    SELECT id, tenant_id, conversation_id, due_at, status, attempt,
           max_attempts, payload, last_error, created_at, updated_at
    FROM chai.follow_up_job
    WHERE id = ${jobId}
  `;
  return rows.length === 0 ? null : rowToJob(rows[0] as FollowUpJobRow);
}
