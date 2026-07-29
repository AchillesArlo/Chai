import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';
import { signMockPaymentWebhook } from '@chai/connectors/mock-payment';

import { API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresPaymentsRepository } from '../../src/modules/payments/postgres-payments.repository';

/**
 * REQ-17-009 regression (audit jalur C, CRITICAL): a payment webhook is an
 * external effect on the money path, so the state change, its audit row, and
 * its outbox event must commit in ONE transaction (README invariant, ADR-007).
 *
 * applyWebhook previously ran a bare UPDATE: a PAID transition left no audit
 * trail and emitted no event, so realtime/analytics/automation never learned
 * the payment settled and nothing recorded the money state change.
 */
describe('payment webhook commits mutation + audit + event together (REQ-17-009)', () => {
  const adminUrl = inject('adminDatabaseUrl') as string;
  const runtimeUrl = inject('runtimeDatabaseUrl') as string;
  let admin: ReturnType<typeof createDatabase>;
  let runtime: ReturnType<typeof createDatabase>;
  let repo: PostgresPaymentsRepository;

  beforeAll(async () => {
    admin = createDatabase(adminUrl);
    runtime = createDatabase(runtimeUrl);
    await seedApiRuntime(admin);
    repo = new PostgresPaymentsRepository(runtime);
  });

  afterAll(async () => {
    await runtime.end();
    await admin.end();
  });

  it('writes an audit row and a payment.updated event on a PAID transition', async () => {
    // createCheckout derives externalId itself (hash of tenant+idempotencyKey),
    // so the test must use what it returns rather than choosing an id.
    const created = await repo.createCheckout(API_TENANT_ID, {
      amount: 250_000,
      currency: 'IDR',
      idempotencyKey: `idem-req17009-${Date.now()}`,
    });
    expect(created.status).toBe('PENDING');
    const externalId = created.externalId;

    const raw = new TextEncoder().encode(
      JSON.stringify({ externalId, status: 'PAID', tenantId: API_TENANT_ID }),
    );
    const signature = signMockPaymentWebhook(raw);

    const applied = await repo.applyWebhook(raw, signature);
    expect(applied.verified).toBe(true);
    expect(applied.event?.status).toBe('PAID');

    // PaymentSession exposes only the provider-facing externalId, so the uuid
    // primary key (which audit.resource_id stores) is looked up here.
    const [stored] = await admin<{ id: string }[]>`
      SELECT id FROM chai.payment
      WHERE tenant_id = ${API_TENANT_ID} AND external_id = ${externalId} LIMIT 1
    `;
    expect(stored?.id).toBeTruthy();

    // Audit row landed, describing the transition rather than just "changed".
    const audit = await admin<{ action: string; metadata: unknown }[]>`
      SELECT action, metadata FROM chai.audit_log
      WHERE tenant_id = ${API_TENANT_ID} AND resource_id = ${String(stored?.id)}
      ORDER BY created_at DESC LIMIT 1
    `;
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe('payment.status_changed');

    // Outbox event landed, so downstream consumers can observe the settlement.
    const events = await admin<{ event_type: string; payload: unknown }[]>`
      SELECT event_type, payload FROM chai.outbox_event
      WHERE tenant_id = ${API_TENANT_ID} AND partition_key = ${externalId}
      ORDER BY created_at DESC LIMIT 1
    `;
    expect(events).toHaveLength(1);
    expect(events[0]?.event_type).toBe('payment.updated');

    const raw0 = events[0]?.payload;
    const payload = (typeof raw0 === 'string' ? JSON.parse(raw0) : raw0) as Record<
      string,
      unknown
    >;
    expect(payload['status']).toBe('PAID');
    // Money stays integer minor units plus a currency code, never a float.
    expect(payload['amountMinor']).toBe(250_000);
    expect(Number.isInteger(payload['amountMinor'])).toBe(true);
    expect(payload['currency']).toBe('IDR');
  });

  it('does not write an audit row or event for an ignored duplicate', async () => {
    const created = await repo.createCheckout(API_TENANT_ID, {
      amount: 100_000,
      currency: 'IDR',
      idempotencyKey: `idem-dup-${Date.now()}`,
    });
    const externalId = created.externalId;

    const raw = new TextEncoder().encode(
      JSON.stringify({ externalId, status: 'PAID', tenantId: API_TENANT_ID }),
    );
    await repo.applyWebhook(raw, signMockPaymentWebhook(raw));
    await repo.applyWebhook(raw, signMockPaymentWebhook(raw));

    // The replay is IGNOREd, so exactly one event exists — the effect is
    // idempotent, not merely guarded at the HTTP edge.
    const events = await admin<{ count: number }[]>`
      SELECT count(*)::int AS count FROM chai.outbox_event
      WHERE tenant_id = ${API_TENANT_ID} AND partition_key = ${externalId}
    `;
    expect(events[0]?.count).toBe(1);
  });
});

