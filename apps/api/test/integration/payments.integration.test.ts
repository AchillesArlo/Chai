import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresPaymentsRepository } from '../../src/modules/payments/postgres-payments.repository';
import { signMockPaymentWebhook } from '@chai/connectors/mock-payment';

describe('API Postgres payments repository (S2-1)', () => {
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

  it('creates a checkout session and retrieves it by external id under RLS', async () => {
    const payments = new PostgresPaymentsRepository(runtime);
    const session = await payments.createCheckout(API_TENANT_ID, {
      amount: 75_000,
      currency: 'IDR',
      idempotencyKey: 'pay-s2-1-create',
    });
    expect(session.externalId).toMatch(/^pay_/);
    expect(session.tenantId).toBe(API_TENANT_ID);
    expect(session.status).toBe('PENDING');
    expect(session.checkoutUrl).toContain(session.externalId);

    const fetched = await payments.getSession(
      API_TENANT_ID,
      session.externalId,
    );
    expect(fetched).not.toBeNull();
    if (fetched) {
      expect(fetched.externalId).toBe(session.externalId);
    }
  });

  it('returns the same session for a repeated idempotency key', async () => {
    const payments = new PostgresPaymentsRepository(runtime);
    const first = await payments.createCheckout(API_TENANT_ID, {
      amount: 12_500,
      currency: 'IDR',
      idempotencyKey: 'pay-s2-1-idem',
    });
    const second = await payments.createCheckout(API_TENANT_ID, {
      amount: 12_500,
      currency: 'IDR',
      idempotencyKey: 'pay-s2-1-idem',
    });
    expect(second.externalId).toBe(first.externalId);
    expect(second.amount).toBe(first.amount);
  });

  it('isolates sessions by tenant under RLS', async () => {
    const payments = new PostgresPaymentsRepository(runtime);
    const cross = await payments.getSession(
      '01890f47-9b3c-7cc2-98e8-000000000099',
      'pay_does_not_exist',
    );
    expect(cross).toBeNull();
  });

  it('rejects checkout while the kill switch is active', async () => {
    const payments = new PostgresPaymentsRepository(runtime);
    payments.setKillSwitch(true);
    expect(payments.isKillSwitchOn()).toBe(true);
    await expect(
      payments.createCheckout(API_TENANT_ID, {
        amount: 500,
        currency: 'IDR',
        idempotencyKey: 'pay-s2-1-kill',
      }),
    ).rejects.toThrow('PAYMENT_KILL_SWITCH');
    payments.setKillSwitch(false);
  });

  it('applies a verified webhook and updates the session status', async () => {
    const payments = new PostgresPaymentsRepository(runtime);
    const session = await payments.createCheckout(API_TENANT_ID, {
      amount: 99_999,
      currency: 'IDR',
      idempotencyKey: 'pay-s2-1-webhook',
    });
    const raw = Buffer.from(
      JSON.stringify({
        externalId: session.externalId,
        tenantId: API_TENANT_ID,
        status: 'PAID',
      }),
    );
    // The mock adapter verifies an HMAC now, so the test has to sign the exact
    // bytes it sends. A fixed literal signature was the old, forgeable contract.
    const result = await payments.applyWebhook(raw, signMockPaymentWebhook(raw));
    expect(result.verified).toBe(true);
    expect(result.event).not.toBeNull();
    if (result.event) {
      expect(result.event.externalId).toBe(session.externalId);
      expect(result.event.status).toBe('PAID');
    }

    const settled = await payments.getSession(
      API_TENANT_ID,
      session.externalId,
    );
    if (settled) {
      expect(settled.status).toBe('PAID');
    }
  });

  it('rejects a webhook with a bad signature', async () => {
    const payments = new PostgresPaymentsRepository(runtime);
    const raw = Buffer.from('{}');
    const result = await payments.applyWebhook(raw, 'not-the-signature');
    expect(result.verified).toBe(false);
    expect(result.event).toBeNull();
  });
});
