import { randomUUID } from 'node:crypto';

import type { DatabaseTransaction } from '@chai/database';

/**
 * Stage 4, S4-2 (FUL-02): return portal domain. Status transitions are
 * guarded by CHECK constraints in migration 0014.
 */

// ponytail: statuses match migration 0014 CHECK constraint exactly.
export type ReturnStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED';

export interface ReturnRecord {
  id: string;
  tenantId: string;
  originalShipmentId: string | null;
  reason: string;
  status: ReturnStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateReturnInput {
  reason: string;
  originalShipmentId?: string | null;
}

const ALLOWED_TRANSITIONS: ReadonlyArray<[ReturnStatus, ReturnStatus]> = [
  ['PENDING', 'APPROVED'],
  ['PENDING', 'REJECTED'],
  ['APPROVED', 'COMPLETED'],
];

function assertTransition(from: ReturnStatus, to: ReturnStatus): void {
  const ok = ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
  if (!ok) {
    throw new Error(`RETURN_INVALID_TRANSITION:${from}->${to}`);
  }
}

export async function createReturnRequest(
  tx: DatabaseTransaction,
  tenantId: string,
  input: CreateReturnInput,
): Promise<ReturnRecord> {
  const id = randomUUID();
  const rows = await tx`
    INSERT INTO chai.return_request
      (id, tenant_id, original_shipment_id, reason, status)
    VALUES
      (${id}, ${tenantId}, ${input.originalShipmentId ?? null}, ${input.reason}, 'PENDING')
    RETURNING * FROM chai.return_request
  `;
  const row = rows[0];
  if (!row) throw new Error('return insert returned no row');
  return toRecord(row as Record<string, unknown>);
}

export async function approveReturn(
  tx: DatabaseTransaction,
  tenantId: string,
  returnId: string,
): Promise<ReturnRecord> {
  return transitionReturn(tx, tenantId, returnId, 'APPROVED');
}

export async function rejectReturn(
  tx: DatabaseTransaction,
  tenantId: string,
  returnId: string,
): Promise<ReturnRecord> {
  return transitionReturn(tx, tenantId, returnId, 'REJECTED');
}

export async function completeReturn(
  tx: DatabaseTransaction,
  tenantId: string,
  returnId: string,
): Promise<ReturnRecord> {
  return transitionReturn(tx, tenantId, returnId, 'COMPLETED');
}

async function transitionReturn(
  tx: DatabaseTransaction,
  tenantId: string,
  returnId: string,
  to: ReturnStatus,
): Promise<ReturnRecord> {
  const current = await tx`
    SELECT * FROM chai.return_request
    WHERE tenant_id = ${tenantId} AND id = ${returnId}
    FOR UPDATE
  `;
  if (current.length === 0) {
    throw new Error('RETURN_NOT_FOUND');
  }
  const currentRow = current[0] as Record<string, unknown>;
  const from = currentRow.status as ReturnStatus;
  assertTransition(from, to);

  const rows = await tx`
    UPDATE chai.return_request
    SET status = ${to},
        updated_at = now()
    WHERE tenant_id = ${tenantId} AND id = ${returnId}
    RETURNING * FROM chai.return_request
  `;
  const row = rows[0];
  if (!row) throw new Error('return transition returned no row');
  return toRecord(row as Record<string, unknown>);
}

export async function getReturn(
  tx: DatabaseTransaction,
  tenantId: string,
  returnId: string,
): Promise<ReturnRecord | null> {
  const rows = await tx`
    SELECT * FROM chai.return_request
    WHERE tenant_id = ${tenantId} AND id = ${returnId}
  `;
  return rows.length === 0 ? null : toRecord(rows[0] as Record<string, unknown>);
}

export async function listReturns(
  tx: DatabaseTransaction,
  tenantId: string,
  limit = 50,
): Promise<ReturnRecord[]> {
  const rows = await tx`
    SELECT * FROM chai.return_request
    WHERE tenant_id = ${tenantId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => toRecord(row));
}

function toRecord(row: Record<string, unknown>): ReturnRecord {
  return {
    createdAt: new Date(row.created_at as string),
    id: row.id as string,
    originalShipmentId: (row.original_shipment_id as string | null) ?? null,
    reason: row.reason as string,
    status: row.status as ReturnStatus,
    tenantId: row.tenant_id as string,
    updatedAt: new Date(row.updated_at as string),
  };
}
