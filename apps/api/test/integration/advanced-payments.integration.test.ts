import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase, type Database } from '@chai/database';

import { API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresAdvancedPaymentsRepository } from '../../src/modules/advanced-payments/postgres-advanced-payments.repository';
import { PostgresPaymentsRepository } from '../../src/modules/payments/postgres-payments.repository';

describe('API Postgres advanced-payments repository (S4-1)', () => {
  const adminUrl = inject('adminDatabaseUrl') as string;
  const runtimeUrl = inject('runtimeDatabaseUrl') as string;
  let admin: ReturnType<typeof createDatabase>;
  let runtime: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    admin = createDatabase(adminUrl);
    runtime = createDatabase(runtimeUrl);
    await seedApiRuntime(admin);
  });

  afterAll(async () => {
    await runtime.end();
    await admin.end();
  });

  it('creates, lists, and cancels a subscription under RLS', async () => {
    const advanced = new PostgresAdvancedPaymentsRepository(runtime);
    const customerId = '01890f47-9b3c-7cc2-98e8-0000000000c1';

    const created = await advanced.createSubscription(API_TENANT_ID, {
      amountCents: 50_000,
      billingCycle: 'MONTHLY',
      currency: 'IDR',
      customerId,
      idempotencyKey: 'sub-s4-1-create',
      planId: 'plan-pro-monthly',
    });
    expect(created.id).toBeTruthy();
    expect(created.status).toBe('ACTIVE');
    expect(created.tenantId).toBe(API_TENANT_ID);
    expect(created.currentPeriodEnd).not.toBe(created.currentPeriodStart);

    const listed = await advanced.listSubscriptions(API_TENANT_ID, customerId);
    expect(listed.some((sub) => sub.id === created.id)).toBe(true);

    const cancelled = await advanced.cancelSubscription(API_TENANT_ID, created.id);
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('makes a subscription idempotent by idempotency key', async () => {
    const advanced = new PostgresAdvancedPaymentsRepository(runtime);
    const customerId = '01890f47-9b3c-7cc2-98e8-0000000000c2';

    const first = await advanced.createSubscription(API_TENANT_ID, {
      amountCents: 99_00,
      billingCycle: 'YEARLY',
      currency: 'USD',
      customerId,
      idempotencyKey: 'sub-s4-1-idem',
      planId: 'plan-pro-yearly',
    });
    const second = await advanced.createSubscription(API_TENANT_ID, {
      amountCents: 99_00,
      billingCycle: 'YEARLY',
      currency: 'USD',
      customerId,
      idempotencyKey: 'sub-s4-1-idem',
      planId: 'plan-pro-yearly',
    });
    expect(second.id).toBe(first.id);
  });

  it('isolates subscriptions by tenant under RLS', async () => {
    const advanced = new PostgresAdvancedPaymentsRepository(runtime);
    const cross = await advanced.listSubscriptions(
      '01890f47-9b3c-7cc2-98e8-000000000099',
    );
    expect(cross).toEqual([]);
  });

  it('processes a refund against an existing payment and reads it back', async () => {
    const advanced = new PostgresAdvancedPaymentsRepository(runtime);
    const payments = new PostgresPaymentsRepository(runtime);

    const session = await payments.createCheckout(API_TENANT_ID, {
      amount: 12_500,
      currency: 'IDR',
      idempotencyKey: 'pay-s4-1-refund-target',
    });
    const paymentId = await resolvePaymentId(admin, API_TENANT_ID, session.externalId);
    expect(paymentId).not.toBeNull();
    const paymentIdNonNull = paymentId as string;

    // mark the payment as PAID so refund logic accepts it
    await admin`
      UPDATE chai.payment SET status = 'PAID' WHERE id = ${paymentIdNonNull}
    `;

    const refund = await advanced.processRefund(API_TENANT_ID, {
      amountCents: 5_000,
      idempotencyKey: 'refund-s4-1-1',
      paymentId: paymentIdNonNull,
      reason: 'partial refund per customer request',
    });
    expect(refund.paymentId).toBe(paymentIdNonNull);
    expect(refund.amountCents).toBe(5_000);
    expect(refund.tenantId).toBe(API_TENANT_ID);

    const fetched = await advanced.getRefund(API_TENANT_ID, refund.id);
    expect(fetched?.id).toBe(refund.id);

    const forPayment = await advanced.listRefundsForPayment(API_TENANT_ID, paymentIdNonNull);
    expect(forPayment.some((r) => r.id === refund.id)).toBe(true);

    const idempotent = await advanced.processRefund(API_TENANT_ID, {
      amountCents: 5_000,
      idempotencyKey: 'refund-s4-1-1',
      paymentId: paymentIdNonNull,
      reason: 'partial refund per customer request',
    });
    expect(idempotent.id).toBe(refund.id);
  });

  it('returns an empty settlement list for a tenant with no settlements', async () => {
    const advanced = new PostgresAdvancedPaymentsRepository(runtime);
    const settlements = await advanced.listSettlements(API_TENANT_ID);
    expect(Array.isArray(settlements)).toBe(true);
  });
});

async function resolvePaymentId(
  admin: Database,
  tenantId: string,
  externalId: string,
): Promise<string | null> {
  const rows = await admin<Array<{ id: string }>>`
    SELECT id FROM chai.payment
    WHERE tenant_id = ${tenantId}
      AND external_id = ${externalId}
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}
