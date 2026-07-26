import { randomUUID } from 'node:crypto';

import type { DatabaseTransaction } from '@chai/database';

/**
 * Stage 4, S4-2 (FUL-02): shipment claims. Status machine guarded by
 * CHECK constraint in migration 0014: OPEN -> INVESTIGATING -> RESOLVED.
 */

export type ClaimStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED';

// ponytail: categories match migration 0014 CHECK constraint exactly.
export type ClaimCategory = 'DAMAGED' | 'LOST' | 'WRONG_ITEM';

export interface ClaimRecord {
  id: string;
  tenantId: string;
  shipmentId: string | null;
  category: ClaimCategory;
  amountCents: number;
  status: ClaimStatus;
  resolution?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateClaimInput {
  shipmentId?: string | null;
  category: ClaimCategory;
  amountCents: number;
}

const ALLOWED_TRANSITIONS: ReadonlyArray<[ClaimStatus, ClaimStatus]> = [
  ['OPEN', 'INVESTIGATING'],
  ['OPEN', 'RESOLVED'],
  ['INVESTIGATING', 'RESOLVED'],
];

function assertTransition(from: ClaimStatus, to: ClaimStatus): void {
  const ok = ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
  if (!ok) {
    throw new Error(`CLAIM_INVALID_TRANSITION:${from}->${to}`);
  }
}

export async function createClaim(
  tx: DatabaseTransaction,
  tenantId: string,
  input: CreateClaimInput,
): Promise<ClaimRecord> {
  const id = randomUUID();
  const rows = await tx`
    INSERT INTO chai.claim
      (id, tenant_id, shipment_id, claim_type, amount_cents, status)
    VALUES
      (${id}, ${tenantId}, ${input.shipmentId ?? null}, ${input.category}, ${input.amountCents}, 'OPEN')
    RETURNING * FROM chai.claim
  `;
  const row = rows[0];
  if (!row) throw new Error('claim insert returned no row');
  return toRecord(row as Record<string, unknown>);
}

export async function investigateClaim(
  tx: DatabaseTransaction,
  tenantId: string,
  claimId: string,
): Promise<ClaimRecord> {
  return transitionClaim(tx, tenantId, claimId, 'INVESTIGATING');
}

export async function resolveClaim(
  tx: DatabaseTransaction,
  tenantId: string,
  claimId: string,
  resolution: string,
): Promise<ClaimRecord> {
  return transitionClaim(tx, tenantId, claimId, 'RESOLVED', resolution);
}

async function transitionClaim(
  tx: DatabaseTransaction,
  tenantId: string,
  claimId: string,
  to: ClaimStatus,
  resolution?: string,
): Promise<ClaimRecord> {
  const current = await tx`
    SELECT * FROM chai.claim
    WHERE tenant_id = ${tenantId} AND id = ${claimId}
    FOR UPDATE
  `;
  if (current.length === 0) {
    throw new Error('CLAIM_NOT_FOUND');
  }
  const currentRow = current[0];
  if (!currentRow) throw new Error('CLAIM_NOT_FOUND');
  const from = currentRow.status as ClaimStatus;
  assertTransition(from, to);

  const rows = await tx`
    UPDATE chai.claim
    SET status = ${to},
        resolution = COALESCE(${resolution ?? null}, resolution),
        updated_at = now()
    WHERE tenant_id = ${tenantId} AND id = ${claimId}
    RETURNING * FROM chai.claim
  `;
  const row = rows[0];
  if (!row) throw new Error('claim transition returned no row');
  return toRecord(row);
}

export async function getClaim(
  tx: DatabaseTransaction,
  tenantId: string,
  claimId: string,
): Promise<ClaimRecord | null> {
  const rows = await tx`
    SELECT * FROM chai.claim
    WHERE tenant_id = ${tenantId} AND id = ${claimId}
  `;
  return rows.length === 0 ? null : toRecord(rows[0] as Record<string, unknown>);
}

export async function listClaims(
  tx: DatabaseTransaction,
  tenantId: string,
  limit = 50,
): Promise<ClaimRecord[]> {
  const rows = await tx`
    SELECT * FROM chai.claim
    WHERE tenant_id = ${tenantId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => toRecord(row));
}

function toRecord(row: Record<string, unknown>): ClaimRecord {
  return {
    amountCents: Number(row.amount_cents),
    category: row.claim_type as ClaimCategory,
    createdAt: new Date(row.created_at as string),
    id: row.id as string,
    resolution: (row.resolution as string | null) ?? null,
    shipmentId: (row.shipment_id as string | null) ?? null,
    status: row.status as ClaimStatus,
    tenantId: row.tenant_id as string,
    updatedAt: new Date(row.updated_at as string),
  };
}
