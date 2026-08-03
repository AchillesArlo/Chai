import { randomUUID } from 'node:crypto';

import type { DatabaseTransaction } from '@chai/database';

import { createInboxPayloadRedactionPipeline } from '../pii-pipeline/pipeline';

/**
 * Placeholder written over an expired payload. The row survives (so "an event
 * existed here" stays auditable) but the personal data is gone.
 */
export const INBOX_PAYLOAD_REDACTED_PLACEHOLDER = {
  redacted: true,
} as const;

export interface InboxPayloadInput {
  /**
   * Raw provider event, exactly as verified upstream. Redacted before storage —
   * `unknown` because it is arbitrary provider JSON, not a domain type.
   */
  event: unknown;
  inboxEventId: string;
  tenantId: string;
}

/**
 * Coerces an arbitrary value into a plain JSON record. Round-tripping through
 * JSON normalises Dates to ISO strings and drops `undefined`, so the recursive
 * redactor only ever meets plain objects / arrays / primitives (a raw `Date`
 * would otherwise be walked as an empty object and silently dropped).
 */
function toPlainRecord(value: unknown): Record<string, unknown> {
  const serialized: unknown = JSON.parse(JSON.stringify(value ?? {}));
  return serialized !== null &&
    typeof serialized === 'object' &&
    !Array.isArray(serialized)
    ? (serialized as Record<string, unknown>)
    : {};
}

export interface RedactedInboxPayload {
  redacted: Record<string, unknown>;
  /** How many fields were masked; lets a caller assert nothing slipped through. */
  redactions: number;
}

/**
 * Redacts a raw inbound event for storage. Pure and side-effect free, so the
 * "PII is masked before it is ever written" invariant is unit-testable without
 * a database.
 */
export function redactInboxPayload(event: unknown): RedactedInboxPayload {
  const { redacted, redactions } = createInboxPayloadRedactionPipeline().redact(
    toPlainRecord(event),
  );
  return { redacted, redactions: redactions.length };
}

/**
 * Persists the redacted payload for a recorded inbox event, in the caller's
 * transaction so it commits with the inbox row (never orphaned).
 *
 * Redaction happens HERE, before the INSERT, so a card/CVV/PIN/OTP/bank field
 * never touches the table even for the duration of one transaction. Idempotent:
 * one payload per (tenant, inbox_event), a second attempt is a no-op.
 */
export async function recordInboxPayload(
  transaction: DatabaseTransaction,
  input: InboxPayloadInput,
): Promise<RedactedInboxPayload> {
  const result = redactInboxPayload(input.event);
  await transaction`
    INSERT INTO chai.inbox_payload (id, tenant_id, inbox_event_id, payload)
    VALUES (
      ${randomUUID()},
      ${input.tenantId},
      ${input.inboxEventId},
      ${transaction.json(
        result.redacted as Parameters<typeof transaction.json>[0],
      )}::jsonb
    )
    ON CONFLICT (tenant_id, inbox_event_id) DO NOTHING
  `;
  return result;
}

/**
 * Retention sweep: replaces the payload of rows older than `retentionDays` with
 * a placeholder and stamps `redacted_at` (human decision #2 for FASE 29 — redact,
 * do not delete). Runs under the caller's tenant transaction; returns the number
 * of rows redacted so a scheduler can log/meter its work.
 *
 * ponytail: this is the retention MECHANISM. Wiring it onto a schedule (e.g. a
 * daily pass in a maintenance worker over the tenant roster) is the remaining
 * step; the 30-day window is passed by the caller, not hard-coded here.
 */
export async function redactExpiredInboxPayloads(
  transaction: DatabaseTransaction,
  retentionDays: number,
): Promise<number> {
  const days = Math.max(0, Math.trunc(retentionDays));
  const rows = await transaction<{ id: string }[]>`
    UPDATE chai.inbox_payload
    SET payload = ${transaction.json(
      INBOX_PAYLOAD_REDACTED_PLACEHOLDER as Parameters<typeof transaction.json>[0],
    )}::jsonb,
        redacted_at = now()
    WHERE redacted_at IS NULL
      AND created_at < now() - (${days} || ' days')::interval
    RETURNING id
  `;
  return rows.length;
}
