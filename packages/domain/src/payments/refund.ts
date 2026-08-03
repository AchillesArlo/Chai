import { randomUUID } from 'node:crypto';

import type { DatabaseTransaction } from '@chai/database';

import { commitBusinessMutation } from '../outbox/producer';

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
  actorId?: string;
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
  let record!: RefundRecord;

  await commitBusinessMutation(transaction, {
    describe: (res) => ({
      audit: {
        action: 'payment.refund_created',
        actorId: input.actorId ?? '00000000-0000-4000-8000-000000000001',
        metadata: {
          amountCents: res.amountCents,
          paymentId: res.paymentId,
          providerRef: res.providerRef,
        },
        reason: res.reason,
        resourceId: res.id,
        resourceType: 'refund',
      },
      events: [
        {
          aggregateId: res.paymentId,
          aggregateType: 'payment',
          aggregateVersion: 4,
          eventType: 'payment.refunded',
          partitionKey: res.paymentId,
          payload: {
            amountCents: res.amountCents,
            paymentId: res.paymentId,
            reason: res.reason,
            refundId: res.id,
            status: res.status,
          },
        },
      ],
    }),
    mutate: async () => {
      const rows = await transaction<RefundRow[]>`
        INSERT INTO chai.refund (
          id, tenant_id, payment_id, amount_cents, reason,
          status, provider_ref, idempotency_key
        ) VALUES (
          ${id}, chai.current_tenant_id(), ${input.paymentId}, ${input.amountCents},
          ${input.reason}, 'COMPLETED', ${input.providerRef ?? null}, ${input.idempotencyKey}
        )
        RETURNING *
      `;
      const inserted = rows[0];
      if (!inserted) throw new Error('REFUND_INSERT_FAILED');
      record = toRecord(inserted);
      return record;
    },
    tenantId: await getTenantId(transaction),
  });

  return record;
}

async function getTenantId(tx: DatabaseTransaction): Promise<string> {
  const rows = await tx<{ current_tenant_id: string }[]>`SELECT chai.current_tenant_id()`;
  return rows[0]?.current_tenant_id ?? '';
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

/* Operational Reconciliation Mismatch (REQ-17-065, Blueprint 05 §11.7) */

export type ReconciliationStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'IGNORED';

export interface PaymentReconciliationRecord {
  id: string;
  tenantId: string;
  paymentId: string | null;
  provider: string;
  externalId: string;
  discrepancyType: string;
  localStatus: string | null;
  providerStatus: string | null;
  localAmountCents: number | null;
  providerAmountCents: number | null;
  assignedOwnerId: string | null;
  agingDays: number;
  status: ReconciliationStatus;
  resolutionNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ReconciliationRow {
  aging_days: number;
  assigned_owner_id: string | null;
  created_at: Date;
  discrepancy_type: string;
  external_id: string;
  id: string;
  local_amount_cents: number | null;
  local_status: string | null;
  payment_id: string | null;
  provider: string;
  provider_amount_cents: number | null;
  provider_status: string | null;
  resolution_notes: string | null;
  status: ReconciliationStatus;
  tenant_id: string;
  updated_at: Date;
}

export async function createReconciliationRecord(
  transaction: DatabaseTransaction,
  input: {
    assignedOwnerId?: string | null;
    discrepancyType: string;
    externalId: string;
    localAmountCents?: number | null;
    localStatus?: string | null;
    paymentId?: string | null;
    provider: string;
    providerAmountCents?: number | null;
    providerStatus?: string | null;
  },
): Promise<PaymentReconciliationRecord> {
  const id = randomUUID();
  const rows = await transaction<ReconciliationRow[]>`
    INSERT INTO chai.payment_reconciliation (
      id, tenant_id, payment_id, provider, external_id,
      discrepancy_type, local_status, provider_status,
      local_amount_cents, provider_amount_cents, assigned_owner_id,
      aging_days, status
    ) VALUES (
      ${id}, chai.current_tenant_id(), ${input.paymentId ?? null}, ${input.provider}, ${input.externalId},
      ${input.discrepancyType}, ${input.localStatus ?? null}, ${input.providerStatus ?? null},
      ${input.localAmountCents ?? null}, ${input.providerAmountCents ?? null}, ${input.assignedOwnerId ?? null},
      0, 'OPEN'
    )
    RETURNING *
  `;
  const inserted = rows[0];
  if (!inserted) throw new Error('RECONCILIATION_INSERT_FAILED');
  return toReconciliationRecord(inserted);
}

export async function listReconciliationRecords(
  transaction: DatabaseTransaction,
): Promise<PaymentReconciliationRecord[]> {
  const rows = await transaction<ReconciliationRow[]>`
    SELECT * FROM chai.payment_reconciliation
    ORDER BY created_at DESC
  `;
  return rows.map(toReconciliationRecord);
}

export async function resolveReconciliationRecord(
  transaction: DatabaseTransaction,
  id: string,
  notes: string,
  actorId?: string,
): Promise<PaymentReconciliationRecord> {
  const tenantId = await getTenantId(transaction);
  let record!: PaymentReconciliationRecord;

  await commitBusinessMutation(transaction, {
    describe: (res) => ({
      audit: {
        action: 'payment.reconciliation_resolved',
        actorId: actorId ?? '00000000-0000-4000-8000-000000000001',
        metadata: {
          discrepancyType: res.discrepancyType,
          externalId: res.externalId,
          status: res.status,
        },
        reason: notes,
        resourceId: res.id,
        resourceType: 'payment_reconciliation',
      },
      events: [
        {
          aggregateId: res.id,
          aggregateType: 'payment_reconciliation',
          aggregateVersion: 1,
          eventType: 'payment.reconciliation_resolved',
          partitionKey: res.externalId,
          payload: {
            discrepancyType: res.discrepancyType,
            externalId: res.externalId,
            id: res.id,
            resolutionNotes: res.resolutionNotes,
            status: res.status,
          },
        },
      ],
    }),
    mutate: async () => {
      const rows = await transaction<ReconciliationRow[]>`
        UPDATE chai.payment_reconciliation
        SET status = 'RESOLVED',
            resolution_notes = ${notes},
            updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
      const updated = rows[0];
      if (!updated) throw new Error('RECONCILIATION_NOT_FOUND');
      record = toReconciliationRecord(updated);
      return record;
    },
    tenantId,
  });

  return record;
}

function toReconciliationRecord(row: ReconciliationRow): PaymentReconciliationRecord {
  return {
    agingDays: row.aging_days,
    assignedOwnerId: row.assigned_owner_id,
    createdAt: row.created_at,
    discrepancyType: row.discrepancy_type,
    externalId: row.external_id,
    id: row.id,
    localAmountCents: row.local_amount_cents,
    localStatus: row.local_status,
    paymentId: row.payment_id,
    provider: row.provider,
    providerAmountCents: row.provider_amount_cents,
    providerStatus: row.provider_status,
    resolutionNotes: row.resolution_notes,
    status: row.status,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
  };
}
