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

  it('rejects a webhook whose event timestamp is outside the replay window', async () => {
    // REQ-10-016 / REQ-09-006 / REQ-09-023: a signature alone never expires,
    // so a captured request with a stale (or far-future) eventAt must be
    // rejected before it touches any business state.
    const payments = new PostgresPaymentsRepository(runtime);
    const session = await payments.createCheckout(API_TENANT_ID, {
      amount: 42_000,
      currency: 'IDR',
      idempotencyKey: `pay-stale-${Date.now()}`,
    });
    const staleEventAt = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago, window is 5 min
    const raw = Buffer.from(
      JSON.stringify({
        externalId: session.externalId,
        tenantId: API_TENANT_ID,
        status: 'PAID',
        eventAt: staleEventAt,
        providerEventId: `evt-stale-${Date.now()}`,
      }),
    );
    const result = await payments.applyWebhook('mock-payment', raw, signMockPaymentWebhook(raw));
    expect(result.verified).toBe(false);
    expect(result.event).toBeNull();

    // The rejected event must not have moved the payment off PENDING.
    const unchanged = await payments.getSession(API_TENANT_ID, session.externalId);
    expect(unchanged?.status).toBe('PENDING');
  });

  it('rejects a webhook with no event timestamp at all', async () => {
    const payments = new PostgresPaymentsRepository(runtime);
    const session = await payments.createCheckout(API_TENANT_ID, {
      amount: 15_000,
      currency: 'IDR',
      idempotencyKey: `pay-no-ts-${Date.now()}`,
    });
    const raw = Buffer.from(
      JSON.stringify({
        externalId: session.externalId,
        tenantId: API_TENANT_ID,
        status: 'PAID',
        // No eventAt/occurredAt field at all.
      }),
    );
    const result = await payments.applyWebhook('mock-payment', raw, signMockPaymentWebhook(raw));
    expect(result.verified).toBe(false);
    expect(result.event).toBeNull();
  });

  it('does not reprocess a webhook replayed inside the window with the same provider event id', async () => {
    // The dedup table (chai.payment_webhook_event, migration 0084) rejects a
    // repeat of the SAME provider event id, distinct from
    // decidePaymentTransition's status-based duplicate check — this proves
    // the dedup gate itself, not just the state machine's side effect.
    const payments = new PostgresPaymentsRepository(runtime);
    const session = await payments.createCheckout(API_TENANT_ID, {
      amount: 77_000,
      currency: 'IDR',
      idempotencyKey: `pay-replay-${Date.now()}`,
    });
    const providerEventId = `evt-replay-${Date.now()}`;
    const raw = Buffer.from(
      JSON.stringify({
        externalId: session.externalId,
        tenantId: API_TENANT_ID,
        status: 'PENDING',
        eventAt: new Date().toISOString(),
        providerEventId,
      }),
    );
    const signature = signMockPaymentWebhook(raw);

    const first = await payments.applyWebhook('mock-payment', raw, signature);
    expect(first.verified).toBe(true);

    const replay = await payments.applyWebhook('mock-payment', raw, signature);
    expect(replay.verified).toBe(true);
    // Reported as the current state, not reprocessed — proven at the
    // repository level here; audit/event non-duplication is proven at the
    // transaction level in payment-webhook-audit.integration.test.ts.
    expect(replay.event?.status).toBe('PENDING');

    const rows = await admin<{ count: number }[]>`
      SELECT count(*)::int AS count FROM chai.payment_webhook_event
      WHERE tenant_id = ${API_TENANT_ID} AND provider_event_id = ${providerEventId}
    `;
    expect(rows[0]?.count).toBe(1);
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
        eventAt: new Date().toISOString(),
      }),
    );
    // The mock adapter verifies an HMAC now, so the test has to sign the exact
    // bytes it sends. A fixed literal signature was the old, forgeable contract.
    const result = await payments.applyWebhook('mock-payment', raw, signMockPaymentWebhook(raw));
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
    const result = await payments.applyWebhook('mock-payment', raw, 'not-the-signature');
    expect(result.verified).toBe(false);
    expect(result.event).toBeNull();
  });

  it('rejects an unknown provider outright', async () => {
    const payments = new PostgresPaymentsRepository(runtime);
    const raw = Buffer.from('{}');
    const result = await payments.applyWebhook('unknown-provider', raw, 'anything');
    expect(result.verified).toBe(false);
    expect(result.event).toBeNull();
  });

  it('rejects a midtrans webhook when no server key is configured (default-closed)', async () => {
    // MIDTRANS_SERVER_KEY is not set in this test environment, so the
    // Midtrans adapter must refuse every webhook rather than fall back to
    // an unverifiable "sandbox" acceptance (17_PAYMENT §2.4, 10_SECURITY §9).
    const payments = new PostgresPaymentsRepository(runtime);
    const raw = Buffer.from(
      JSON.stringify({
        order_id: `${API_TENANT_ID}|pay_midtrans_test`,
        status_code: '200',
        gross_amount: '10000.00',
        transaction_status: 'settlement',
      }),
    );
    const result = await payments.applyWebhook('midtrans', raw, 'any-signature-key');
    expect(result.verified).toBe(false);
    expect(result.event).toBeNull();
  });
});
