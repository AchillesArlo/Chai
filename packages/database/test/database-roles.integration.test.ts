import postgres from 'postgres';
import { beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';

import { createDatabase, withTenantTransaction } from '../src';
import { DATABASE_IDS, seedFoundation } from './fixtures';

const INBOX_IDS = {
  tenantA: '01890f47-9b3c-7cc2-98e8-123456789112',
  tenantB: '01890f47-9b3c-7cc2-98e8-123456789113',
} as const;

describe('database role harness', () => {
  beforeAll(async () => {
    await seedFoundation(inject('adminDatabaseUrl'));
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

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
          payload_hash
        )
        VALUES
          (
            ${INBOX_IDS.tenantA},
            ${DATABASE_IDS.tenantA},
            'mock-channel',
            ${DATABASE_IDS.tenantA},
            'role-test-a',
            1,
            'restricted://role-test-a',
            ${`sha256:${'a'.repeat(64)}`}
          ),
          (
            ${INBOX_IDS.tenantB},
            ${DATABASE_IDS.tenantB},
            'mock-channel',
            ${DATABASE_IDS.tenantB},
            'role-test-b',
            1,
            'restricted://role-test-b',
            ${`sha256:${'b'.repeat(64)}`}
          )
        ON CONFLICT (id) DO NOTHING
      `;
    } finally {
      await admin.end();
    }
  });

  it('provides connections for every production database role', () => {
    expect(inject('migrationOwnerDatabaseUrl')).toMatch(
      /^postgres(?:ql)?:\/\/chai_migration_owner:/,
    );
    expect(inject('runtimeDatabaseUrl')).toMatch(
      /^postgres(?:ql)?:\/\/chai_app_runtime:/,
    );
    expect(inject('workerDatabaseUrl')).toMatch(
      /^postgres(?:ql)?:\/\/chai_worker_runtime:/,
    );
    expect(inject('analyticsDatabaseUrl')).toMatch(
      /^postgres(?:ql)?:\/\/chai_analytics_reader:/,
    );
  });

  it('keeps every production role unable to bypass RLS', async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      const roles = await admin<{ rolbypassrls: boolean; rolname: string }[]>`
        SELECT rolname, rolbypassrls
        FROM pg_roles
        WHERE rolname IN (
          'chai_migration_owner',
          'chai_app_runtime',
          'chai_worker_runtime',
          'chai_analytics_reader'
        )
        ORDER BY rolname
      `;

      expect(roles).toEqual([
        { rolbypassrls: false, rolname: 'chai_analytics_reader' },
        { rolbypassrls: false, rolname: 'chai_app_runtime' },
        { rolbypassrls: false, rolname: 'chai_migration_owner' },
        { rolbypassrls: false, rolname: 'chai_worker_runtime' },
      ]);
    } finally {
      await admin.end();
    }
  });

  it('keeps migrated tables owned by the migration role', async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      const owners = await admin<{ owner: string }[]>`
        SELECT DISTINCT pg_get_userbyid(class.relowner) AS owner
        FROM pg_class AS class
        JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
        WHERE namespace.nspname = 'chai'
          AND class.relkind = 'r'
      `;

      expect(owners).toEqual([{ owner: 'chai_migration_owner' }]);
    } finally {
      await admin.end();
    }
  });

  it('applies tenant RLS to worker reads', async () => {
    const worker = createDatabase(inject('workerDatabaseUrl'));

    try {
      const withoutContext = await worker<{ tenant_id: string }[]>`
        SELECT tenant_id
        FROM chai.inbox_event
        WHERE external_event_id LIKE 'role-test-%'
      `;
      const withContext = await withTenantTransaction(
        worker,
        {
          principalId: DATABASE_IDS.userA,
          tenantId: DATABASE_IDS.tenantA,
        },
        (transaction) => transaction<{ tenant_id: string }[]>`
          SELECT tenant_id
          FROM chai.inbox_event
          WHERE external_event_id LIKE 'role-test-%'
        `,
      );

      expect(withoutContext).toEqual([]);
      expect(withContext).toEqual([{ tenant_id: DATABASE_IDS.tenantA }]);
    } finally {
      await worker.end();
    }
  });

  it('applies forced RLS to the migration owner', async () => {
    const migrationOwner = createDatabase(inject('migrationOwnerDatabaseUrl'));

    try {
      const withoutContext = await migrationOwner<{ tenant_id: string }[]>`
        SELECT tenant_id
        FROM chai.membership
      `;
      const withContext = await withTenantTransaction(
        migrationOwner,
        {
          principalId: DATABASE_IDS.userA,
          tenantId: DATABASE_IDS.tenantA,
        },
        (transaction) => transaction<{ tenant_id: string }[]>`
          SELECT tenant_id
          FROM chai.membership
        `,
      );

      expect(withoutContext).toEqual([]);
      expect(withContext).toEqual([{ tenant_id: DATABASE_IDS.tenantA }]);
    } finally {
      await migrationOwner.end();
    }
  });

  it('keeps analytics access fail-closed until curated views exist', async () => {
    const analytics = createDatabase(inject('analyticsDatabaseUrl'));

    try {
      await expect(
        analytics`
          SELECT tenant_id
          FROM chai.audit_log
        `,
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await analytics.end();
    }
  });
});
