import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { inject } from 'vitest';

describe('migrated schema catalog', () => {
  it('uses canonical platform role constraint and index names', async () => {
    const admin = postgres(inject('adminDatabaseUrl'), { max: 1 });

    try {
      const constraints = await admin<{ conname: string }[]>`
        SELECT constraint_record.conname
        FROM pg_constraint AS constraint_record
        JOIN pg_class AS table_record
          ON table_record.oid = constraint_record.conrelid
        JOIN pg_namespace AS namespace_record
          ON namespace_record.oid = table_record.relnamespace
        WHERE namespace_record.nspname = 'chai'
          AND table_record.relname = 'platform_role_assignment'
        ORDER BY constraint_record.conname
      `;
      const indexes = await admin<{ indexname: string }[]>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'chai'
          AND tablename = 'platform_role_assignment'
        ORDER BY indexname
      `;

      expect(constraints.map(({ conname }) => conname)).toEqual(
        expect.arrayContaining([
          'platform_role_assignment_granted_by_fk',
          'platform_role_assignment_revocation_consistency',
          'platform_role_assignment_role_valid',
          'platform_role_assignment_stage_1_active_role',
          'platform_role_assignment_status_valid',
          'platform_role_assignment_user_fk',
        ]),
      );
      expect(indexes.map(({ indexname }) => indexname)).toEqual(
        expect.arrayContaining([
          'platform_role_assignment_active_owner_unique',
          'platform_role_assignment_user_idx',
        ]),
      );
    } finally {
      await admin.end();
    }
  });
});
