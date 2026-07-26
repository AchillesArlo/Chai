import type { DatabaseTransaction } from '@chai/database';

export interface OutboxClaim {
  aggregateId: string;
  aggregateType: string;
  aggregateVersion: number;
  attempts: number;
  eventType: string;
  id: string;
  partitionKey: string;
  payload: unknown;
  schemaVersion: number;
  tenantId: string;
}

export interface OutboxClaimOptions {
  leaseMs: number;
  limit: number;
}

export interface OutboxRetryOptions {
  maxAttempts: number;
  retryBackoffMs: number;
}

/**
 * Claims a bounded batch of due outbox events under an exclusive database lease.
 *
 * The database stays authoritative until the broker acknowledgement is
 * persisted by `markOutboxEventPublished`. A crash between broker ack and that
 * persist leaves the row re-claimable after lease expiry, so the event is
 * redelivered at-least-once; consumers must deduplicate by event id.
 */
export async function claimOutboxBatch(
  transaction: DatabaseTransaction,
  options: OutboxClaimOptions,
): Promise<OutboxClaim[]> {
  const leaseMs = Math.max(0, Math.trunc(options.leaseMs));
  const limit = Math.max(1, Math.trunc(options.limit));

  // Two steps (see inbox dispatcher): select locked ids first, then update by id.
  const selected = await transaction<{ id: string }[]>`
    SELECT id
    FROM chai.outbox_event
    WHERE status IN ('PENDING', 'RETRY')
      AND available_at <= now()
    ORDER BY partition_key, available_at
    LIMIT ${limit}::int
    FOR UPDATE SKIP LOCKED
  `;
  const ids = selected.map((row) => row.id);

  if (ids.length === 0) return [];

  const rows = await transaction`
    UPDATE chai.outbox_event
    SET
      status = 'PROCESSING',
      attempts = attempts + 1,
      lease_until = now() + (${leaseMs} || ' milliseconds')::interval
    WHERE id = ANY(${ids as string[]})
    RETURNING
      id,
      tenant_id,
      event_type,
      schema_version,
      aggregate_type,
      aggregate_id,
      aggregate_version,
      partition_key,
      payload,
      attempts
  `;

  return rows.map((row) => ({
    aggregateId: row.aggregate_id as string,
    aggregateType: row.aggregate_type as string,
    aggregateVersion: row.aggregate_version as number,
    attempts: row.attempts as number,
    eventType: row.event_type as string,
    id: row.id as string,
    partitionKey: row.partition_key as string,
    payload: row.payload as unknown,
    schemaVersion: row.schema_version as number,
    tenantId: row.tenant_id as string,
  }));
}

export async function markOutboxEventPublished(
  transaction: DatabaseTransaction,
  id: string,
): Promise<void> {
  await transaction`
    UPDATE chai.outbox_event
    SET status = 'PUBLISHED',
        published_at = now(),
        lease_until = NULL
    WHERE id = ${id}
      AND status = 'PROCESSING'
  `;
}

export async function retryOutboxEvent(
  transaction: DatabaseTransaction,
  id: string,
  options: OutboxRetryOptions,
): Promise<void> {
  const backoffMs = Math.max(0, Math.trunc(options.retryBackoffMs));

  await transaction`
    UPDATE chai.outbox_event
    SET
      status = CASE
        WHEN attempts >= ${options.maxAttempts} THEN 'DEAD_LETTER'
        ELSE 'RETRY'
      END,
      available_at = CASE
        WHEN attempts >= ${options.maxAttempts} THEN available_at
        ELSE now() + (${backoffMs} || ' milliseconds')::interval
      END,
      lease_until = NULL
    WHERE id = ${id}
  `;
}

export async function reclaimStaleOutboxLeases(
  transaction: DatabaseTransaction,
): Promise<number> {
  const rows = await transaction<{ count: number }[]>`
    WITH reclaimed AS (
      UPDATE chai.outbox_event
      SET status = 'RETRY',
          lease_until = NULL
      WHERE status = 'PROCESSING'
        AND lease_until < now()
      RETURNING id
    )
    SELECT count(*)::integer AS count FROM reclaimed
  `;

  return rows[0]?.count ?? 0;
}
