import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { tenant } from './tenancy';

const chai = pgSchema('chai');

export const inboxEvent = chai.table(
  'inbox_event',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    provider: text('provider').notNull(),
    providerAccountId: uuid('provider_account_id').notNull(),
    externalEventId: text('external_event_id').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    payloadReference: text('payload_reference').notNull(),
    payloadHash: text('payload_hash').notNull(),
    status: text('status').default('PENDING').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    availableAt: timestamp('available_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    leaseUntil: timestamp('lease_until', { mode: 'date', withTimezone: true }),
    processedAt: timestamp('processed_at', { mode: 'date', withTimezone: true }),
    receivedAt: timestamp('received_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('inbox_event_tenant_id_unique').on(table.tenantId, table.id),
    uniqueIndex('inbox_event_tenant_provider_event_unique').on(
      table.tenantId,
      table.provider,
      table.providerAccountId,
      table.externalEventId,
    ),
    check(
      'inbox_event_status_valid',
      sql`${table.status} IN ('PENDING', 'PROCESSING', 'PROCESSED', 'RETRY', 'DEAD_LETTER', 'QUARANTINED')`,
    ),
    check(
      'inbox_event_schema_version_positive',
      sql`${table.schemaVersion} > 0`,
    ),
    check(
      'inbox_event_payload_hash_valid',
      sql`${table.payloadHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
    check('inbox_event_attempts_non_negative', sql`${table.attempts} >= 0`),
    index('inbox_event_dispatch_idx')
      .on(table.status, table.availableAt)
      .where(sql`${table.status} IN ('PENDING', 'RETRY')`),
  ],
);
