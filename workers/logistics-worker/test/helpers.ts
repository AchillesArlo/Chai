import postgres from 'postgres';

/**
 * Stable UUIDv7 identifiers for the logistics reconciliation suite. `workerUser`
 * is seeded as a `user_account` so the audit entry the worker writes satisfies
 * the `audit_log.actor_id` foreign key and the `actor_id = current_principal_id`
 * RLS check.
 */
export const LOGISTICS_IDS = {
  shipmentDedup: '01890f47-9b3c-7cc2-98e8-1234567895b3',
  shipmentFresh: '01890f47-9b3c-7cc2-98e8-1234567895b2',
  shipmentStale: '01890f47-9b3c-7cc2-98e8-1234567895b1',
  shipmentUnknown: '01890f47-9b3c-7cc2-98e8-1234567895b4',
  tenantA: '01890f47-9b3c-7cc2-98e8-1234567895a1',
  workerUser: '01890f47-9b3c-7cc2-98e8-1234567895a2',
} as const;

export interface StoredEvent {
  at: string;
  code: string;
  description: string;
  eventId: string;
}

export interface SeedShipmentInput {
  carrier?: string;
  events?: StoredEvent[];
  id: string;
  lastSyncedAt: Date;
  status?: string;
  tenantId?: string;
  trackingNumber: string;
}

export async function seedFoundation(adminDatabaseUrl: string): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    await admin.begin(async (tx) => {
      await tx`
        INSERT INTO chai.tenant (id, slug, name)
        VALUES (${LOGISTICS_IDS.tenantA}, 'worker-logistics-tenant', 'Worker Logistics Tenant')
        ON CONFLICT (id) DO NOTHING
      `;
      await tx`
        INSERT INTO chai.user_account (id, external_subject, display_name)
        VALUES (${LOGISTICS_IDS.workerUser}, 'local|worker-logistics-user', 'Worker Logistics User')
        ON CONFLICT (id) DO NOTHING
      `;
    });
  } finally {
    await admin.end();
  }
}

export async function seedShipment(
  adminDatabaseUrl: string,
  input: SeedShipmentInput,
): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  const tenantId = input.tenantId ?? LOGISTICS_IDS.tenantA;
  try {
    await admin`
      INSERT INTO chai.shipment (
        id, tenant_id, carrier, tracking_number, status, events, last_synced_at
      ) VALUES (
        ${input.id}, ${tenantId}, ${input.carrier ?? 'jne'}, ${input.trackingNumber},
        ${input.status ?? 'IN_TRANSIT'}, ${JSON.stringify(input.events ?? [])}::jsonb,
        ${input.lastSyncedAt}
      )
    `;
  } finally {
    await admin.end();
  }
}

export async function fetchShipment(
  adminDatabaseUrl: string,
  trackingNumber: string,
): Promise<{ events: StoredEvent[]; lastSyncedAt: Date; status: string } | null> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    const rows = await admin<
      { events: unknown; last_synced_at: Date; status: string }[]
    >`
      SELECT status, events, last_synced_at FROM chai.shipment
      WHERE tracking_number = ${trackingNumber}
    `;
    const row = rows[0];
    return row
      ? { events: asEvents(row.events), lastSyncedAt: row.last_synced_at, status: row.status }
      : null;
  } finally {
    await admin.end();
  }
}

/** Normalise a jsonb array column whether the driver parsed it or not. */
function asEvents(value: unknown): StoredEvent[] {
  if (typeof value === 'string') return JSON.parse(value) as StoredEvent[];
  return (value ?? []) as StoredEvent[];
}

export async function fetchOutboxEvents(
  adminDatabaseUrl: string,
  tenantId = LOGISTICS_IDS.tenantA,
): Promise<
  Array<{
    aggregateType: string;
    eventType: string;
    payload: Record<string, unknown>;
  }>
> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    const rows = await admin<
      {
        aggregate_type: string;
        event_type: string;
        payload: unknown;
      }[]
    >`
      SELECT aggregate_type, event_type, payload
      FROM chai.outbox_event
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at
    `;
    return rows.map((row) => ({
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
  tenantId = LOGISTICS_IDS.tenantA,
): Promise<Array<{ action: string; resourceType: string }>> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    const rows = await admin<{ action: string; resource_type: string }[]>`
      SELECT action, resource_type
      FROM chai.audit_log
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at
    `;
    return rows.map((row) => ({ action: row.action, resourceType: row.resource_type }));
  } finally {
    await admin.end();
  }
}

export async function resetLogisticsTables(
  adminDatabaseUrl: string,
  tenantId = LOGISTICS_IDS.tenantA,
): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    await admin`DELETE FROM chai.outbox_event WHERE tenant_id = ${tenantId}`;
    await admin`DELETE FROM chai.audit_log WHERE tenant_id = ${tenantId}`;
    await admin`DELETE FROM chai.shipment WHERE tenant_id = ${tenantId}`;
  } finally {
    await admin.end();
  }
}
