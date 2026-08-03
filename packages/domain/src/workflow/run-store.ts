import { randomUUID } from 'node:crypto';

import type { DatabaseTransaction } from '@chai/database';

import { decideWorkflowTransition, type WorkflowStatus } from './transitions';

/**
 * Persistence for `chai.workflow_run`. Every function takes a tenant-scoped
 * transaction so RLS applies — the claim query relies on RLS to scope by
 * tenant, exactly like claimOutboxBatch, so the caller runs it inside one
 * `withTenantTransaction` per tenant.
 */

export interface WorkflowRun {
  id: string;
  tenantId: string;
  workflowType: string;
  status: WorkflowStatus;
  state: Record<string, unknown>;
  currentStep: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowRunRow {
  id: string;
  tenant_id: string;
  workflow_type: string;
  status: WorkflowStatus;
  state: unknown;
  current_step: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Decode a jsonb column that this driver returns as a raw JSON string. */
function parseJson<T>(value: unknown): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
}

function toRun(row: WorkflowRunRow): WorkflowRun {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    workflowType: row.workflow_type,
    status: row.status,
    state: parseJson<Record<string, unknown>>(row.state),
    currentStep: row.current_step,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface CreateWorkflowRunInput {
  tenantId: string;
  workflowType: string;
  state?: Record<string, unknown>;
  currentStep?: string | null;
}

/** Enqueue a new workflow run in PENDING for a claim-loop worker to pick up. */
export async function createWorkflowRun(
  transaction: DatabaseTransaction,
  input: CreateWorkflowRunInput,
): Promise<WorkflowRun> {
  const id = randomUUID();
  const rows = await transaction<WorkflowRunRow[]>`
    INSERT INTO chai.workflow_run (id, tenant_id, workflow_type, status, state, current_step)
    VALUES (
      ${id}::uuid,
      ${input.tenantId}::uuid,
      ${input.workflowType},
      'PENDING',
      ${transaction.json((input.state ?? {}) as Parameters<typeof transaction.json>[0])}::jsonb,
      ${input.currentStep ?? null}
    )
    RETURNING id, tenant_id, workflow_type, status, state, current_step, created_at, updated_at
  `;
  const row = rows[0];
  if (!row) throw new Error('workflow_run insert returned no row');
  return toRun(row);
}

export interface ClaimWorkflowRunsOptions {
  workflowType: string;
  /**
   * A RUNNING/COMPENSATING run whose row has not been touched for longer than
   * this is presumed abandoned by a dead worker and becomes re-claimable.
   */
  staleAfterMs: number;
  /** Max runs to claim per pass. Defaults to 1. */
  limit?: number;
}

/**
 * Claims due workflow runs under FOR UPDATE SKIP LOCKED and moves each into an
 * active status, so two workers polling at once never grab the same run: the
 * loser's SKIP LOCKED simply skips the row the winner has locked.
 *
 * Claimable = a fresh PENDING run, OR a RUNNING/COMPENSATING run whose worker
 * died (updated_at older than staleAfterMs). A PENDING claim advances to
 * RUNNING; a stale active claim KEEPS its status, so an interrupted unwind
 * resumes as an unwind (COMPENSATING) and never restarts as forward work.
 *
 * ponytail: staleness is inferred from updated_at with no heartbeat, so a step
 * that legitimately runs longer than staleAfterMs could be double-claimed.
 * Upgrade path when steps get long-running: a dedicated lease_until column plus
 * a periodic heartbeat, exactly like reclaimStaleOutboxLeases in the outbox
 * dispatcher. Bounded workflows (the only kind this substrate is for — see the
 * deferred-workers roadmap) do not hit that ceiling.
 */
export async function claimWorkflowRuns(
  transaction: DatabaseTransaction,
  options: ClaimWorkflowRunsOptions,
): Promise<WorkflowRun[]> {
  const staleAfterMs = Math.max(0, Math.trunc(options.staleAfterMs));
  const limit = Math.max(1, Math.trunc(options.limit ?? 1));

  // Two steps (see outbox/inbox dispatcher): lock the ids first, then update by
  // id, so the RETURNING projection is not entangled with the lock predicate.
  const selected = await transaction<{ id: string }[]>`
    SELECT id
    FROM chai.workflow_run
    WHERE workflow_type = ${options.workflowType}
      AND (
        status = 'PENDING'
        OR (
          status IN ('RUNNING', 'COMPENSATING')
          AND updated_at < now() - (${staleAfterMs} || ' milliseconds')::interval
        )
      )
    ORDER BY created_at
    LIMIT ${limit}::int
    FOR UPDATE SKIP LOCKED
  `;
  const ids = selected.map((row) => row.id);
  if (ids.length === 0) return [];

  const rows = await transaction<WorkflowRunRow[]>`
    UPDATE chai.workflow_run
    SET status = CASE WHEN status = 'PENDING' THEN 'RUNNING' ELSE status END,
        updated_at = now()
    WHERE id = ANY(${ids as string[]})
    RETURNING id, tenant_id, workflow_type, status, state, current_step, created_at, updated_at
  `;
  return rows.map(toRun);
}

export interface WorkflowStepUpdate {
  /** New status. Omit (or pass the current status) to keep the status and only
   * persist a state/current_step advance within RUNNING. */
  status?: WorkflowStatus;
  state?: Record<string, unknown>;
  /** Pass `null` to explicitly clear the step; omit to leave it unchanged. */
  currentStep?: string | null;
}

/**
 * Applies one durable step to a claimed run inside the caller's transaction.
 *
 * The row is re-read FOR UPDATE, the shared transition machine validates any
 * status change, and status/state/current_step are persisted together. Returns
 * `null` when the run is gone or the status change is rejected (terminal,
 * illegal, or noop), so the caller stops instead of forcing an invalid move —
 * the same "decide, then apply only on APPLY" shape as the payment reconciler.
 */
export async function persistWorkflowStep(
  transaction: DatabaseTransaction,
  runId: string,
  update: WorkflowStepUpdate,
): Promise<WorkflowRun | null> {
  const locked = await transaction<WorkflowRunRow[]>`
    SELECT id, tenant_id, workflow_type, status, state, current_step, created_at, updated_at
    FROM chai.workflow_run
    WHERE id = ${runId}::uuid
    FOR UPDATE
  `;
  const row = locked[0];
  if (!row) return null;

  if (update.status !== undefined && update.status !== row.status) {
    const decision = decideWorkflowTransition(row.status, update.status);
    if (decision.kind !== 'APPLY') return null;
  }

  const nextStatus = update.status ?? row.status;
  const nextState =
    update.state ?? parseJson<Record<string, unknown>>(row.state);
  const nextStep =
    update.currentStep === undefined ? row.current_step : update.currentStep;

  const updated = await transaction<WorkflowRunRow[]>`
    UPDATE chai.workflow_run
    SET status = ${nextStatus},
        state = ${transaction.json(nextState as Parameters<typeof transaction.json>[0])}::jsonb,
        current_step = ${nextStep},
        updated_at = now()
    WHERE id = ${runId}::uuid
    RETURNING id, tenant_id, workflow_type, status, state, current_step, created_at, updated_at
  `;
  const appliedRow = updated[0];
  if (!appliedRow) return null;
  return toRun(appliedRow);
}

/** Read a single run by id (RLS-scoped). */
export async function getWorkflowRun(
  transaction: DatabaseTransaction,
  runId: string,
): Promise<WorkflowRun | null> {
  const rows = await transaction<WorkflowRunRow[]>`
    SELECT id, tenant_id, workflow_type, status, state, current_step, created_at, updated_at
    FROM chai.workflow_run
    WHERE id = ${runId}::uuid
  `;
  const row = rows[0];
  return row ? toRun(row) : null;
}
