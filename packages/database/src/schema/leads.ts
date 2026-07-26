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

import { contact } from './conversations';
import { tenant } from './tenancy';

const chai = pgSchema('chai');

export const lead = chai.table(
  'lead',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id),
    source: text('source').notNull(),
    stage: text('stage').default('NEW').notNull(),
    status: text('status').default('OPEN').notNull(),
    score: integer('score').default(0).notNull(),
    ownerUserId: uuid('owner_user_id'),
    nextActionAt: timestamp('next_action_at', { mode: 'date', withTimezone: true }),
    nextActionType: text('next_action_type'),
    convertedAt: timestamp('converted_at', { mode: 'date', withTimezone: true }),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('lead_tenant_id_unique').on(table.tenantId, table.id),
    check(
      'lead_stage_valid',
      sql`${table.stage} IN ('NEW', 'CONTACTED', 'QUALIFIED', 'BOOKED', 'LOST', 'WON')`,
    ),
    check(
      'lead_status_valid',
      sql`${table.status} IN ('OPEN', 'CONVERTED', 'LOST', 'ARCHIVED')`,
    ),
    check('lead_score_range', sql`${table.score} >= 0 AND ${table.score} <= 100`),
    check('lead_version_positive', sql`${table.version} > 0`),
    index('lead_tenant_stage_idx').on(table.tenantId, table.stage),
    index('lead_tenant_owner_idx').on(table.tenantId, table.ownerUserId),
  ],
);

export const appointment = chai.table(
  'appointment',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id),
    leadId: uuid('lead_id').references(() => lead.id),
    resourceId: text('resource_id').notNull(),
    status: text('status').default('CONFIRMED').notNull(),
    startsAt: timestamp('starts_at', { mode: 'date', withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { mode: 'date', withTimezone: true }).notNull(),
    timezone: text('timezone').default('UTC').notNull(),
    title: text('title').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    rescheduledFrom: uuid('rescheduled_from'),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('appointment_tenant_id_unique').on(table.tenantId, table.id),
    check(
      'appointment_status_valid',
      sql`${table.status} IN ('CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW')`,
    ),
    check('appointment_version_positive', sql`${table.version} > 0`),
    uniqueIndex('appointment_tenant_resource_start_idem_unique').on(
      table.tenantId,
      table.resourceId,
      table.startsAt,
      table.idempotencyKey,
    ),
    index('appointment_tenant_start_idx').on(
      table.tenantId,
      table.resourceId,
      table.startsAt,
    ),
    index('appointment_contact_idx').on(table.tenantId, table.contactId),
  ],
);
