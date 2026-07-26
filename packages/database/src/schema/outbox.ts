import { sql } from 'drizzle-orm';
import {
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

import { tenant } from './tenancy';

const chai = pgSchema('chai');

export const outboxEvent = chai.table(
  'outbox_event',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    eventType: text('event_type').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    aggregateVersion: integer('aggregate_version').notNull(),
    partitionKey: text('partition_key').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').default('PENDING').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    availableAt: timestamp('available_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    leaseUntil: timestamp('lease_until', { mode: 'date', withTimezone: true }),
    publishedAt: timestamp('published_at', { mode: 'date', withTimezone: true }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('outbox_event_tenant_id_unique').on(table.tenantId, table.id),
    check(
      'outbox_event_schema_version_positive',
      sql`${table.schemaVersion} > 0`,
    ),
    check(
      'outbox_event_aggregate_version_non_negative',
      sql`${table.aggregateVersion} >= 0`,
    ),
    check(
      'outbox_event_status_valid',
      sql`${table.status} IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'RETRY', 'DEAD_LETTER')`,
    ),
    check('outbox_event_attempts_non_negative', sql`${table.attempts} >= 0`),
    index('outbox_event_dispatch_idx')
      .on(table.status, table.availableAt)
      .where(sql`${table.status} IN ('PENDING', 'RETRY')`),
  ],
);
