/**
 * Generic saga executor (07_EVENTS_AUTOMATIONS_AND_JOBS.md §11 "Durable
 * Workflows", compensation requirements).
 *
 * A saga runs an ordered list of steps forward; if any step fails, it unwinds
 * the steps that DID complete, in reverse order, by invoking each one's
 * `compensate`. This is what guarantees a mid-way failure never leaves a
 * half-applied workflow behind — the property the booking workflow needs so a
 * failed payment after a reserved slot releases that slot instead of stranding it.
 *
 * The executor is pure orchestration: it performs no I/O itself. Side effects
 * live in the step handlers, and durable persistence is wired through the
 * optional `SagaObserver`, so the same executor drives both an in-memory test
 * and a `chai.workflow_run`-backed durable run.
 */

export interface SagaStep<Ctx> {
  /** Stable step name, also used as the durable current_step marker. */
  name: string;
  /** Forward action. Mutates `ctx` with anything a later compensate needs. */
  execute: (ctx: Ctx) => Promise<void> | void;
  /**
   * Undo for THIS step, run only if `execute` completed. Must be idempotent and
   * tolerate being called after a crash (blueprint: "never silently create a
   * second event"); a compensation may itself fail, which is surfaced via
   * `compensationIncomplete` for human review.
   */
  compensate?: (ctx: Ctx) => Promise<void> | void;
}

export interface SagaResult {
  status: 'DONE' | 'FAILED';
  completedSteps: readonly string[];
  compensatedSteps: readonly string[];
  /** The step whose `execute` threw, when status is FAILED. */
  failedStep?: string;
  /** The failure message, when status is FAILED. */
  error?: string;
  /**
   * True when a `compensate` handler itself threw: the unwind is incomplete and
   * the run needs human review (maps to the booking FAILED_REVIEW state) rather
   * than being reported as a clean rollback.
   */
  compensationIncomplete?: boolean;
}

/**
 * Lifecycle callbacks so a caller can persist progress durably. Every callback
 * is optional and may be async; the executor awaits each one.
 */
export interface SagaObserver {
  stepStarted?: (name: string) => Promise<void> | void;
  stepCompleted?: (name: string) => Promise<void> | void;
  compensationStarted?: (failedStep: string) => Promise<void> | void;
  stepCompensated?: (name: string) => Promise<void> | void;
  finished?: (result: SagaResult) => Promise<void> | void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs `steps` forward over `ctx`. On the first failure, unwinds the completed
 * steps in reverse via their `compensate`, then reports FAILED. Best-effort
 * unwind: if a compensate throws, the remaining compensations still run and the
 * result is flagged `compensationIncomplete`.
 *
 * ponytail: compensations are attempted exactly once here. A compensate that
 * fails transiently is not retried — the run is flagged for review instead.
 * Upgrade path when a step's undo is flaky: make the durable worker re-claim
 * the COMPENSATING run (claimWorkflowRuns already supports that) and re-invoke
 * the remaining compensations, since each compensate is required to be idempotent.
 */
export async function runSaga<Ctx>(
  steps: readonly SagaStep<Ctx>[],
  ctx: Ctx,
  observer: SagaObserver = {},
): Promise<SagaResult> {
  const completed: SagaStep<Ctx>[] = [];
  const completedNames: string[] = [];

  for (const step of steps) {
    await observer.stepStarted?.(step.name);
    try {
      await step.execute(ctx);
      completed.push(step);
      completedNames.push(step.name);
      await observer.stepCompleted?.(step.name);
    } catch (error) {
      const failedStep = step.name;
      await observer.compensationStarted?.(failedStep);

      const compensatedSteps: string[] = [];
      let compensationIncomplete = false;

      // Unwind the steps that DID complete, most-recent first.
      for (const done of [...completed].reverse()) {
        if (!done.compensate) continue;
        try {
          await done.compensate(ctx);
          compensatedSteps.push(done.name);
          await observer.stepCompensated?.(done.name);
        } catch {
          // A failed undo cannot be guessed away; flag for review and keep
          // attempting the rest so we roll back as much as possible.
          compensationIncomplete = true;
        }
      }

      const result: SagaResult = {
        status: 'FAILED',
        completedSteps: completedNames,
        compensatedSteps,
        failedStep,
        error: messageOf(error),
        compensationIncomplete,
      };
      await observer.finished?.(result);
      return result;
    }
  }

  const result: SagaResult = {
    status: 'DONE',
    completedSteps: completedNames,
    compensatedSteps: [],
  };
  await observer.finished?.(result);
  return result;
}
