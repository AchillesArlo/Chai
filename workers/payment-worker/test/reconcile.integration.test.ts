import {
  createDatabase,
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
  type TenantContext,
} from '@chai/database';
import { afterEach, beforeAll, describe, expect, inject, it } from 'vitest';

import { runPaymentReconciler, type PaymentProviderPort } from '../src';

import {
  fetchAuditEntries,
  fetchOutboxEvents,
  fetchPayment,
  PAYMENT_IDS,
  resetPaymentTables,
  seedFoundation,
  seedPayment,
} from './helpers';

/** A provider that always reports the same status, standing in for a real PSP. */
function fixedProvider(status: string, eventAt: Date | null = null): PaymentProviderPort {
  return {
    async fetchStatus() {
      return { eventAt, status };
    },
  };
}

const tenantContext = {
  principalId: PAYMENT_IDS.workerUser,
  tenantId: PAYMENT_IDS.tenantA,
};

const options = { batchLimit: 50, pollIntervalMs: 0 };

describe('payment reconciler — provider poll converges local state under RLS', () => {
  let adminDatabaseUrl: string;
  let workerDatabaseUrl: string;

  beforeAll(async () => {
    adminDatabaseUrl = inject('adminDatabaseUrl');
    workerDatabaseUrl = inject('workerDatabaseUrl');
    await seedFoundation(adminDatabaseUrl);
  });

  afterEach(async () => {
    await resetPaymentTables(adminDatabaseUrl);
  });

  it('reconciles PENDING→PAID and never regresses PAID when a later poll reports PENDING', async () => {
    await seedPayment(adminDatabaseUrl, {
      externalId: 'pay_recon_paid',
      id: PAYMENT_IDS.paymentOne,
      status: 'PENDING',
    });

    const worker = createDatabase(workerDatabaseUrl);
    try {
      // Pass 1: provider reports PAID.
      await runPaymentReconciler({
        database: worker,
        iterations: 1,
        options,
        provider: fixedProvider('PAID'),
        tenants: [tenantContext],
      });

      expect((await fetchPayment(adminDatabaseUrl, 'pay_recon_paid'))?.status).toBe('PAID');

      // Pass 2: a late/redelivered PENDING must NOT undo the settled payment.
      await runPaymentReconciler({
        database: worker,
        iterations: 1,
        options,
        provider: fixedProvider('PENDING'),
        tenants: [tenantContext],
      });

      expect((await fetchPayment(adminDatabaseUrl, 'pay_recon_paid'))?.status).toBe('PAID');
    } finally {
      await worker.end();
    }

    // Exactly one settlement event and one audit entry — the second pass, seeing
    // a terminal session, must produce nothing.
    const events = await fetchOutboxEvents(adminDatabaseUrl);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('payment.paid');
    expect(events[0]?.aggregateType).toBe('payment');
    expect(events[0]?.payload.status).toBe('PAID');

    const audit = await fetchAuditEntries(adminDatabaseUrl);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe('payment.reconcile');
  });

  it('parks an unrecognised provider status at UNKNOWN_RESULT without closing the session', async () => {
    await seedPayment(adminDatabaseUrl, {
      externalId: 'pay_recon_unknown',
      id: PAYMENT_IDS.paymentOne,
      status: 'PENDING',
    });

    const worker = createDatabase(workerDatabaseUrl);
    try {
      // A code the platform cannot classify must not be guessed into a terminal
      // state; it converges to UNKNOWN_RESULT (still open for the next pass).
      await runPaymentReconciler({
        database: worker,
        iterations: 1,
        options,
        provider: fixedProvider('SOME_NEW_PSP_CODE'),
        tenants: [tenantContext],
      });

      const afterUnknown = await fetchPayment(adminDatabaseUrl, 'pay_recon_unknown');
      expect(afterUnknown?.status).toBe('UNKNOWN_RESULT');

      const events = await fetchOutboxEvents(adminDatabaseUrl);
      expect(events).toHaveLength(1);
      expect(events[0]?.eventType).toBe('payment.unknown_result');

      // The session is still open, so a subsequent PAID resolves it.
      await runPaymentReconciler({
        database: worker,
        iterations: 1,
        options,
        provider: fixedProvider('PAID'),
        tenants: [tenantContext],
      });

      expect((await fetchPayment(adminDatabaseUrl, 'pay_recon_unknown'))?.status).toBe('PAID');
    } finally {
      await worker.end();
    }
  });

  it('commits the status change, the audit entry, and the outbox event in one transaction (all-or-nothing)', async () => {
    await seedPayment(adminDatabaseUrl, {
      externalId: 'pay_recon_atomic',
      id: PAYMENT_IDS.paymentOne,
      status: 'PENDING',
    });

    // Inject a fault via the tenant-transaction seam: the apply pass (which
    // returns a boolean after writing status + audit + outbox) is aborted from
    // inside its own transaction. If the three writes were not one transaction,
    // one of them would survive; they must all roll back together.
    const faultAfterApply = <T>(
      db: Database,
      context: TenantContext,
      operation: (tx: DatabaseTransaction) => Promise<T>,
    ): Promise<T> =>
      withTenantTransaction(db, context, async (tx) => {
        const result = await operation(tx);
        if (!Array.isArray(result)) {
          throw new Error('INJECTED_ROLLBACK');
        }
        return result;
      });

    const worker = createDatabase(workerDatabaseUrl);
    try {
      await expect(
        runPaymentReconciler({
          database: worker,
          iterations: 1,
          options,
          provider: fixedProvider('PAID'),
          runInTenant: faultAfterApply,
          tenants: [tenantContext],
        }),
      ).rejects.toThrow('INJECTED_ROLLBACK');
    } finally {
      await worker.end();
    }

    // Nothing partially committed: status unchanged, no event, no audit.
    expect((await fetchPayment(adminDatabaseUrl, 'pay_recon_atomic'))?.status).toBe('PENDING');
    expect(await fetchOutboxEvents(adminDatabaseUrl)).toHaveLength(0);
    expect(await fetchAuditEntries(adminDatabaseUrl)).toHaveLength(0);
  });
});
