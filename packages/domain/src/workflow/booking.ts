import {
  runSaga,
  type SagaObserver,
  type SagaResult,
  type SagaStep,
} from './saga';
import type { WorkflowStatus } from './transitions';

/**
 * Durable booking workflow (REQ-07-015; 07_EVENTS_AUTOMATIONS_AND_JOBS.md
 * §11.1). Runs on the `chai.workflow_run` claim-loop substrate from FASE 20 as
 * a saga: reserve a slot, capture the deposit, confirm the booking. If any step
 * fails mid-way, the completed steps are compensated in reverse (release the
 * slot, refund the deposit, cancel the booking) so a failed payment after a
 * reserved slot never strands that slot — "never silently create a second
 * event", per the blueprint's compensation rules.
 */

/** Booking sub-states carried in workflow_run.current_step (§11.1). */
export type BookingState =
  | 'REQUESTED'
  | 'AVAILABILITY_OFFERED'
  | 'CUSTOMER_CONFIRMED'
  | 'CREATING'
  | 'CONFIRMED'
  | 'RESCHEDULING'
  | 'CANCELLED'
  | 'FAILED_REVIEW';

export const BOOKING_STATES: readonly BookingState[] = [
  'REQUESTED',
  'AVAILABILITY_OFFERED',
  'CUSTOMER_CONFIRMED',
  'CREATING',
  'CONFIRMED',
  'RESCHEDULING',
  'CANCELLED',
  'FAILED_REVIEW',
];

/** workflow_type discriminator for booking runs. */
export const BOOKING_WORKFLOW_TYPE = 'booking';

/**
 * The external effects a booking needs, inverted so the workflow never depends
 * on a concrete calendar/payment adapter and can be driven by fakes in tests.
 * Each effect and its undo must be idempotent and reconcilable.
 */
export interface BookingEffects {
  reserveSlot: () => Promise<{ slotId: string }>;
  releaseSlot: (slotId: string) => Promise<void>;
  capturePayment: () => Promise<{ paymentId: string }>;
  refundPayment: (paymentId: string) => Promise<void>;
  confirmBooking: (input: {
    slotId: string;
    paymentId: string;
  }) => Promise<{ bookingId: string }>;
  cancelBooking: (bookingId: string) => Promise<void>;
}

/** Accumulated ids a later step or a compensation needs. */
export interface BookingContext {
  slotId?: string;
  paymentId?: string;
  bookingId?: string;
}

/** The three CREATING-phase steps, each with its compensation. */
export function buildBookingSaga(
  effects: BookingEffects,
): SagaStep<BookingContext>[] {
  return [
    {
      name: 'reserve-slot',
      execute: async (ctx) => {
        const { slotId } = await effects.reserveSlot();
        ctx.slotId = slotId;
      },
      compensate: async (ctx) => {
        if (ctx.slotId !== undefined) await effects.releaseSlot(ctx.slotId);
      },
    },
    {
      name: 'capture-payment',
      execute: async (ctx) => {
        const { paymentId } = await effects.capturePayment();
        ctx.paymentId = paymentId;
      },
      compensate: async (ctx) => {
        if (ctx.paymentId !== undefined) {
          await effects.refundPayment(ctx.paymentId);
        }
      },
    },
    {
      name: 'confirm-booking',
      execute: async (ctx) => {
        if (ctx.slotId === undefined || ctx.paymentId === undefined) {
          throw new Error('confirm-booking requires a slot and a payment');
        }
        const { bookingId } = await effects.confirmBooking({
          slotId: ctx.slotId,
          paymentId: ctx.paymentId,
        });
        ctx.bookingId = bookingId;
      },
      compensate: async (ctx) => {
        if (ctx.bookingId !== undefined) {
          await effects.cancelBooking(ctx.bookingId);
        }
      },
    },
  ];
}

/** A durable status update the caller persists to the workflow_run row. */
export interface BookingProgress {
  status: WorkflowStatus;
  bookingState: BookingState;
  context: BookingContext;
}

export interface RunBookingWorkflowPorts {
  effects: BookingEffects;
  /**
   * Persist one durable transition. Backed by persistWorkflowStep against a
   * `chai.workflow_run` row in production; a recorder in tests. Called with the
   * generic workflow status, the booking sub-state (current_step), and the
   * accumulated context (state).
   */
  persist: (progress: BookingProgress) => Promise<void> | void;
}

/**
 * Maps the booking saga's lifecycle onto the generic workflow state machine and
 * the booking sub-states, persisting each transition durably:
 *
 *   first step starts  -> RUNNING / CREATING
 *   all steps done     -> DONE / CONFIRMED
 *   a step fails       -> COMPENSATING / CANCELLED (unwind begins)
 *   unwind complete    -> FAILED / CANCELLED       (clean rollback)
 *   unwind incomplete  -> FAILED / FAILED_REVIEW   (needs a human)
 */
export async function runBookingWorkflow(
  ports: RunBookingWorkflowPorts,
): Promise<SagaResult> {
  const ctx: BookingContext = {};
  const steps = buildBookingSaga(ports.effects);
  let started = false;

  const observer: SagaObserver = {
    stepStarted: async () => {
      if (started) return;
      started = true;
      await ports.persist({
        status: 'RUNNING',
        bookingState: 'CREATING',
        context: ctx,
      });
    },
    compensationStarted: async () => {
      await ports.persist({
        status: 'COMPENSATING',
        bookingState: 'CANCELLED',
        context: ctx,
      });
    },
    finished: async (result) => {
      if (result.status === 'DONE') {
        await ports.persist({
          status: 'DONE',
          bookingState: 'CONFIRMED',
          context: ctx,
        });
        return;
      }
      await ports.persist({
        status: 'FAILED',
        bookingState: result.compensationIncomplete
          ? 'FAILED_REVIEW'
          : 'CANCELLED',
        context: ctx,
      });
    },
  };

  return runSaga(steps, ctx, observer);
}
