/**
 * Durable workflow status transition rules (07_EVENTS_AUTOMATIONS_AND_JOBS.md
 * §11 "Durable Workflows").
 *
 * This is the single source of truth for how a `chai.workflow_run` row may
 * change status. It lives in the domain (not in `apps/api`) because both the
 * claim-loop worker and any API caller must apply the SAME rules — a second
 * copy of a saga state machine is a divergence waiting to happen, exactly the
 * reason payments/transitions.ts is shared between the webhook path and the
 * reconciler.
 *
 * The lifecycle:
 *
 *   PENDING ── claimed ──▶ RUNNING ── success ─────▶ DONE (terminal)
 *      │                     │
 *      │                     ├── step failed, has ──▶ COMPENSATING ──▶ FAILED
 *      │                     │   work to unwind                        (terminal)
 *      └── abandoned ───▶ FAILED (terminal)          │
 *                            └── nothing to unwind ──▶ FAILED (terminal)
 *
 * Two properties matter more than the graph itself:
 *
 * 1. Terminal stays terminal. `DONE` and `FAILED` never move again, so a
 *    re-claimed run or a redelivered signal can never resurrect a finished
 *    workflow (mirrors the payment rule that PAID never regresses).
 * 2. Compensation is one-way. Once `RUNNING` enters `COMPENSATING` it can only
 *    end at `FAILED` — an unwind is not a retry, so a half-applied saga can
 *    never flip back to forward progress and re-run a side effect.
 */

export type WorkflowStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPENSATING'
  | 'DONE'
  | 'FAILED';

const ALLOWED: Record<WorkflowStatus, readonly WorkflowStatus[]> = {
  // A pending run is either claimed into RUNNING or abandoned before it starts.
  PENDING: ['RUNNING', 'FAILED'],
  // A running run succeeds, begins unwinding, or fails outright when there is
  // nothing to compensate. Advancing a step keeps status RUNNING and is a
  // state/current_step write, not a status transition (see persistWorkflowStep).
  RUNNING: ['COMPENSATING', 'DONE', 'FAILED'],
  // Compensation only ends by failing the run; an unwind never returns to
  // RUNNING and never reports DONE.
  COMPENSATING: ['FAILED'],
  // Terminal.
  DONE: [],
  FAILED: [],
};

export type WorkflowTransitionDecision =
  | { kind: 'APPLY' }
  | { kind: 'REJECT'; reason: 'NOOP' | 'TERMINAL' | 'ILLEGAL' };

/**
 * Decides whether a workflow run may move from `current` to `next`.
 *
 * - `NOOP`: the status is unchanged (advance state/current_step instead).
 * - `TERMINAL`: the run has already settled and cannot move.
 * - `ILLEGAL`: the move is not in the allowed graph for `current`.
 */
export function decideWorkflowTransition(
  current: WorkflowStatus,
  next: WorkflowStatus,
): WorkflowTransitionDecision {
  if (current === next) return { kind: 'REJECT', reason: 'NOOP' };
  if (isTerminalWorkflowStatus(current)) {
    return { kind: 'REJECT', reason: 'TERMINAL' };
  }
  if (!ALLOWED[current].includes(next)) {
    return { kind: 'REJECT', reason: 'ILLEGAL' };
  }
  return { kind: 'APPLY' };
}

/** True when a run has settled and no longer expects any transition. */
export function isTerminalWorkflowStatus(status: WorkflowStatus): boolean {
  return status === 'DONE' || status === 'FAILED';
}

/** True when a claimed run may still be advanced or unwound by a worker. */
export function isActiveWorkflowStatus(status: WorkflowStatus): boolean {
  return status === 'RUNNING' || status === 'COMPENSATING';
}
