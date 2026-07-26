import postgres from 'postgres';

/**
 * Stable UUIDv7 identifiers for the payment reconciliation suite. `workerUser`
 * is seeded as a `user_account` so the audit entry the worker writes satisfies
 * the `actor_id = current_principal_id` RLS check on `chai.audit_log`.
 */
export const PAYMENT_IDS = {
  paymentOne: '01890f47-9b3c-7cc2-98e8-1234567894b1',
  paymentTwo: '01890f47-9b3c-7cc2-98e8-1234567894b2',
  tenantA: '01890f47-9b3c-7cc2-98e8-1234567894a1',
  workerUser: '01890f47-9b3c-7cc2-98e8-1234567894a2',
} as const;

export interface SeedPaymentInput {
  amountCents?: number;
  currency?: string;
  externalId: string;
  id: string;
  status?: string;
  statusEventAt?: Date | null;
  tenantId?: string;
}

export async function seedFoundation(adminDatabaseUrl: string): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    await admin.begin(async (tx) => {
      await tx`
        INSERT INTO chai.tenant (id, slug, name)
        VALUES (${PAYMENT_IDS.tenantA}, 'worker-payment-tenant', 'Worker Payment Tenant')
        ON CONFLICT (id) DO NOTHING
      `;
      await tx`
        INSERT INTO chai.user_account (id, external_subject, display_name)
        VALUES (${PAYMENT_IDS.workerUser}, 'local|worker-payment-user', 'Worker Payment User')
        ON CONFLICT (id) DO NOTHING
      `;
    });
  } finally {
    await admin.end();
  }
}

export async function seedPayment(
  adminDatabaseUrl: string,
  input: SeedPaymentInput,
): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  const tenantId = input.tenantId ?? PAYMENT_IDS.tenantA;
  try {
    await admin`
      INSERT INTO chai.payment (
        id, tenant_id, external_id, amount_cents, currency, status,
        status_event_at, idempotency_key, checkout_url, expires_at, provider
      ) VALUES (
        ${input.id}, ${tenantId}, ${input.externalId},
        ${input.amountCents ?? 150_000}, ${input.currency ?? 'IDR'},
        ${input.status ?? 'PENDING'}, ${input.statusEventAt ?? null},
        ${input.externalId}, ${`https://pay.mock.local/checkout/${input.externalId}`},
        ${new Date(Date.now() + 30 * 60_000)}, 'mock-payment'
      )
    `;
  } finally {
    await admin.end();
  }
}

export async function fetchPayment(
  adminDatabaseUrl: string,
  externalId: string,
): Promise<{ status: string; statusEventAt: Date | null } | null> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    const rows = await admin<{ status: string; status_event_at: Date | null }[]>`
      SELECT status, status_event_at FROM chai.payment
      WHERE external_id = ${externalId}
    `;
    const row = rows[0];
    return row ? { status: row.status, statusEventAt: row.status_event_at } : null;
  } finally {
    await admin.end();
  }
}

export async function fetchOutboxEvents(
  adminDatabaseUrl: string,
  tenantId = PAYMENT_IDS.tenantA,
): Promise<
  Array<{
    aggregateId: string;
    aggregateType: string;
    eventType: string;
    payload: Record<string, unknown>;
  }>
> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    const rows = await admin<
      {
        aggregate_id: string;
        aggregate_type: string;
        event_type: string;
        payload: unknown;
      }[]
    >`
      SELECT aggregate_id, aggregate_type, event_type, payload
      FROM chai.outbox_event
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at
    `;
    return rows.map((row) => ({
      aggregateId: row.aggregate_id,
      aggregateType: row.aggregate_type,
      eventType: row.event_type,
      payload: asRecord(row.payload),
    }));
  } finally {
    await admin.end();
  }
}

/** Normalise a jsonb column to an object whether the driver parsed it or not. */
function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return JSON.parse(value) as Record<string, unknown>;
  return (value ?? {}) as Record<string, unknown>;
}

export async function fetchAuditEntries(
  adminDatabaseUrl: string,
  tenantId = PAYMENT_IDS.tenantA,
): Promise<
  Array<{ action: string; resourceId: string | null; resourceType: string }>
> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    const rows = await admin<
      { action: string; resource_id: string | null; resource_type: string }[]
    >`
      SELECT action, resource_id, resource_type
      FROM chai.audit_log
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at
    `;
    return rows.map((row) => ({
      action: row.action,
      resourceId: row.resource_id,
      resourceType: row.resource_type,
    }));
  } finally {
    await admin.end();
  }
}

export async function resetPaymentTables(
  adminDatabaseUrl: string,
  tenantId = PAYMENT_IDS.tenantA,
): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    await admin`DELETE FROM chai.outbox_event WHERE tenant_id = ${tenantId}`;
    await admin`DELETE FROM chai.audit_log WHERE tenant_id = ${tenantId}`;
    await admin`DELETE FROM chai.payment WHERE tenant_id = ${tenantId}`;
  } finally {
    await admin.end();
  }
}
