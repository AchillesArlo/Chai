import postgres from 'postgres';

export const WORKER_IDS = {
  aggregate: '01890f47-9b3c-7cc2-98e8-123456789344',
  tenantA: '01890f47-9b3c-7cc2-98e8-123456789317',
  userA: '01890f47-9b3c-7cc2-98e8-123456789319',
  outboxOne: '01890f47-9b3c-7cc2-98e8-123456789321',
  outboxTwo: '01890f47-9b3c-7cc2-98e8-123456789322',
} as const;

export async function seedTenantRoster(adminDatabaseUrl: string): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    await admin.begin(async (transaction) => {
      await transaction`
        INSERT INTO chai.tenant (id, slug, name)
        VALUES (${WORKER_IDS.tenantA}, 'worker-outbox-tenant', 'Worker Outbox Tenant')
        ON CONFLICT (id) DO NOTHING
      `;
      await transaction`
        INSERT INTO chai.user_account (id, external_subject, display_name)
        VALUES (${WORKER_IDS.userA}, 'local|worker-outbox-user', 'Worker Outbox User')
        ON CONFLICT (id) DO NOTHING
      `;
    });
  } finally {
    await admin.end();
  }
}

export async function seedOutboxEvent(
  adminDatabaseUrl: string,
  id: string,
  eventType: string,
): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    await admin`
      INSERT INTO chai.outbox_event (
        id, tenant_id, event_type, schema_version,
        aggregate_type, aggregate_id, aggregate_version, partition_key, payload
      )
      VALUES (
        ${id}, ${WORKER_IDS.tenantA}, ${eventType}, 1,
        'message', ${WORKER_IDS.aggregate}, 1, ${WORKER_IDS.aggregate},
        ${admin.json({ id, eventType })}::jsonb
      )
    `;
  } finally {
    await admin.end();
  }
}

export async function fetchOutboxStatuses(
  adminDatabaseUrl: string,
): Promise<Array<{ id: string; status: string; attempts: number }>> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    return await admin`
      SELECT id, status, attempts
      FROM chai.outbox_event
      WHERE tenant_id = ${WORKER_IDS.tenantA}
      ORDER BY created_at
    `;
  } finally {
    await admin.end();
  }
}

export async function clearOutbox(adminDatabaseUrl: string): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    await admin`DELETE FROM chai.outbox_event WHERE tenant_id = ${WORKER_IDS.tenantA}`;
  } finally {
    await admin.end();
  }
}
