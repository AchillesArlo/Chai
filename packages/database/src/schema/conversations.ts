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

export const contact = chai.table(
  'contact',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    displayName: text('display_name').notNull(),
    status: text('status').default('ACTIVE').notNull(),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('contact_tenant_id_unique').on(table.tenantId, table.id),
    check(
      'contact_status_valid',
      sql`${table.status} IN ('ACTIVE', 'MERGED', 'BLOCKED', 'ARCHIVED')`,
    ),
    check('contact_version_positive', sql`${table.version} > 0`),
    index('contact_tenant_status_idx').on(table.tenantId, table.status),
  ],
);

export const contactIdentity = chai.table(
  'contact_identity',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id),
    channelAccountId: uuid('channel_account_id').notNull(),
    externalUserId: text('external_user_id').notNull(),
    addressNormalized: text('address_normalized'),
    displayHandle: text('display_handle'),
    firstSeenAt: timestamp('first_seen_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp('last_seen_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('contact_identity_tenant_id_unique').on(table.tenantId, table.id),
    uniqueIndex('contact_identity_tenant_channel_user_unique').on(
      table.tenantId,
      table.channelAccountId,
      table.externalUserId,
    ),
    index('contact_identity_contact_idx').on(table.tenantId, table.contactId),
  ],
);

export const conversation = chai.table(
  'conversation',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id),
    channelAccountId: uuid('channel_account_id').notNull(),
    externalThreadId: text('external_thread_id'),
    status: text('status').default('OPEN').notNull(),
    mode: text('mode').default('AI_ACTIVE').notNull(),
    priority: text('priority').default('NORMAL').notNull(),
    assigneeUserId: uuid('assignee_user_id'),
    lastMessageAt: timestamp('last_message_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    openedAt: timestamp('opened_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp('resolved_at', { mode: 'date', withTimezone: true }),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('conversation_tenant_id_unique').on(table.tenantId, table.id),
    check(
      'conversation_status_valid',
      sql`${table.status} IN ('OPEN', 'PENDING_AGENT', 'RESOLVED', 'CLOSED')`,
    ),
    check(
      'conversation_mode_valid',
      sql`${table.mode} IN ('AI_ACTIVE', 'HUMAN_ACTIVE', 'PAUSED')`,
    ),
    check(
      'conversation_priority_valid',
      sql`${table.priority} IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')`,
    ),
    check('conversation_version_positive', sql`${table.version} > 0`),
    index('conversation_tenant_status_last_idx').on(
      table.tenantId,
      table.status,
      table.lastMessageAt,
    ),
    index('conversation_tenant_contact_idx').on(table.tenantId, table.contactId),
  ],
);

export const message = chai.table(
  'message',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversation.id),
    externalMessageId: text('external_message_id'),
    direction: text('direction').notNull(),
    senderType: text('sender_type').notNull(),
    contentType: text('content_type').default('TEXT').notNull(),
    textContent: text('text_content'),
    providerTimestamp: timestamp('provider_timestamp', {
      mode: 'date',
      withTimezone: true,
    }),
    receivedAt: timestamp('received_at', { mode: 'date', withTimezone: true }),
    sentAt: timestamp('sent_at', { mode: 'date', withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { mode: 'date', withTimezone: true }),
    readAt: timestamp('read_at', { mode: 'date', withTimezone: true }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('message_tenant_id_unique').on(table.tenantId, table.id),
    uniqueIndex('message_tenant_conversation_external_unique').on(
      table.tenantId,
      table.conversationId,
      table.externalMessageId,
    ),
    check(
      'message_direction_valid',
      sql`${table.direction} IN ('INBOUND', 'OUTBOUND', 'INTERNAL')`,
    ),
    check(
      'message_sender_type_valid',
      sql`${table.senderType} IN ('CUSTOMER', 'AI', 'HUMAN', 'SYSTEM')`,
    ),
    check(
      'message_content_type_valid',
      sql`${table.contentType} IN ('TEXT', 'MEDIA', 'TEMPLATE', 'SYSTEM')`,
    ),
    index('message_conversation_idx').on(
      table.tenantId,
      table.conversationId,
      table.createdAt,
    ),
  ],
);
