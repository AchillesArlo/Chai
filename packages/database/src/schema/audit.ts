import {
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { tenant } from './tenancy';

const chai = pgSchema('chai');

export const auditLog = chai.table(
  'audit_log',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    actorId: uuid('actor_id').notNull(),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id'),
    reason: text('reason'),
    correlationId: uuid('correlation_id').notNull(),
    metadata: jsonb('metadata').default({}).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('audit_log_tenant_created_idx').on(table.tenantId, table.createdAt),
    uniqueIndex('audit_log_tenant_id_unique').on(table.tenantId, table.id),
  ],
);
