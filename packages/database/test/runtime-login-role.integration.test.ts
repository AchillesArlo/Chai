import postgres from 'postgres';
import { beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase, withTenantTransaction } from '../src';
import { DATABASE_IDS, seedFoundation } from './fixtures';

/**
 * C2 tenant-isolation blocker regression (migration 0051).
 *
 * BEFORE: the RLS suite only ever connected as the NOLOGIN group roles that
 * global setup flips to LOGIN. Production could not use those, so it fell back
 * to POSTGRES_USER (default chai_admin) -- the bootstrap SUPERUSER, which
 * bypasses RLS. Tenant isolation was therefore OFF on the ONLY connection path
 * production used, while the green suite validated a path production never took.
 *
 * NOW: migration 0051 adds the LOGIN roles chai_api / chai_worker, members of
 * chai_app_runtime / chai_worker_runtime. Compose points the runtime
 * DATABASE_URL at them. These tests exercise that exact path and prove:
 *   (a) the runtime role is NOT a superuser and CANNOT bypass RLS;
 *   (b) a query with no tenant context returns no tenant rows (default-deny);
 *   (c) a query under tenant A never sees tenant B;
 * plus a direct contrast showing the admin superuser DOES leak where the login
 * role does not -- i.e. the fix is load-bearing.
 */

// Distinct from database-roles.integration.test's INBOX_IDS: every integration
// file in this package shares one container/database (globalSetup, no file
// parallelism), so ids and the external_event_id prefix must not collide.
const INBOX_IDS = {
  tenantA: '01890f47-9b3c-7cc2-98e8-1234567891a1',
  tenantB: '01890f47-9b3c-7cc2-98e8-1234567891a2',
} as const;

const EVENT_PREFIX = 'login-role-';

