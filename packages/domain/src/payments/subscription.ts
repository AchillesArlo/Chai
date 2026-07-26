import { randomUUID } from 'node:crypto';

import type { DatabaseTransaction } from '@chai/database';

export type SubscriptionStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';
export type BillingCycle = 'MONTHLY' | 'YEARLY';

export interface SubscriptionRecord {
  id: string;
  tenantId: string;
  customerId: string;
  planId: string;
  status: SubscriptionStatus;
  amountCents: number;
  currency: string;
  billingCycle: BillingCycle;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  providerRef: string | null;
}

export interface CreateSubscriptionInput {
  customerId: string;
  planId: string;
  amountCents: number;
  currency: string;
  billingCycle: BillingCycle;
  idempotencyKey: string;
  providerRef?: string;
}

interface SubscriptionRow {
  amount_cents: number;
  billing_cycle: BillingCycle;
  created_at: Date;
  currency: string;
  current_period_end: Date;
  current_period_start: Date;
  customer_id: string;
  id: string;
  plan_id: string;
  provider_ref: string | null;
  status: SubscriptionStatus;
  tenant_id: string;
  updated_at: Date;
}

/**
 * Cycle-length helper kept in one place so renew + create stay in sync.
 * ponytail: MONTHLY=30d, YEARLY=365d — calendar drift acceptable for billing
 * scheduling; switch to date-fns if proration disputes arise.
 */
export function nextPeriodEnd(start: Date, cycle: BillingCycle): Date {
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + (cycle === 'YEARLY' ? 365 : 30));
  return end;
}

export async function createSubscription(
  transaction: DatabaseTransaction,
  input: CreateSubscriptionInput,
): Promise<SubscriptionRecord> {
  const existing = await transaction<SubscriptionRow[]>`
    SELECT * FROM chai.subscription
    WHERE idempotency_key = ${input.idempotencyKey}
    LIMIT 1
  `;
  if (existing.length > 0 && existing[0]) {
    return toRecord(existing[0]);
  }

  const id = randomUUID();
  const start = new Date();
  const end = nextPeriodEnd(start, input.billingCycle);

  const rows = await transaction<SubscriptionRow[]>`
    INSERT INTO chai.subscription (
      id, tenant_id, customer_id, plan_id, status,
      amount_cents, currency, billing_cycle,
      current_period_start, current_period_end,
      provider_ref, idempotency_key
    ) VALUES (
      ${id}, chai.current_tenant_id(), ${input.customerId}, ${input.planId}, 'ACTIVE',
      ${input.amountCents}, ${input.currency}, ${input.billingCycle},
      ${start}, ${end},
      ${input.providerRef ?? null}, ${input.idempotencyKey}
    )
    RETURNING *
  `;
  const inserted = rows[0];
  if (!inserted) throw new Error('SUBSCRIPTION_INSERT_FAILED');
  return toRecord(inserted);
}

export async function renewSubscription(
  transaction: DatabaseTransaction,
  subscriptionId: string,
): Promise<SubscriptionRecord> {
  const existing = await transaction<SubscriptionRow[]>`
    SELECT * FROM chai.subscription
    WHERE id = ${subscriptionId}
    FOR UPDATE
  `;
  const current = existing[0];
  if (!current) {
    throw new Error('SUBSCRIPTION_NOT_FOUND');
  }
  if (current.status === 'CANCELLED') {
    throw new Error('SUBSCRIPTION_CANCELLED');
  }

  const start = new Date();
  const end = nextPeriodEnd(start, current.billing_cycle);

  const rows = await transaction<SubscriptionRow[]>`
    UPDATE chai.subscription
    SET current_period_start = ${start},
        current_period_end = ${end},
        status = 'ACTIVE',
        updated_at = now()
    WHERE id = ${subscriptionId}
    RETURNING *
  `;
  const renewed = rows[0];
  if (!renewed) throw new Error('SUBSCRIPTION_RENEW_FAILED');
  return toRecord(renewed);
}

export async function cancelSubscription(
  transaction: DatabaseTransaction,
  subscriptionId: string,
): Promise<SubscriptionRecord> {
  const rows = await transaction<SubscriptionRow[]>`
    UPDATE chai.subscription
    SET status = 'CANCELLED', updated_at = now()
    WHERE id = ${subscriptionId}
      AND status IN ('ACTIVE', 'PAUSED')
    RETURNING *
  `;
  const cancelled = rows[0];
  if (!cancelled) {
    throw new Error('SUBSCRIPTION_NOT_CANCELLABLE');
  }
  return toRecord(cancelled);
}

export async function listSubscriptions(
  transaction: DatabaseTransaction,
  customerId?: string,
): Promise<SubscriptionRecord[]> {
  const rows = customerId
    ? await transaction<SubscriptionRow[]>`
        SELECT * FROM chai.subscription
        WHERE customer_id = ${customerId}
        ORDER BY created_at DESC
      `
    : await transaction<SubscriptionRow[]>`
        SELECT * FROM chai.subscription
        ORDER BY created_at DESC
      `;
  return rows.map(toRecord);
}

function toRecord(row: SubscriptionRow): SubscriptionRecord {
  return {
    amountCents: row.amount_cents,
    billingCycle: row.billing_cycle,
    currentPeriodEnd: row.current_period_end.toISOString(),
    currentPeriodStart: row.current_period_start.toISOString(),
    currency: row.currency,
    customerId: row.customer_id,
    id: row.id,
    planId: row.plan_id,
    providerRef: row.provider_ref,
    status: row.status,
    tenantId: row.tenant_id,
  };
}
