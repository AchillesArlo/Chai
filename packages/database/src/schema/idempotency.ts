import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
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
const timestampColumns = {
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const operationExecution = chai.table(
  'operation_execution',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    operationType: text('operation_type').notNull(),
    status: text('status').notNull(),
    providerReference: text('provider_reference'),
    responseReference: text('response_reference'),
    reconciledAt: timestamp('reconciled_at', {
      mode: 'date',
      withTimezone: true,
    }),
    version: integer('version').default(1).notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('operation_execution_tenant_id_unique').on(
      table.tenantId,
      table.id,
    ),
    check(
      'operation_execution_status_valid',
      sql`${table.status} IN ('PROCESSING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'UNKNOWN_RESULT')`,
    ),
    check('operation_execution_version_positive', sql`${table.version} > 0`),
  ],
);

export const idempotencyRecord = chai.table(
  'idempotency_record',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    audience: text('audience').notNull(),
    operation: text('operation').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    status: text('status').notNull(),
    operationId: uuid('operation_id').notNull(),
    responseReference: text('response_reference'),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true })
      .notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('idempotency_record_tenant_id_unique').on(
      table.tenantId,
      table.id,
    ),
    uniqueIndex('idempotency_record_tenant_key_unique').on(
      table.tenantId,
      table.audience,
      table.operation,
      table.idempotencyKey,
    ),
    foreignKey({
      columns: [table.tenantId, table.operationId],
      foreignColumns: [
        operationExecution.tenantId,
        operationExecution.id,
      ],
      name: 'idempotency_record_operation_fk',
    }),
    check(
      'idempotency_record_status_valid',
      sql`${table.status} IN ('PROCESSING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'UNKNOWN_RESULT')`,
    ),
    index('idempotency_expiry_idx').on(table.expiresAt),
  ],
);
