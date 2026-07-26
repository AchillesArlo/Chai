/**
 * Payment status transition rules (17_PAYMENT §6.2).
 *
 * This is the single source of truth for how a payment may change state. It
 * lives in the domain (not in `apps/api`) because both the API webhook path and
 * the reconciliation worker must apply the SAME rules — a second copy of a money
 * state machine is a divergence waiting to happen (GAP-009 / R-10).
 *
 * Two properties matter more than the graph itself:
 *
 * 1. `PAID` never regresses. A late `PENDING`/`FAILED` redelivery, or an
 *    out-of-order provider event, must not undo a verified payment. Only an
 *    explicit reversal — refund or dispute — moves money back, and those are
 *    separate capabilities behind their own gate.
 * 2. Terminal states stay terminal, so a duplicate webhook cannot reopen a
 *    settled request.
 *
 * `UNKNOWN_RESULT` is an execution state, not a business status: it means the
 * provider may have accepted the operation and the platform must reconcile
 * before retrying (GAP-015). It is NOT terminal, so an uncertain attempt stays
 * open for the reconciler to resolve.
 */

/**
 * Canonical payment lifecycle statuses.
 *
 * Defined here (rather than imported from a connector) so the domain owns its
 * own vocabulary, matching the convention already used for `RefundStatus`. The
 * connector layer declares a structurally identical union for its own adapters;
 * the database `chai.payment.status` CHECK constraint is the ultimate authority
 * and lists exactly these six values.
 */
export type PaymentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'PAID'
  | 'EXPIRED'
  | 'FAILED'
  | 'UNKNOWN_RESULT';

const ALLOWED: Record<PaymentStatus, readonly PaymentStatus[]> = {
  CREATED: ['CREATED', 'PENDING', 'PAID', 'EXPIRED', 'FAILED', 'UNKNOWN_RESULT'],
  PENDING: ['PENDING', 'PAID', 'EXPIRED', 'FAILED', 'UNKNOWN_RESULT'],
  // Reconciliation resolves an uncertain attempt in either direction.
  UNKNOWN_RESULT: ['PAID', 'EXPIRED', 'FAILED', 'UNKNOWN_RESULT'],
  // Terminal: a further webhook is a duplicate, not a state change.
  PAID: ['PAID'],
  EXPIRED: ['EXPIRED'],
  FAILED: ['FAILED'],
};

export type TransitionDecision =
  | { kind: 'APPLY' }
  | { kind: 'IGNORE'; reason: 'DUPLICATE' | 'STALE_EVENT' | 'TERMINAL' };

export interface TransitionInput {
  current: PaymentStatus;
  /** Provider event time, when the provider supplies one. */
  eventAt?: Date | null;
  next: PaymentStatus;
  /** Event time of the last applied transition, for precedence. */
  observedAt?: Date | null;
}

/**
 * Decides whether a provider-reported status may be applied.
 *
 * Precedence is by provider event time, not arrival time: providers redeliver
 * and reorder, so an older event that arrives later must lose.
 */
export function decidePaymentTransition(
  input: TransitionInput,
): TransitionDecision {
  if (
    input.eventAt &&
    input.observedAt &&
    input.eventAt.getTime() < input.observedAt.getTime()
  ) {
    return { kind: 'IGNORE', reason: 'STALE_EVENT' };
  }
  if (input.current === input.next) {
    return { kind: 'IGNORE', reason: 'DUPLICATE' };
  }
  if (!ALLOWED[input.current].includes(input.next)) {
    return { kind: 'IGNORE', reason: 'TERMINAL' };
  }
  return { kind: 'APPLY' };
}

/** True when a status is settled and no longer expects provider updates. */
export function isTerminalPaymentStatus(status: PaymentStatus): boolean {
  return status === 'PAID' || status === 'EXPIRED' || status === 'FAILED';
}
