import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const chai = pgSchema('chai');
const timestampColumns = {
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const tenant = chai.table(
  'tenant',
  {
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    status: text('status').default('ACTIVE').notNull(),
    version: integer('version').default(1).notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('tenant_slug_unique').on(table.slug),
    check(
      'tenant_status_valid',
      sql`${table.status} IN ('DRAFT', 'ACTIVE', 'SUSPENDED', 'DELETION_REQUESTED')`,
    ),
    check('tenant_version_positive', sql`${table.version} > 0`),
  ],
);

export const userAccount = chai.table(
  'user_account',
  {
    id: uuid('id').primaryKey(),
    externalSubject: text('external_subject').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status').default('ACTIVE').notNull(),
    version: integer('version').default(1).notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('user_account_external_subject_unique').on(
      table.externalSubject,
    ),
    check(
      'user_account_status_valid',
      sql`${table.status} IN ('ACTIVE', 'SUSPENDED', 'DISABLED')`,
    ),
    check('user_account_version_positive', sql`${table.version} > 0`),
  ],
);

export const membership = chai.table(
  'membership',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => userAccount.id),
    role: text('role').notNull(),
    status: text('status').default('ACTIVE').notNull(),
    version: integer('version').default(1).notNull(),
    ...timestampColumns,
  },
  (table) => [
    index('membership_user_idx').on(table.userId),
    uniqueIndex('membership_tenant_id_unique').on(table.tenantId, table.id),
    uniqueIndex('membership_tenant_user_unique').on(
      table.tenantId,
      table.userId,
    ),
    check(
      'membership_role_valid',
      sql`${table.role} IN ('CLIENT_OWNER', 'CLIENT_ADMIN', 'CLIENT_MANAGER', 'CLIENT_AGENT', 'CLIENT_ANALYST', 'CLIENT_VIEWER')`,
    ),
    check(
      'membership_status_valid',
      sql`${table.status} IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED')`,
    ),
    check('membership_version_positive', sql`${table.version} > 0`),
  ],
);

export const entitlement = chai.table(
  'entitlement',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    capabilityKey: text('capability_key').notNull(),
    enabled: boolean('enabled').default(false).notNull(),
    configuration: jsonb('configuration').default({}).notNull(),
    version: integer('version').default(1).notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('entitlement_tenant_id_unique').on(table.tenantId, table.id),
    uniqueIndex('entitlement_tenant_capability_unique').on(
      table.tenantId,
      table.capabilityKey,
    ),
    check('entitlement_version_positive', sql`${table.version} > 0`),
  ],
);
