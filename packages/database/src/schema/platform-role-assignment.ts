import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { userAccount } from './tenancy';

const chai = pgSchema('chai');

export const platformRoleAssignment = chai.table(
  'platform_role_assignment',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    role: text('role').notNull(),
    status: text('status').notNull(),
    grantedBy: uuid('granted_by').notNull(),
    grantedAt: timestamp('granted_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp('revoked_at', { mode: 'date', withTimezone: true }),
  },
  (table) => [
    check(
      'platform_role_assignment_role_valid',
      sql`${table.role} IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN', 'SUPPORT', 'BILLING', 'AUDITOR')`,
    ),
    check(
      'platform_role_assignment_status_valid',
      sql`${table.status} IN ('ACTIVE', 'DISABLED', 'REVOKED')`,
    ),
    check(
      'platform_role_assignment_stage_1_active_role',
      sql`${table.status} <> 'ACTIVE' OR ${table.role} = 'PLATFORM_OWNER'`,
    ),
    check(
      'platform_role_assignment_revocation_consistency',
      sql`(${table.status} = 'ACTIVE' AND ${table.revokedAt} IS NULL) OR (${table.status} <> 'ACTIVE' AND ${table.revokedAt} IS NOT NULL)`,
    ),
    uniqueIndex('platform_role_assignment_active_owner_unique')
      .on(table.role)
      .where(
        sql`${table.role} = 'PLATFORM_OWNER' AND ${table.status} = 'ACTIVE'`,
      ),
    index('platform_role_assignment_user_idx').on(table.userId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [userAccount.id],
      name: 'platform_role_assignment_user_fk',
    }),
    foreignKey({
      columns: [table.grantedBy],
      foreignColumns: [userAccount.id],
      name: 'platform_role_assignment_granted_by_fk',
    }),
  ],
);
