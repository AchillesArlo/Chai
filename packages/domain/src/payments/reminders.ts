import type { DatabaseTransaction } from '@chai/database';

/**
 * Stops the reminders that were chasing a payment, because it settled.
 *
 * Blueprint 07_EVENTS §449 and 02_SYSTEM_ARCHITECTURE §233: a paid payment
 * "stops reminders exactly once". Two code paths move a payment to PAID -- the
 * API webhook and the reconciliation worker -- so the cancellation lives here,
 * called by both, rather than being copied into each. One guard in the shared
 * function is a smaller surface than one per caller, and a caller added later
 * cannot forget it as easily.
 *
 * Exactly-once comes from two properties, not from a flag:
 *  1. The caller runs this inside the SAME transaction as the status change, so
 *     the cancellation and the payment row commit together or not at all.
 *  2. The caller only reaches this when the shared transition machine returns
 *     APPLY. A replayed or stale webhook returns IGNORE, so a settled payment
 *     never runs the cancellation a second time.
 * The `status = 'PENDING'` predicate is the backstop: an already-cancelled or
 * already-delivered reminder is not matched, so even a double call cannot
 * "re-cancel" or revive anything.
 *
 * Reminders are matched on `payload->>'paymentExternalId'` because
 * `chai.follow_up_job` has no payment foreign key and `chai.payment` carries no
 * business reference; migration 0071 adds a partial index for this lookup.
 * ponytail: payload-key join, not a real FK -- upgrade path is a
 * `payment_id uuid REFERENCES chai.payment(id)` column once payments carry a
 * business reference, at which point this predicate becomes that join.
 *
 * @returns the ids of the reminders actually cancelled, so the caller can put a
 *   count in the audit trail instead of asserting silence.
 */
export async function stopPaymentReminders(
  transaction: DatabaseTransaction,
  tenantId: string,
  paymentExternalId: string,
): Promise<string[]> {
  const rows = await transaction<{ id: string }[]>`
    UPDATE chai.follow_up_job
    SET status = 'CANCELLED',
        updated_at = now()
    WHERE tenant_id = ${tenantId}
      AND status = 'PENDING'
      AND payload ->> 'paymentExternalId' = ${paymentExternalId}
    RETURNING id
  `;
  return rows.map((row) => row.id);
}
