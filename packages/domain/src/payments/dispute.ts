import { randomUUID } from 'node:crypto';

import type { DatabaseTransaction } from '@chai/database';

export type DisputeStatus = 'CHALLENGED' | 'ACCEPTED' | 'LOST';

export interface DisputeRecord {
  id: string;
  tenantId: string;
  paymentId: string;
  amountCents: number;
  reason: string;
  status: DisputeStatus;
  providerRef: string | null;
}

export interface CreateDisputeInput {
  paymentId: string;
  amountCents: number;
  reason: string;
  idempotencyKey: string;
  providerRef?: string;
}

interface DisputeRow {
  amount_cents: number;
  created_at: Date;
  id: string;
  payment_id: string;
  provider_ref: string | null;
  reason: string;
  status: DisputeStatus;
  tenant_id: string;
  updated_at: Date;
}

export async function createDispute(
  transaction: DatabaseTransaction,
  input: CreateDisputeInput,
): Promise<DisputeRecord> {
  const existing = await transaction<DisputeRow[]>`
    SELECT * FROM chai.dispute
    WHERE idempotency_key = ${input.idempotencyKey}
    LIMIT 1
  `;
  if (existing.length > 0 && existing[0]) {
    return toRecord(existing[0]);
  }

  const id = randomUUID();
  const rows = await transaction<DisputeRow[]>`
    INSERT INTO chai.dispute (
      id, tenant_id, payment_id, amount_cents, reason,
      status, provider_ref, idempotency_key
    ) VALUES (
      ${id}, chai.current_tenant_id(), ${input.paymentId}, ${input.amountCents},
      ${input.reason}, 'CHALLENGED', ${input.providerRef ?? null}, ${input.idempotencyKey}
    )
    RETURNING *
  `;
  const inserted = rows[0];
  if (!inserted) throw new Error('DISPUTE_INSERT_FAILED');
  return toRecord(inserted);
}

export async function updateDispute(
  transaction: DatabaseTransaction,
  disputeId: string,
  status: DisputeStatus,
): Promise<DisputeRecord> {
  const rows = await transaction<DisputeRow[]>`
    UPDATE chai.dispute
    SET status = ${status}, updated_at = now()
    WHERE id = ${disputeId}
    RETURNING *
  `;
  const updated = rows[0];
  if (!updated) {
    throw new Error('DISPUTE_NOT_FOUND');
  }
  return toRecord(updated);
}

export async function getDispute(
  transaction: DatabaseTransaction,
  disputeId: string,
): Promise<DisputeRecord | null> {
  const rows = await transaction<DisputeRow[]>`
    SELECT * FROM chai.dispute WHERE id = ${disputeId} LIMIT 1
  `;
  return rows[0] ? toRecord(rows[0]) : null;
}

function toRecord(row: DisputeRow): DisputeRecord {
  return {
    amountCents: row.amount_cents,
    id: row.id,
    paymentId: row.payment_id,
    providerRef: row.provider_ref,
    reason: row.reason,
    status: row.status,
    tenantId: row.tenant_id,
  };
}
