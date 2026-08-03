/**
 * Canonical automation **stop-reason** vocabulary (REQ-07-014;
 * 07_EVENTS_AUTOMATIONS_AND_JOBS.md §10).
 *
 * Every reason a running automation may stop is one of these tokens — never a
 * free string. A fixed enum is what lets the platform reason about *why* a
 * sequence halted (analytics, dedup, audit) instead of parsing prose, and it is
 * the contract the six MVP templates persist against.
 *
 * The tokens are taken directly from the blueprint, not invented:
 *   §10.1 (no-response follow-up): CUSTOMER_REPLIED, OPT_OUT, LEAD_CLOSED,
 *          BOOKING_CREATED, CHANNEL_UNAVAILABLE, WINDOW_POLICY_BLOCKED,
 *          MAX_ATTEMPTS, MANUAL_STOP.
 *   §10.5 (payment request/reminder): PAID, EXPIRED, CANCELLED,
 *          ORDER_OR_BOOKING_CANCELLED (blueprint "order/booking cancellation"),
 *          plus CUSTOMER_REPLIED / OPT_OUT / MANUAL_STOP.
 *   §10.6 (shipment milestone/exception): DELIVERED, RETURNED, CANCELLED.
 */

export type AutomationStopReason =
  | 'CUSTOMER_REPLIED'
  | 'OPT_OUT'
  | 'LEAD_CLOSED'
  | 'BOOKING_CREATED'
  | 'CHANNEL_UNAVAILABLE'
  | 'WINDOW_POLICY_BLOCKED'
  | 'MAX_ATTEMPTS'
  | 'MANUAL_STOP'
  | 'PAID'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'ORDER_OR_BOOKING_CANCELLED'
  | 'DELIVERED'
  | 'RETURNED';

/** Every canonical stop reason, for iteration and validation. */
export const AUTOMATION_STOP_REASONS: readonly AutomationStopReason[] = [
  'CUSTOMER_REPLIED',
  'OPT_OUT',
  'LEAD_CLOSED',
  'BOOKING_CREATED',
  'CHANNEL_UNAVAILABLE',
  'WINDOW_POLICY_BLOCKED',
  'MAX_ATTEMPTS',
  'PAID',
  'EXPIRED',
  'CANCELLED',
  'ORDER_OR_BOOKING_CANCELLED',
  'DELIVERED',
  'RETURNED',
  'MANUAL_STOP',
] as const;

const STOP_REASON_SET: ReadonlySet<string> = new Set(AUTOMATION_STOP_REASONS);

/** Type guard: is this string a canonical stop reason? */
export function isAutomationStopReason(
  value: string,
): value is AutomationStopReason {
  return STOP_REASON_SET.has(value);
}

/**
 * Narrows a string to a canonical stop reason or throws. Use at the trust
 * boundary (persisting a stop event) so a free string can never leak into the
 * store as if it were a known reason.
 */
export function assertAutomationStopReason(value: string): AutomationStopReason {
  if (!isAutomationStopReason(value)) {
    throw new Error(`unknown automation stop reason: ${value}`);
  }
  return value;
}
