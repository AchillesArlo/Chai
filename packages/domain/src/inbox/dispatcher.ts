import type { DatabaseTransaction } from '@chai/database';

export interface InboxClaim {
  attempts: number;
  externalEventId: string;
  id: string;
  payloadReference: string;
  provider: string;
  providerAccountId: string;
  schemaVersion: number;
  tenantId: string;
}

export interface InboxClaimOptions {
  leaseMs: number;
  limit: number;
}

export interface InboxRetryOptions {
  maxAttempts: number;
  retryBackoffMs: number;
}

/**
 * Claims a bounded batch of due inbox events under an exclusive database lease.
 *
 * `SELECT ... FOR UPDATE SKIP LOCKED` makes the claim safe across concurrent
 * workers: a row locked by one worker is invisible to the next within the same
 * transaction snapshot. Attempts are incremented here so the attempt budget is
 * spent the moment work is handed off, not when it is acknowledged.
 */
export async function claimInboxBatch(
  transaction: DatabaseTransaction,
  options: InboxClaimOptions,
): Promise<InboxClaim[]> {
  const leaseMs = Math.max(0, Math.trunc(options.leaseMs));
  const limit = Math.max(1, Math.trunc(options.limit));

  // Two steps rather than `UPDATE ... WHERE id IN (SELECT ... LIMIT n FOR UPDATE
  // SKIP LOCKED)`: Postgres can flatten that single-statement form and mis-apply
  // the LIMIT under SKIP LOCKED. Selecting the locked ids first, then updating by
  // id, is the reliable queue-fetch idiom and keeps the lease exclusive.
  const selected = await transaction<{ id: string }[]>`
    SELECT id
    FROM chai.inbox_event
    WHERE status IN ('PENDING', 'RETRY')
      AND available_at <= now()
    ORDER BY available_at
    LIMIT ${limit}::int
    FOR UPDATE SKIP LOCKED
  `;
  const ids = selected.map((row) => row.id);

  if (ids.length === 0) return [];

  const rows = await transaction`
    UPDATE chai.inbox_event
    SET
      status = 'PROCESSING',
      attempts = attempts + 1,
      lease_until = now() + (${leaseMs} || ' milliseconds')::interval
    WHERE id = ANY(${ids as string[]})
    RETURNING
      id,
      tenant_id,
      provider,
      provider_account_id,
      external_event_id,
      schema_version,
      payload_reference,
      attempts
  `;

  return rows.map((row) => ({
    attempts: row.attempts as number,
    externalEventId: row.external_event_id as string,
    id: row.id as string,
    payloadReference: row.payload_reference as string,
    provider: row.provider as string,
    providerAccountId: row.provider_account_id as string,
    schemaVersion: row.schema_version as number,
    tenantId: row.tenant_id as string,
  }));
}

export async function acknowledgeInboxEvent(
  transaction: DatabaseTransaction,
  id: string,
): Promise<void> {
  await transaction`
    UPDATE chai.inbox_event
    SET status = 'PROCESSED',
        processed_at = now(),
        lease_until = NULL
    WHERE id = ${id}
      AND status = 'PROCESSING'
  `;
}

export async function retryInboxEvent(
  transaction: DatabaseTransaction,
  id: string,
  options: InboxRetryOptions,
): Promise<void> {
  const backoffMs = Math.max(0, Math.trunc(options.retryBackoffMs));

  await transaction`
    UPDATE chai.inbox_event
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

/**
 * Releases events still marked PROCESSING whose lease has expired. A worker
 * that crashed mid-flight leaves such rows behind; this re-arms them as RETRY
 * so the next claim sweep can pick them up. Returns the number re-armed.
 */
export async function reclaimStaleInboxLeases(
  transaction: DatabaseTransaction,
): Promise<number> {
  const rows = await transaction<{ count: number }[]>`
    WITH reclaimed AS (
      UPDATE chai.inbox_event
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
