import postgres from 'postgres';

export const DATABASE_IDS = {
  idempotencyA: '01890f47-9b3c-7cc2-98e8-123456789101',
  idempotencyB: '01890f47-9b3c-7cc2-98e8-123456789102',
  idempotencyCrossTenant: '01890f47-9b3c-7cc2-98e8-12345678910d',
  membershipA: '01890f47-9b3c-7cc2-98e8-123456789103',
  membershipB: '01890f47-9b3c-7cc2-98e8-123456789104',
  operationA: '01890f47-9b3c-7cc2-98e8-123456789105',
  operationB: '01890f47-9b3c-7cc2-98e8-123456789106',
  tenantA: '01890f47-9b3c-7cc2-98e8-123456789107',
  tenantB: '01890f47-9b3c-7cc2-98e8-123456789108',
  userA: '01890f47-9b3c-7cc2-98e8-123456789109',
  userB: '01890f47-9b3c-7cc2-98e8-12345678910a',
} as const;

export async function seedFoundation(adminDatabaseUrl: string): Promise<void> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });

  try {
    await admin.begin(async (transaction) => {
      await transaction`
        INSERT INTO chai.tenant (id, slug, name)
        VALUES
          (${DATABASE_IDS.tenantA}, 'tenant-a', 'Tenant A'),
          (${DATABASE_IDS.tenantB}, 'tenant-b', 'Tenant B')
        ON CONFLICT (id) DO NOTHING
      `;
      await transaction`
        INSERT INTO chai.user_account (id, external_subject, display_name)
        VALUES
          (${DATABASE_IDS.userA}, 'local|user-a', 'User A'),
          (${DATABASE_IDS.userB}, 'local|user-b', 'User B')
        ON CONFLICT (id) DO NOTHING
      `;
      await transaction`
        INSERT INTO chai.membership (id, tenant_id, user_id, role)
        VALUES
          (${DATABASE_IDS.membershipA}, ${DATABASE_IDS.tenantA}, ${DATABASE_IDS.userA}, 'CLIENT_OWNER'),
          (${DATABASE_IDS.membershipB}, ${DATABASE_IDS.tenantB}, ${DATABASE_IDS.userB}, 'CLIENT_OWNER')
        ON CONFLICT (id) DO NOTHING
      `;
      await transaction`
        INSERT INTO chai.operation_execution (
          id,
          tenant_id,
          operation_type,
          status
        )
        VALUES
          (${DATABASE_IDS.operationA}, ${DATABASE_IDS.tenantA}, 'conversation.take_over', 'PROCESSING'),
          (${DATABASE_IDS.operationB}, ${DATABASE_IDS.tenantB}, 'conversation.take_over', 'PROCESSING')
        ON CONFLICT (id) DO NOTHING
      `;
    });
  } finally {
    await admin.end();
  }
}
