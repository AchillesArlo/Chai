import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import postgres from 'postgres';
import { beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';

import { DATABASE_IDS, seedFoundation } from './fixtures';

/**
 * Regression guard for migration 0082.
 *
 * Migrations 0071-0081 tried to repair double-encoded jsonb with a bare
 * `UPDATE ... SET col = (col #>> '{}')::jsonb` after `SET ROLE
 * chai_migration_owner`. Every one was a SILENT no-op on real data: the target
 * tables are RLS `FORCE`, so with no tenant context the policy matched zero rows
 * and nothing was raised. `chai.audit_entry` was blocked a second time by its
 * append-only BEFORE UPDATE trigger.
 *
 * Integration suites never caught it because a fresh container is EMPTY -- the
 * UPDATE legitimately matched nothing. This test therefore does what emptiness
 * cannot: it POPULATES a double-encoded row first, then replays 0082 and proves
 * the row actually changed shape.
 */
const MIGRATION = join(
  import.meta.dirname,
  '../migrations/0082_jsonb_repair_effective.sql',
);

describe('migration 0082 repairs double-encoded jsonb on populated tables', () => {
  let adminUrl: string;

  beforeAll(async () => {
    adminUrl = inject('adminDatabaseUrl');
    await seedFoundation(adminUrl);
  });

  it('turns a jsonb scalar string back into an object, including on the append-only audit table', async () => {
    const admin = postgres(adminUrl, { max: 1, onnotice: () => undefined });
    const jobId = '01890f47-9b3c-7cc2-98e8-1234567890a1';
    const auditId = '01890f47-9b3c-7cc2-98e8-1234567890a2';

    try {
      // Reproduce exactly what the old buggy writers stored: JSON.stringify fed
      // into a jsonb parameter, which postgres-js encodes a second time.
      await admin`
        INSERT INTO chai.follow_up_job (id, tenant_id, due_at, payload)
        VALUES (${jobId}, ${DATABASE_IDS.tenantA}, now() + interval '1 hour',
                ${JSON.stringify({ paymentExternalId: 'pay_regression' })}::jsonb)
      `;
      await admin`
        INSERT INTO chai.audit_entry
          (id, tenant_id, event_type, actor_type, actor_id, resource_type,
           resource_id, action, metadata, hash, previous_hash, created_at)
        VALUES
          (${auditId}, ${DATABASE_IDS.tenantA}, 'regression.probe', 'user',
           'actor-0082', 'thing', ${auditId}, 'update',
           ${JSON.stringify({ marker: 'before' })}::jsonb,
           'hash-0082', NULL, now())
      `;

      // Precondition: the rows really are the broken shape, so a passing
      // assertion later cannot be vacuous.
      const before = await admin<{ job: string; audit: string }[]>`
        SELECT
          (SELECT jsonb_typeof(payload) FROM chai.follow_up_job WHERE id = ${jobId}) AS job,
          (SELECT jsonb_typeof(metadata) FROM chai.audit_entry WHERE id = ${auditId}) AS audit
      `;
      expect(before[0]?.job).toBe('string');
      expect(before[0]?.audit).toBe('string');

      await admin.unsafe(await readFile(MIGRATION, 'utf8'));

      const after = await admin<
        { audit_key: string | null; audit_type: string; job_key: string | null; job_type: string }[]
      >`
        SELECT
          (SELECT jsonb_typeof(payload) FROM chai.follow_up_job WHERE id = ${jobId}) AS job_type,
          (SELECT payload ->> 'paymentExternalId' FROM chai.follow_up_job WHERE id = ${jobId}) AS job_key,
          (SELECT jsonb_typeof(metadata) FROM chai.audit_entry WHERE id = ${auditId}) AS audit_type,
          (SELECT metadata ->> 'marker' FROM chai.audit_entry WHERE id = ${auditId}) AS audit_key
      `;
      const row = after[0];
      expect(row?.job_type).toBe('object');
      expect(row?.audit_type).toBe('object');
      // The point of the whole fix: a SQL consumer can read a key again.
      expect(row?.job_key).toBe('pay_regression');
      expect(row?.audit_key).toBe('before');

      // The append-only trigger must be back on: 0082 suspends it only to
      // rewrite the encoding, and leaving it off would silently make the audit
      // table mutable.
      await expect(
        admin`UPDATE chai.audit_entry SET event_type = 'tampered' WHERE id = ${auditId}`,
      ).rejects.toThrow(/append-only/);

      // Idempotent: replaying it must not fail or change anything further.
      await admin.unsafe(await readFile(MIGRATION, 'utf8'));
      const again = await admin<{ t: string }[]>`
        SELECT jsonb_typeof(metadata) AS t FROM chai.audit_entry WHERE id = ${auditId}
      `;
      expect(again[0]?.t).toBe('object');
    } finally {
      await admin`DELETE FROM chai.follow_up_job WHERE id = ${jobId}`;
      await admin.unsafe(
        `ALTER TABLE chai.audit_entry DISABLE TRIGGER audit_entry_no_delete`,
      );
      await admin`DELETE FROM chai.audit_entry WHERE id = ${auditId}`;
      await admin.unsafe(
        `ALTER TABLE chai.audit_entry ENABLE TRIGGER audit_entry_no_delete`,
      );
      await admin.end();
    }
  });

  it('refuses to run under a role that cannot bypass RLS, instead of repairing nothing', async () => {
    const admin = postgres(adminUrl, { max: 1, onnotice: () => undefined });
    try {
      await admin.unsafe(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jsonb_repair_weak') THEN
            CREATE ROLE jsonb_repair_weak LOGIN PASSWORD 'weak' NOSUPERUSER NOBYPASSRLS;
          END IF;
        END $$;
      `);
      await admin.unsafe(
        `GRANT CONNECT ON DATABASE ${new URL(adminUrl).pathname.slice(1)} TO jsonb_repair_weak`,
      );
    } finally {
      await admin.end();
    }

    const weakUrl = new URL(adminUrl);
    weakUrl.username = 'jsonb_repair_weak';
    weakUrl.password = 'weak';
    const weak = postgres(weakUrl.toString(), { max: 1, onnotice: () => undefined });
    try {
      // The old failure mode was silence. This must be noise.
      await expect(admin_unsafe(weak, await readFile(MIGRATION, 'utf8'))).rejects.toThrow(
        /superuser or BYPASSRLS/,
      );
    } finally {
      await weak.end();
    }
  });
});

/** Wraps `unsafe` so the rejection assertion reads clearly above. */
function admin_unsafe(client: postgres.Sql, sqlText: string): Promise<unknown> {
  return client.unsafe(sqlText);
}

