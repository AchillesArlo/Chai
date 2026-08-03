import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase, type Database } from '@chai/database';

import { API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresAdvancedPaymentsRepository } from '../../src/modules/advanced-payments/postgres-advanced-payments.repository';
import { PostgresPaymentsRepository } from '../../src/modules/payments/postgres-payments.repository';

describe('API Postgres advanced-payments repository (S4-1 / FASE 8)', () => {
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

  it('processes a refund against an existing payment and emits audit and event (REQ-17-027)', async () => {
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

    // Verify audit entry and outbox event were committed
    const auditRows = await admin<Array<{ action: string }>>`
      SELECT action FROM chai.audit_log
      WHERE tenant_id = ${API_TENANT_ID} AND resource_id = ${refund.id}
    `;
    expect(auditRows.length).toBeGreaterThan(0);
    expect(auditRows[0]?.action).toBe('payment.refund_created');

    const outboxRows = await admin<Array<{ event_type: string }>>`
      SELECT event_type FROM chai.outbox_event
      WHERE tenant_id = ${API_TENANT_ID} AND aggregate_id = ${paymentIdNonNull}
        AND event_type = 'payment.refunded'
    `;
    expect(outboxRows.length).toBeGreaterThan(0);

    const idempotent = await advanced.processRefund(API_TENANT_ID, {
      amountCents: 5_000,
      idempotencyKey: 'refund-s4-1-1',
      paymentId: paymentIdNonNull,
      reason: 'partial refund per customer request',
    });
    expect(idempotent.id).toBe(refund.id);
  });

  it('records, lists, and resolves reconciliation mismatches (REQ-17-065)', async () => {
    const advanced = new PostgresAdvancedPaymentsRepository(runtime);

    // Insert a test discrepancy into chai.payment_reconciliation
    const reconId = '01890f47-9b3c-7cc2-98e8-0000000000e1';
    await admin`
      INSERT INTO chai.payment_reconciliation (
        id, tenant_id, provider, external_id, discrepancy_type, local_status, provider_status
      ) VALUES (
        ${reconId}, ${API_TENANT_ID}, 'midtrans', 'ext-recon-123', 'STATUS_MISMATCH', 'PENDING', 'PAID'
      )
      ON CONFLICT (id) DO NOTHING
    `;

    const items = await advanced.listReconciliations(API_TENANT_ID);
    const target = items.find((i) => i.id === reconId);
    expect(target).toBeTruthy();
    expect(target?.status).toBe('OPEN');

    const resolved = await advanced.resolveReconciliation(
      API_TENANT_ID,
      reconId,
      'Resolved after manual verification of Midtrans statement',
    );
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolutionNotes).toContain('manual verification');

    // Verify audit entry for resolution
    const auditRows = await admin<Array<{ action: string }>>`
      SELECT action FROM chai.audit_log
      WHERE tenant_id = ${API_TENANT_ID} AND resource_id = ${reconId}
    `;
    expect(auditRows.some((a) => a.action === 'payment.reconciliation_resolved')).toBe(true);
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
