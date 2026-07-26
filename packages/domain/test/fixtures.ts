import postgres from 'postgres';

export const DOMAIN_IDS = {
  membershipA: '01890f47-9b3c-7cc2-98e8-123456789301',
  membershipB: '01890f47-9b3c-7cc2-98e8-123456789302',
  membershipC: '01890f47-9b3c-7cc2-98e8-123456789303',
  providerAccountA: '01890f47-9b3c-7cc2-98e8-12345678920a',
  tenantA: '01890f47-9b3c-7cc2-98e8-123456789207',
  tenantB: '01890f47-9b3c-7cc2-98e8-123456789208',
  userA: '01890f47-9b3c-7cc2-98e8-123456789209',
  userB: '01890f47-9b3c-7cc2-98e8-12345678930b',
  userC: '01890f47-9b3c-7cc2-98e8-12345678930c',
} as const;

export const PAYLOAD_HASH = `sha256:${'a'.repeat(64)}`;

export async function seedFoundation(adminDatabaseUrl: string): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    await admin.begin(async (transaction) => {
      await transaction`
        INSERT INTO chai.tenant (id, slug, name)
        VALUES
          (${DOMAIN_IDS.tenantA}, 'domain-tenant-a', 'Domain Tenant A'),
          (${DOMAIN_IDS.tenantB}, 'domain-tenant-b', 'Domain Tenant B')
        ON CONFLICT (id) DO NOTHING
      `;
      await transaction`
        INSERT INTO chai.user_account (id, external_subject, display_name)
        VALUES (${DOMAIN_IDS.userA}, 'local|domain-user-a', 'Domain User A')
        ON CONFLICT (id) DO NOTHING
      `;
    });
  } finally {
    await admin.end();
  }
}

export async function resetDispatcherTables(adminDatabaseUrl: string): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    await admin`DELETE FROM chai.inbox_event`;
    await admin`DELETE FROM chai.outbox_event`;
  } finally {
    await admin.end();
  }
}

export async function adminConnection(adminDatabaseUrl: string) {
  return postgres(adminDatabaseUrl, { max: 2 });
}

export async function seedIamRoster(adminDatabaseUrl: string): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    await admin.begin(async (transaction) => {
      await transaction`
        INSERT INTO chai.user_account (id, external_subject, display_name)
        VALUES
          (${DOMAIN_IDS.userB}, 'local|domain-user-b', 'Domain User B'),
          (${DOMAIN_IDS.userC}, 'local|domain-user-c', 'Domain User C')
        ON CONFLICT (id) DO NOTHING
      `;
      await transaction`
        INSERT INTO chai.membership (id, tenant_id, user_id, role, status)
        VALUES
          (${DOMAIN_IDS.membershipA}, ${DOMAIN_IDS.tenantA}, ${DOMAIN_IDS.userA}, 'CLIENT_OWNER', 'ACTIVE'),
          (${DOMAIN_IDS.membershipB}, ${DOMAIN_IDS.tenantA}, ${DOMAIN_IDS.userB}, 'CLIENT_AGENT', 'INVITED'),
          (${DOMAIN_IDS.membershipC}, ${DOMAIN_IDS.tenantB}, ${DOMAIN_IDS.userC}, 'CLIENT_OWNER', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING
      `;
    });
  } finally {
    await admin.end();
  }
}

export async function resetIamTables(adminDatabaseUrl: string): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    await admin`
      DELETE FROM chai.membership
      WHERE id IN (${DOMAIN_IDS.membershipA}, ${DOMAIN_IDS.membershipB}, ${DOMAIN_IDS.membershipC})
    `;
  } finally {
    await admin.end();
  }
}

export async function resetConversationTables(
  adminDatabaseUrl: string,
): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    await admin`DELETE FROM chai.message`;
    await admin`DELETE FROM chai.appointment`;
    await admin`DELETE FROM chai.lead`;
    await admin`DELETE FROM chai.conversation`;
    await admin`DELETE FROM chai.contact_identity`;
    await admin`DELETE FROM chai.contact`;
  } finally {
    await admin.end();
  }
}

export interface SeededContact {
  externalUser: string;
  id: string;
}

const CONTACT_ID_A = '01890f47-9b3c-7cc2-98e8-1234567893a1';

export async function seedContact(
  adminDatabaseUrl: string,
  externalUser: string,
): Promise<string> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    await admin`
      INSERT INTO chai.contact (id, tenant_id, display_name)
      VALUES (${CONTACT_ID_A}, ${DOMAIN_IDS.tenantA}, ${externalUser})
      ON CONFLICT (id) DO NOTHING
    `;
    return CONTACT_ID_A;
  } finally {
    await admin.end();
  }
}

