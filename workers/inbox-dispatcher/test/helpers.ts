import postgres from 'postgres';

export const WORKER_IDS = {
  tenantA: '01890f47-9b3c-7cc2-98e8-123456789307',
  userA: '01890f47-9b3c-7cc2-98e8-123456789309',
  providerAccountA: '01890f47-9b3c-7cc2-98e8-12345678930a',
  inboxOne: '01890f47-9b3c-7cc2-98e8-123456789311',
  inboxTwo: '01890f47-9b3c-7cc2-98e8-123456789312',
} as const;

const PAYLOAD_HASH = `sha256:${'b'.repeat(64)}`;

export async function seedTenantRoster(adminDatabaseUrl: string): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    await admin.begin(async (transaction) => {
      await transaction`
        INSERT INTO chai.tenant (id, slug, name)
        VALUES (${WORKER_IDS.tenantA}, 'worker-tenant-a', 'Worker Tenant A')
        ON CONFLICT (id) DO NOTHING
      `;
      await transaction`
        INSERT INTO chai.user_account (id, external_subject, display_name)
        VALUES (${WORKER_IDS.userA}, 'local|worker-user-a', 'Worker User A')
        ON CONFLICT (id) DO NOTHING
      `;
    });
  } finally {
    await admin.end();
  }
}

export async function seedInboxEvent(
  adminDatabaseUrl: string,
  id: string,
  externalEventId: string,
): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    await admin`
      INSERT INTO chai.inbox_event (
        id, tenant_id, provider, provider_account_id, external_event_id,
        schema_version, payload_reference, payload_hash
      )
      VALUES (
        ${id}, ${WORKER_IDS.tenantA}, 'mock-channel',
        ${WORKER_IDS.providerAccountA}, ${externalEventId},
        1, ${'restricted://' + externalEventId}, ${PAYLOAD_HASH}
      )
      ON CONFLICT (tenant_id, provider, provider_account_id, external_event_id)
      DO NOTHING
    `;
  } finally {
    await admin.end();
  }
}

export async function fetchInboxStatuses(
  adminDatabaseUrl: string,
): Promise<Array<{ id: string; status: string; attempts: number }>> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    return await admin`
      SELECT id, status, attempts
      FROM chai.inbox_event
      WHERE tenant_id = ${WORKER_IDS.tenantA}
      ORDER BY created_at
    `;
  } finally {
    await admin.end();
  }
}

export async function clearInbox(adminDatabaseUrl: string): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    await admin`DELETE FROM chai.inbox_event WHERE tenant_id = ${WORKER_IDS.tenantA}`;
  } finally {
    await admin.end();
  }
}
