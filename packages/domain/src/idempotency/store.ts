import { createHash, randomUUID } from 'node:crypto';

import type { DatabaseTransaction } from '@chai/database';

/**
 * Persistent idempotency + operation-execution state (GAP-006, DEC-008).
 *
 * Two facts are tracked separately on purpose:
 * - `operation_execution` is the *execution* state of an attempted side effect.
 *   `UNKNOWN_RESULT` lives here and means "the provider may have accepted it";
 *   it is never a business status such as a failed payment (GAP-015).
 * - `idempotency_record` binds a caller's key to that execution, plus the hash
 *   of the request that created it, so a replay with a different body is a
 *   conflict rather than a silent second effect.
 */

export const OPERATION_STATUSES = [
  'PROCESSING',
  'SUCCEEDED',
  'FAILED_RETRYABLE',
  'FAILED_FINAL',
  'UNKNOWN_RESULT',
] as const;

export type OperationStatus = (typeof OPERATION_STATUSES)[number];

export interface IdempotentClaimInput {
  audience: string;
  /** Canonical request body/params; hashed, never stored raw. */
  request: unknown;
  idempotencyKey: string;
  operation: string;
  /** How long the key stays reserved. Must outlive the provider's retry window. */
  ttlMs?: number;
  tenantId: string;
}

export type IdempotentClaim =
  | { outcome: 'CLAIMED'; operationId: string; recordId: string }
  | {
      outcome: 'REPLAY';
      operationId: string;
      recordId: string;
      responseReference: string | null;
      status: OperationStatus;
    }
  | { outcome: 'CONFLICT'; operationId: string; recordId: string };

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function requestHash(request: unknown): string {
  // Stable stringify: key order must not change the hash, or a semantically
  // identical retry would be reported as a conflict.
  const canonical = JSON.stringify(sortValue(request) ?? null);
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)]),
    );
  }
  return value;
}

/**
 * Reserves an idempotency key for one execution.
 *
 * - first caller  -> CLAIMED, with a PROCESSING operation to advance
 * - same key + same request -> REPLAY, carrying the recorded status so the
 *   caller can return the original outcome instead of acting again
 * - same key + different request -> CONFLICT (06_API §5 IDEMPOTENCY_CONFLICT)
 */
export async function claimIdempotentOperation(
  transaction: DatabaseTransaction,
  input: IdempotentClaimInput,
): Promise<IdempotentClaim> {
  const hash = requestHash(input.request);
  const ttlMs = Math.max(1, Math.trunc(input.ttlMs ?? DEFAULT_TTL_MS));

  // Read first so the common replay path performs no writes at all.
  const settled = await findRecord(transaction, input, hash);
  if (settled) {
    return settled;
  }

  const operationId = randomUUID();
  const recordId = randomUUID();

  // The record's FK points at the execution, so the execution must exist first.
  await transaction`
    INSERT INTO chai.operation_execution (id, tenant_id, operation_type, status)
    VALUES (${operationId}, ${input.tenantId}, ${input.operation}, 'PROCESSING')
  `;

  const inserted = await transaction<{ id: string }[]>`
    INSERT INTO chai.idempotency_record (
      id,
      tenant_id,
      audience,
      operation,
      idempotency_key,
      request_hash,
      status,
      operation_id,
      expires_at
    ) VALUES (
      ${recordId},
      ${input.tenantId},
      ${input.audience},
      ${input.operation},
      ${input.idempotencyKey},
      ${hash},
      'PROCESSING',
      ${operationId},
      now() + (${ttlMs} || ' milliseconds')::interval
    )
    ON CONFLICT (tenant_id, audience, operation, idempotency_key) DO NOTHING
    RETURNING id
  `;

  if (inserted[0]?.id) {
    return { operationId, outcome: 'CLAIMED', recordId };
  }

  // Lost a concurrent race for the same key. Close our execution as final rather
  // than deleting it: the attempt is part of the history, and the runtime role
  // deliberately holds no DELETE grant on execution state.
  await transaction`
    UPDATE chai.operation_execution
    SET status = 'FAILED_FINAL',
        version = version + 1,
        updated_at = now()
    WHERE id = ${operationId}
  `;

  const winner = await findRecord(transaction, input, hash);
  if (!winner) {
    // Only reachable when the conflicting row belongs to another tenant, which
    // RLS hides. Failing closed keeps the caller from treating it as accepted.
    throw new Error('IDEMPOTENCY_CONFLICT_OUT_OF_TENANT');
  }
  return winner;
}

