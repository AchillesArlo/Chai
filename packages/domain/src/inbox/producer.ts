import { createHash, randomUUID } from 'node:crypto';

import type { DatabaseTransaction } from '@chai/database';

export interface InboxEventInput {
  externalEventId: string;
  /** Raw provider payload exactly as verified, used to derive the integrity hash. */
  payload: string | Uint8Array;
  /** Where the raw payload is retained (restricted object reference). */
  payloadReference: string;
  provider: string;
  providerAccountId: string;
  schemaVersion?: number;
  tenantId: string;
}

export interface RecordedInboxEvent {
  /** True when this provider event was already recorded, so the caller must not re-process. */
  duplicate: boolean;
  id: string;
  payloadHash: string;
}

/** `sha256:<hex>` shape enforced by the inbox_event integrity constraint. */
export function inboxPayloadHash(payload: string | Uint8Array): string {
  const digest = createHash('sha256')
    .update(typeof payload === 'string' ? payload : Buffer.from(payload))
    .digest('hex');
  return `sha256:${digest}`;
}

/**
 * Records a verified provider event in the transactional inbox.
 *
 * This is the producer half of ADR-007 and the missing piece of GAP-003: the
 * webhook edge must persist a verified event BEFORE acknowledging the provider,
 * so a crash after ack can never lose the event. Deduplication is delegated to
 * the `(tenant_id, provider, provider_account_id, external_event_id)` unique
 * constraint rather than a read-then-write race: a concurrent redelivery hits
 * `ON CONFLICT DO NOTHING` and is reported back as a duplicate.
 *
 * The row lands as PENDING; the inbox dispatcher claims it under a lease and the
 * worker reloads the authoritative record, so losing the queue wake-up never
 * loses the work.
 */
export async function recordInboxEvent(
  transaction: DatabaseTransaction,
  input: InboxEventInput,
): Promise<RecordedInboxEvent> {
  const payloadHash = inboxPayloadHash(input.payload);
  const schemaVersion = Math.max(1, Math.trunc(input.schemaVersion ?? 1));

  const inserted = await transaction<{ id: string }[]>`
    INSERT INTO chai.inbox_event (
      id,
      tenant_id,
      provider,
      provider_account_id,
      external_event_id,
      payload_reference,
      payload_hash,
      schema_version,
      status
    ) VALUES (
      ${randomUUID()},
      ${input.tenantId},
      ${input.provider},
      ${input.providerAccountId},
      ${input.externalEventId},
      ${input.payloadReference},
      ${payloadHash},
      ${schemaVersion}::int,
      'PENDING'
    )
    ON CONFLICT (tenant_id, provider, provider_account_id, external_event_id)
      DO NOTHING
    RETURNING id
  `;

  const insertedId = inserted[0]?.id;
  if (insertedId) {
    return { duplicate: false, id: insertedId, payloadHash };
  }

  // Conflict: the event is already in the inbox. Return its id so the caller can
  // still correlate, and flag it so no side effect runs twice.
  const existing = await transaction<{ id: string }[]>`
    SELECT id
    FROM chai.inbox_event
    WHERE provider = ${input.provider}
      AND provider_account_id = ${input.providerAccountId}
      AND external_event_id = ${input.externalEventId}
    LIMIT 1
  `;
  const existingId = existing[0]?.id;
  if (!existingId) {
    // Only reachable if the conflicting row belongs to another tenant, which RLS
    // hides. Failing closed is correct: the caller must not treat it as accepted.
    throw new Error('INBOX_EVENT_CONFLICT_OUT_OF_TENANT');
  }
  return { duplicate: true, id: existingId, payloadHash };
}

/** Marks an inbox event as quarantined without executing any domain effect. */
export async function quarantineInboxEvent(
  transaction: DatabaseTransaction,
  id: string,
): Promise<void> {
  await transaction`
    UPDATE chai.inbox_event
    SET status = 'QUARANTINED',
        lease_until = NULL
    WHERE id = ${id}
  `;
}

/**
 * Marks an inbox event PROCESSED when the edge processed it inline, i.e. without
 * going through a dispatcher lease.
 *
 * Unlike `acknowledgeInboxEvent`, which closes a PROCESSING lease, this closes a
 * PENDING row. If the inline attempt fails and the transaction rolls back, the
 * row stays PENDING and the dispatcher picks it up later — the work is never
 * lost, only deferred.
 */
export async function markInboxEventProcessed(
  transaction: DatabaseTransaction,
  id: string,
): Promise<void> {
  await transaction`
    UPDATE chai.inbox_event
    SET status = 'PROCESSED',
        processed_at = now(),
        lease_until = NULL
    WHERE id = ${id}
      AND status = 'PENDING'
  `;
}
