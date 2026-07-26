import postgres from 'postgres';
import { describe, expect, it, inject } from 'vitest';

/**
 * R-09 regression: every tenant-owned table must be default-deny.
 *
 * This fails if a new migration adds a table carrying `tenant_id` without
 * ENABLE + FORCE ROW LEVEL SECURITY and a tenant policy — the exact defect that
 * migrations 0034-0039 introduced in the `public` schema
 * (blueprint 05_DATA_MODEL §14, ADR-004).
 */

/**
 * Tables that legitimately carry `tenant_id` but are not tenant-scoped rows:
 * control-plane tables where a NULL tenant means a platform-level record.
 * Keep this list short and justified; it is not a place to park new gaps.
 */
const CONTROL_PLANE_EXEMPT = new Set<string>([
  'chai.audit_log', // tenant_id is nullable: platform-level events have none
]);

describe('RLS coverage across tenant-owned tables', () => {
  it('forces row level security on every table carrying tenant_id', async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      const tables = await admin<
        {
          schemaname: string;
          tablename: string;
          relrowsecurity: boolean;
          relforcerowsecurity: boolean;
          policy_count: number;
        }[]
      >`
        SELECT
          namespace_record.nspname AS schemaname,
          table_record.relname AS tablename,
          table_record.relrowsecurity,
          table_record.relforcerowsecurity,
          (
            SELECT count(*)
            FROM pg_policy
            WHERE pg_policy.polrelid = table_record.oid
          )::int AS policy_count
        FROM pg_class AS table_record
        JOIN pg_namespace AS namespace_record
          ON namespace_record.oid = table_record.relnamespace
        WHERE table_record.relkind = 'r'
          AND namespace_record.nspname IN ('public', 'chai')
          AND EXISTS (
            SELECT 1
            FROM pg_attribute
            WHERE pg_attribute.attrelid = table_record.oid
              AND pg_attribute.attname = 'tenant_id'
              AND pg_attribute.attnum > 0
              AND NOT pg_attribute.attisdropped
          )
        ORDER BY 1, 2
      `;

      expect(tables.length).toBeGreaterThan(0);

      const offenders = tables
        .map((row) => ({
          ...row,
          qualified: `${row.schemaname}.${row.tablename}`,
        }))
        .filter(({ qualified }) => !CONTROL_PLANE_EXEMPT.has(qualified))
        .filter(
          (row) =>
            !row.relrowsecurity ||
            !row.relforcerowsecurity ||
            row.policy_count === 0,
        )
        .map(
          (row) =>
            `${row.qualified} (rls=${row.relrowsecurity}, forced=${row.relforcerowsecurity}, policies=${row.policy_count})`,
        );

      expect(offenders).toEqual([]);
    } finally {
      await admin.end();
    }
  });

  it('keeps every runtime role unable to bypass RLS', async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      const roles = await admin<{ rolname: string; rolbypassrls: boolean }[]>`
        SELECT rolname, rolbypassrls
        FROM pg_roles
        WHERE rolname IN (
          'chai_app_runtime',
          'chai_worker_runtime',
          'chai_analytics_reader',
          'chai_migration_owner'
        )
        ORDER BY rolname
      `;

      expect(roles.length).toBe(4);
      expect(roles.filter(({ rolbypassrls }) => rolbypassrls)).toEqual([]);
    } finally {
      await admin.end();
    }
  });
});
