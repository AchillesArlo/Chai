import { randomUUID } from 'node:crypto';

import type { DatabaseTransaction } from '@chai/database';

export type RefundStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface RefundRecord {
  id: string;
  tenantId: string;
  paymentId: string;
  amountCents: number;
  reason: string;
  status: RefundStatus;
  providerRef: string | null;
}

export interface ProcessRefundInput {
  paymentId: string;
  amountCents: number;
  reason: string;
  idempotencyKey: string;
  providerRef?: string;
}

interface RefundRow {
  amount_cents: number;
  created_at: Date;
  id: string;
  payment_id: string;
  provider_ref: string | null;
  reason: string;
  status: RefundStatus;
  tenant_id: string;
  updated_at: Date;
}

export async function processRefund(
  transaction: DatabaseTransaction,
  input: ProcessRefundInput,
): Promise<RefundRecord> {
  const existing = await transaction<RefundRow[]>`
    SELECT * FROM chai.refund
    WHERE idempotency_key = ${input.idempotencyKey}
    LIMIT 1
  `;
  if (existing.length > 0 && existing[0]) {
    return toRecord(existing[0]);
  }

  const payment = await transaction<{ amount_cents: number; status: string }[]>`
    SELECT amount_cents, status FROM chai.payment
    WHERE id = ${input.paymentId}
    FOR UPDATE
  `;
  const paymentRow = payment[0];
  if (!paymentRow) {
    throw new Error('PAYMENT_NOT_FOUND');
  }
  if (paymentRow.status !== 'PAID') {
    throw new Error('PAYMENT_NOT_REFUNDABLE');
  }
  if (input.amountCents > paymentRow.amount_cents) {
    throw new Error('REFUND_EXCEEDS_PAYMENT');
  }

  const id = randomUUID();
  const rows = await transaction<RefundRow[]>`
    INSERT INTO chai.refund (
      id, tenant_id, payment_id, amount_cents, reason,
      status, provider_ref, idempotency_key
    ) VALUES (
      ${id}, chai.current_tenant_id(), ${input.paymentId}, ${input.amountCents},
      ${input.reason}, 'PENDING', ${input.providerRef ?? null}, ${input.idempotencyKey}
    )
    RETURNING *
  `;
  const inserted = rows[0];
  if (!inserted) throw new Error('REFUND_INSERT_FAILED');
  return toRecord(inserted);
}

export async function getRefund(
  transaction: DatabaseTransaction,
  refundId: string,
): Promise<RefundRecord | null> {
  const rows = await transaction<RefundRow[]>`
    SELECT * FROM chai.refund WHERE id = ${refundId} LIMIT 1
  `;
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function listRefundsForPayment(
  transaction: DatabaseTransaction,
  paymentId: string,
): Promise<RefundRecord[]> {
  const rows = await transaction<RefundRow[]>`
    SELECT * FROM chai.refund
    WHERE payment_id = ${paymentId}
    ORDER BY created_at DESC
  `;
  return rows.map(toRecord);
}

function toRecord(row: RefundRow): RefundRecord {
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