export const LEAD_ID_A = '01890f47-9b3c-7cc2-98e8-1234567893b1';
export const LEAD_ID_B = '01890f47-9b3c-7cc2-98e8-1234567893b2';

export async function seedLead(
  adminDatabaseUrl: string,
  leadId: string,
  contactId: string,
  tenantId: string = DOMAIN_IDS.tenantA,
): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    await admin`
      INSERT INTO chai.lead (id, tenant_id, contact_id, source, stage)
      VALUES (${leadId}, ${tenantId}, ${contactId}, 'mock-channel', 'NEW')
      ON CONFLICT (id) DO NOTHING
    `;
  } finally {
    await admin.end();
  }
}

export interface SeededInboxEvent {
  id: string;
  tenantId: string;
  externalEventId: string;
  provider?: string;
  providerAccountId?: string;
  schemaVersion?: number;
  status?: string;
  attempts?: number;
  availableAt?: Date;
  leaseUntil?: Date | null;
}

export async function seedInboxEvent(
  adminDatabaseUrl: string,
  event: SeededInboxEvent,
): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    await admin`
      INSERT INTO chai.inbox_event (
        id,
        tenant_id,
        provider,
        provider_account_id,
        external_event_id,
        schema_version,
        payload_reference,
        payload_hash,
        status,
        attempts,
        available_at,
        lease_until
      )
      VALUES (
        ${event.id},
        ${event.tenantId},
        ${event.provider ?? 'mock-channel'},
        ${event.providerAccountId ?? DOMAIN_IDS.providerAccountA},
        ${event.externalEventId},
        ${event.schemaVersion ?? 1},
        ${'restricted://' + event.externalEventId},
        ${PAYLOAD_HASH},
        ${event.status ?? 'PENDING'},
        ${event.attempts ?? 0},
        ${event.availableAt ?? new Date()},
        ${event.leaseUntil ?? null}
      )
      ON CONFLICT (tenant_id, provider, provider_account_id, external_event_id)
      DO NOTHING
    `;
  } finally {
    await admin.end();
  }
}

export interface SeededOutboxEvent {
  id: string;
  tenantId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion?: number;
  partitionKey?: string;
  payload?: Record<string, unknown>;
  schemaVersion?: number;
  status?: string;
  attempts?: number;
  availableAt?: Date;
  leaseUntil?: Date | null;
}

export async function seedOutboxEvent(
  adminDatabaseUrl: string,
  event: SeededOutboxEvent,
): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    await admin`
      INSERT INTO chai.outbox_event (
        id,
        tenant_id,
        event_type,
        schema_version,
        aggregate_type,
        aggregate_id,
        aggregate_version,
        partition_key,
        payload,
        status,
        attempts,
        available_at,
        lease_until
      )
      VALUES (
        ${event.id},
        ${event.tenantId},
        ${event.eventType},
        ${event.schemaVersion ?? 1},
        ${event.aggregateType},
        ${event.aggregateId},
        ${event.aggregateVersion ?? 1},
        ${event.partitionKey ?? event.aggregateId},
        ${JSON.stringify(event.payload ?? { })},
        ${event.status ?? 'PENDING'},
        ${event.attempts ?? 0},
        ${event.availableAt ?? new Date()},
        ${event.leaseUntil ?? null}
      )
    `;
  } finally {
    await admin.end();
  }
}

export interface InboxStatus {
  attempts: number;
  leaseUntil: Date | null;
  processedAt: Date | null;
  status: string;
}

export async function fetchInboxStatus(
  adminDatabaseUrl: string,
  id: string,
): Promise<InboxStatus> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    const rows = await admin<InboxStatus[]>`
      SELECT
        status,
        attempts,
        lease_until AS "leaseUntil",
        processed_at AS "processedAt"
      FROM chai.inbox_event
      WHERE id = ${id}
    `;
    const row = rows[0];
    if (!row) throw new Error(`inbox event ${id} not found`);

    return row;
  } finally {
    await admin.end();
  }
}

export interface OutboxStatus {
  attempts: number;
  leaseUntil: Date | null;
  publishedAt: Date | null;
  status: string;
}

export async function fetchOutboxStatus(
  adminDatabaseUrl: string,
  id: string,
): Promise<OutboxStatus> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    const rows = await admin<OutboxStatus[]>`
      SELECT
        status,
        attempts,
        lease_until AS "leaseUntil",
        published_at AS "publishedAt"
      FROM chai.outbox_event
      WHERE id = ${id}
    `;
    const row = rows[0];
    if (!row) throw new Error(`outbox event ${id} not found`);

    return row;
  } finally {
    await admin.end();
  }
}
