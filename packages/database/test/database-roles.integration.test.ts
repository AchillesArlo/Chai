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
    // The production connection path: LOGIN roles, not the admin/superuser.
    expect(inject('apiLoginDatabaseUrl')).toMatch(
      /^postgres(?:ql)?:\/\/chai_api:/,
    );
    expect(inject('workerLoginDatabaseUrl')).toMatch(
      /^postgres(?:ql)?:\/\/chai_worker:/,
    );
  });

  it('keeps every production role NOSUPERUSER and NOBYPASSRLS', async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      const roles = await admin<
        { rolbypassrls: boolean; rolname: string; rolsuper: boolean }[]
      >`
        SELECT rolname, rolsuper, rolbypassrls
        FROM pg_roles
        WHERE rolname IN (
          'chai_analytics_reader',
          'chai_api',
          'chai_app_runtime',
          'chai_migration_owner',
          'chai_worker',
          'chai_worker_runtime'
        )
        ORDER BY rolname
      `;

      // Every Chai role -- the group roles AND the LOGIN roles the runtime
      // actually connects on -- must be unable to bypass RLS AND must not be a
      // superuser. This is the C2 regression guard: if a future change points a
      // runtime connection back at a superuser/bypassrls role (the original
      // blocker), this assertion fails loudly.
      expect(roles).toEqual([
        {
          rolbypassrls: false,
          rolname: 'chai_analytics_reader',
          rolsuper: false,
        },
        { rolbypassrls: false, rolname: 'chai_api', rolsuper: false },
        { rolbypassrls: false, rolname: 'chai_app_runtime', rolsuper: false },
        {
          rolbypassrls: false,
          rolname: 'chai_migration_owner',
          rolsuper: false,
        },
        { rolbypassrls: false, rolname: 'chai_worker', rolsuper: false },
        {
          rolbypassrls: false,
          rolname: 'chai_worker_runtime',
          rolsuper: false,
        },
      ]);
    } finally {
      await admin.end();
    }
  });

  it('wires each runtime login role into its group role with inheritance', async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      // pg_auth_members.inherit_option (PG16+) proves the login role uses its
      // group's object GRANTs automatically, so no SET ROLE is needed in app
      // code. Role ATTRIBUTES are never inherited, so chai_api stays NOBYPASSRLS
      // regardless of the group definition (asserted above).
      const memberships = await admin<
        { group_role: string; inherit_option: boolean; member: string }[]
      >`
        SELECT
          member_role.rolname AS member,
          group_role.rolname AS group_role,
          pg_auth_members.inherit_option
        FROM pg_auth_members
        JOIN pg_roles AS member_role
          ON member_role.oid = pg_auth_members.member
        JOIN pg_roles AS group_role
          ON group_role.oid = pg_auth_members.roleid
        WHERE member_role.rolname IN ('chai_api', 'chai_worker')
        ORDER BY member_role.rolname
      `;

      expect(memberships).toEqual([
        {
          group_role: 'chai_app_runtime',
          inherit_option: true,
          member: 'chai_api',
        },
        {
          group_role: 'chai_worker_runtime',
          inherit_option: true,
          member: 'chai_worker',
        },
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
