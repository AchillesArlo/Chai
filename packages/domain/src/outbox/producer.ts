import { randomUUID } from 'node:crypto';

import type { DatabaseTransaction } from '@chai/database';

import { currentTraceparent } from '../telemetry/trace-context';

export interface OutboxEventInput {
  aggregateId: string;
  aggregateType: string;
  aggregateVersion: number;
  eventType: string;
  /**
   * Ordering key. Events sharing a partition key are published in insertion
   * order; nothing is promised across keys (07_EVENTS §2).
   */
  partitionKey?: string;
  payload: unknown;
  schemaVersion?: number;
  tenantId: string;
}

export interface AuditEntryInput {
  action: string;
  actorId: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  reason?: string;
  resourceId?: string;
  resourceType: string;
  tenantId: string;
}

/**
 * Appends a canonical event to the transactional outbox.
 *
 * Must be called inside the same transaction as the business mutation it
 * describes (ADR-007). The database stays authoritative until the dispatcher
 * persists a broker acknowledgement, so a publish crash redelivers rather than
 * drops.
 */
export async function appendOutboxEvent(
  transaction: DatabaseTransaction,
  input: OutboxEventInput,
): Promise<string> {
  const id = randomUUID();
  await transaction`
    INSERT INTO chai.outbox_event (
      id,
      tenant_id,
      event_type,
      schema_version,
      aggregate_type,
      aggregate_id,
      aggregate_version,
      partition_key,
      payload,
      status,
      traceparent
    ) VALUES (
      ${id},
      ${input.tenantId},
      ${input.eventType},
      ${Math.max(1, Math.trunc(input.schemaVersion ?? 1))}::int,
      ${input.aggregateType},
      ${input.aggregateId},
      ${Math.max(0, Math.trunc(input.aggregateVersion))}::int,
      ${input.partitionKey ?? input.aggregateId},
      ${JSON.stringify(input.payload ?? {})}::jsonb,
      'PENDING',
      ${currentTraceparent()}
    )
  `;
  return id;
}

/** Appends an append-only audit entry inside the caller's transaction. */
export async function appendAuditEntry(
  transaction: DatabaseTransaction,
  input: AuditEntryInput,
): Promise<string> {
  const id = randomUUID();
  await transaction`
    INSERT INTO chai.audit_log (
      id,
      tenant_id,
      actor_id,
      action,
      resource_type,
      resource_id,
      reason,
      correlation_id,
      metadata
    ) VALUES (
      ${id},
      ${input.tenantId},
      ${input.actorId},
      ${input.action},
      ${input.resourceType},
      ${input.resourceId ?? null},
      ${input.reason ?? null},
      ${input.correlationId ?? randomUUID()},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
  `;
  return id;
}

export interface BusinessMutationInput<T> {
  /**
   * Derives the audit entry and the canonical events from the mutation result,
   * so aggregate ids and versions come from what actually landed rather than
   * from a guess made before the write.
   */
  describe: (result: T) => {
    audit: Omit<AuditEntryInput, 'tenantId'>;
    events: readonly Omit<OutboxEventInput, 'tenantId'>[];
  };
  mutate: () => Promise<T>;
  tenantId: string;
}

/**
 * Runs a business mutation together with its audit entry and its outbox events
 * in ONE transaction.
 *
 * This is the shape blueprint ADR-007 and 16_TECH_STACK §4 require: either the
 * state change, the audit trail, and the event all land, or none do. Callers
 * must already be inside a tenant-scoped transaction so RLS applies.
 */
export async function commitBusinessMutation<T>(
  transaction: DatabaseTransaction,
  input: BusinessMutationInput<T>,
): Promise<T> {
  const result = await input.mutate();
  const { audit, events } = input.describe(result);
  if (events.length === 0) {
    // A mutation nobody can observe is a defect, not an optimisation: realtime,
    // analytics, and automations all read the outbox.
    throw new Error('BUSINESS_MUTATION_REQUIRES_EVENT');
  }
  await appendAuditEntry(transaction, { ...audit, tenantId: input.tenantId });
  for (const event of events) {
    await appendOutboxEvent(transaction, { ...event, tenantId: input.tenantId });
  }
  return result;
}