async function findRecord(
  transaction: DatabaseTransaction,
  input: IdempotentClaimInput,
  hash: string,
): Promise<IdempotentClaim | null> {
  const rows = await transaction<
    {
      id: string;
      operation_id: string;
      request_hash: string;
      response_reference: string | null;
      status: OperationStatus;
    }[]
  >`
    SELECT id, operation_id, request_hash, response_reference, status
    FROM chai.idempotency_record
    WHERE audience = ${input.audience}
      AND operation = ${input.operation}
      AND idempotency_key = ${input.idempotencyKey}
    LIMIT 1
  `;
  const existing = rows[0];
  if (!existing) {
    return null;
  }
  if (existing.request_hash !== hash) {
    return {
      operationId: existing.operation_id,
      outcome: 'CONFLICT',
      recordId: existing.id,
    };
  }
  return {
    operationId: existing.operation_id,
    outcome: 'REPLAY',
    recordId: existing.id,
    responseReference: existing.response_reference,
    status: existing.status,
  };
}

export interface OperationSettlementInput {
  operationId: string;
  providerReference?: string | null;
  recordId: string;
  responseReference?: string | null;
  status: Exclude<OperationStatus, 'PROCESSING'>;
}

/**
 * Advances an execution out of PROCESSING and mirrors the status onto the
 * idempotency record so a later replay returns the settled outcome.
 */
export async function settleOperation(
  transaction: DatabaseTransaction,
  input: OperationSettlementInput,
): Promise<void> {
  await transaction`
    UPDATE chai.operation_execution
    SET status = ${input.status},
        provider_reference = COALESCE(${input.providerReference ?? null}, provider_reference),
        response_reference = COALESCE(${input.responseReference ?? null}, response_reference),
        version = version + 1,
        updated_at = now()
    WHERE id = ${input.operationId}
  `;
  await transaction`
    UPDATE chai.idempotency_record
    SET status = ${input.status},
        response_reference = COALESCE(${input.responseReference ?? null}, response_reference),
        updated_at = now()
    WHERE id = ${input.recordId}
  `;
}

/**
 * Marks a reconciliation as complete for an execution that was UNKNOWN_RESULT.
 *
 * Reconcile-before-retry is the rule for every uncertain external mutation
 * (17_PAYMENT §6.5): the caller resolves the truth with the provider and then
 * settles here, instead of issuing a second charge or label.
 */
export async function reconcileOperation(
  transaction: DatabaseTransaction,
  input: OperationSettlementInput,
): Promise<void> {
  await settleOperation(transaction, input);
  await transaction`
    UPDATE chai.operation_execution
    SET reconciled_at = now()
    WHERE id = ${input.operationId}
  `;
}

export async function readOperation(
  transaction: DatabaseTransaction,
  operationId: string,
): Promise<{ reconciledAt: Date | null; status: OperationStatus } | null> {
  const rows = await transaction<
    { reconciled_at: Date | null; status: OperationStatus }[]
  >`
    SELECT status, reconciled_at
    FROM chai.operation_execution
    WHERE id = ${operationId}
    LIMIT 1
  `;
  const row = rows[0];
  return row ? { reconciledAt: row.reconciled_at, status: row.status } : null;
}

/**
 * Deletes expired idempotency records. Retention must exceed the longest
 * provider retry window, otherwise a late redelivery would be treated as new.
 * Records still PROCESSING or UNKNOWN_RESULT are kept: their real outcome is
 * not known yet, so forgetting the key would risk a duplicate side effect.
 */
export async function pruneExpiredIdempotencyRecords(
  transaction: DatabaseTransaction,
): Promise<number> {
  const rows = await transaction<{ count: number }[]>`
    WITH pruned AS (
      DELETE FROM chai.idempotency_record
      WHERE expires_at <= now()
        AND status NOT IN ('PROCESSING', 'UNKNOWN_RESULT')
      RETURNING id
    )
    SELECT count(*)::integer AS count FROM pruned
  `;
  return rows[0]?.count ?? 0;
}