describe('runtime login-role production connection path (0051)', () => {
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
            ${`${EVENT_PREFIX}a`},
            1,
            'restricted://login-role-a',
            ${`sha256:${'e'.repeat(64)}`}
          ),
          (
            ${INBOX_IDS.tenantB},
            ${DATABASE_IDS.tenantB},
            'mock-channel',
            ${DATABASE_IDS.tenantB},
            ${`${EVENT_PREFIX}b`},
            1,
            'restricted://login-role-b',
            ${`sha256:${'f'.repeat(64)}`}
          )
        ON CONFLICT (id) DO NOTHING
      `;
    } finally {
      await admin.end();
    }
  });

  it('connects the api as a distinct, non-superuser, NOBYPASSRLS role', async () => {
    const api = createDatabase(inject('apiLoginDatabaseUrl'));

    try {
      const [identity] = await api<
        { can_bypass_rls: boolean; is_superuser: boolean; role_name: string }[]
      >`
        SELECT
          rolname AS role_name,
          rolsuper AS is_superuser,
          rolbypassrls AS can_bypass_rls
        FROM pg_roles
        WHERE rolname = current_user
      `;

      expect(identity).toEqual({
        can_bypass_rls: false,
        is_superuser: false,
        role_name: 'chai_api',
      });
    } finally {
      await api.end();
    }
  });

  it('connects the worker as a distinct, non-superuser, NOBYPASSRLS role', async () => {
    const worker = createDatabase(inject('workerLoginDatabaseUrl'));

    try {
      const [identity] = await worker<
        { can_bypass_rls: boolean; is_superuser: boolean; role_name: string }[]
      >`
        SELECT
          rolname AS role_name,
          rolsuper AS is_superuser,
          rolbypassrls AS can_bypass_rls
        FROM pg_roles
        WHERE rolname = current_user
      `;

      expect(identity).toEqual({
        can_bypass_rls: false,
        is_superuser: false,
        role_name: 'chai_worker',
      });
    } finally {
      await worker.end();
    }
  });

  it('enforces RLS for the api login role: default-deny, then tenant-scoped', async () => {
    const api = createDatabase(inject('apiLoginDatabaseUrl'));

    try {
      // (b) No tenant context -> no rows, even though two tenants' rows exist.
      const withoutContext = await api<{ tenant_id: string }[]>`
        SELECT tenant_id
        FROM chai.inbox_event
        WHERE external_event_id LIKE ${`${EVENT_PREFIX}%`}
      `;
      expect(withoutContext).toEqual([]);

      // (c) Under tenant A, only tenant A -- tenant B is never visible.
      const tenantAView = await withTenantTransaction(
        api,
        { principalId: DATABASE_IDS.userA, tenantId: DATABASE_IDS.tenantA },
        (tx) => tx<{ tenant_id: string }[]>`
          SELECT tenant_id
          FROM chai.inbox_event
          WHERE external_event_id LIKE ${`${EVENT_PREFIX}%`}
        `,
      );
      expect(tenantAView).toEqual([{ tenant_id: DATABASE_IDS.tenantA }]);
      expect(tenantAView.map((row) => row.tenant_id)).not.toContain(
        DATABASE_IDS.tenantB,
      );

      // The api login role inherits chai_app_runtime's grants, so it may read
      // chai.membership -- still tenant-scoped by RLS.
      const membershipUnderA = await withTenantTransaction(
        api,
        { principalId: DATABASE_IDS.userA, tenantId: DATABASE_IDS.tenantA },
        (tx) => tx<{ tenant_id: string }[]>`
          SELECT tenant_id
          FROM chai.membership
        `,
      );
      expect(membershipUnderA).toEqual([{ tenant_id: DATABASE_IDS.tenantA }]);
    } finally {
      await api.end();
    }
  });

  it('enforces RLS for the worker login role and preserves its narrower grants', async () => {
    const worker = createDatabase(inject('workerLoginDatabaseUrl'));

    try {
      const withoutContext = await worker<{ tenant_id: string }[]>`
        SELECT tenant_id
        FROM chai.inbox_event
        WHERE external_event_id LIKE ${`${EVENT_PREFIX}%`}
      `;
      expect(withoutContext).toEqual([]);

      const tenantBView = await withTenantTransaction(
        worker,
        { principalId: DATABASE_IDS.userB, tenantId: DATABASE_IDS.tenantB },
        (tx) => tx<{ tenant_id: string }[]>`
          SELECT tenant_id
          FROM chai.inbox_event
          WHERE external_event_id LIKE ${`${EVENT_PREFIX}%`}
        `,
      );
      expect(tenantBView).toEqual([{ tenant_id: DATABASE_IDS.tenantB }]);
      expect(tenantBView.map((row) => row.tenant_id)).not.toContain(
        DATABASE_IDS.tenantA,
      );

      // Least privilege is preserved through the login role: chai_worker inherits
      // only chai_worker_runtime's grants, which do NOT include chai.membership.
      await expect(
        worker`
          SELECT tenant_id
          FROM chai.membership
        `,
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await worker.end();
    }
  });

  it('is load-bearing: the admin superuser bypasses RLS where the login role does not', async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });
    const api = createDatabase(inject('apiLoginDatabaseUrl'));

    try {
      // The path production USED to take (superuser): RLS bypassed, both tenants'
      // rows returned with NO tenant context. This is the blocker, reproduced.
      const adminRows = await admin<{ tenant_id: string }[]>`
        SELECT tenant_id
        FROM chai.inbox_event
        WHERE external_event_id LIKE ${`${EVENT_PREFIX}%`}
        ORDER BY external_event_id
      `;
      expect(adminRows).toEqual([
        { tenant_id: DATABASE_IDS.tenantA },
        { tenant_id: DATABASE_IDS.tenantB },
      ]);

      // The path production takes NOW (login role): RLS enforced, default-deny.
      const apiRows = await api<{ tenant_id: string }[]>`
        SELECT tenant_id
        FROM chai.inbox_event
        WHERE external_event_id LIKE ${`${EVENT_PREFIX}%`}
      `;
      expect(apiRows).toEqual([]);
    } finally {
      await admin.end();
      await api.end();
    }
  });
});
