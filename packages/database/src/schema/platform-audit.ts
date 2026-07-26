import { sql } from 'drizzle-orm';
import {
  check,
  index,
  inet,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const chai = pgSchema('chai');

export const platformAuditLog = chai.table(
  'platform_audit_log',
  {
    id: uuid('id').primaryKey(),
    actorType: text('actor_type').notNull(),
    actorId: uuid('actor_id').notNull(),
    sessionReference: text('session_reference'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id'),
    risk: text('risk').notNull(),
    beforeAfterReference: text('before_after_reference'),
    reason: text('reason'),
    sourceIp: inet('source_ip'),
    device: text('device'),
    correlationId: uuid('correlation_id').notNull(),
    occurredAt: timestamp('occurred_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'platform_audit_log_actor_type_valid',
      sql`${table.actorType} IN ('USER', 'SERVICE')`,
    ),
    check(
      'platform_audit_log_risk_valid',
      sql`${table.risk} IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')`,
    ),
    index('platform_audit_log_occurred_idx').on(table.occurredAt),
  ],
);
