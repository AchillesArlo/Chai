import { randomUUID } from 'node:crypto';

import type { DatabaseTransaction } from '@chai/database';

import type { MessageFact } from '../analytics';

export interface MessageFactInput {
  conversationCreated: boolean;
  conversationId: string;
  /** Outbox event id — the idempotency key for at-least-once delivery. */
  eventId: string;
  messageId: string;
  mode: string;
  provider: string;
  tenantId: string;
}

/**
 * Records one row of chai.message_fact from a consumed `message.received` event.
 *
 * Idempotent on (tenant_id, event_id): the FASE 30 consumer is at-least-once, so
 * a redelivered event must not double-count. `ON CONFLICT DO NOTHING` is the same
 * dedup discipline chai.payment_webhook_event uses (migration 0084). Runs in the
 * caller's tenant transaction.
 */
export async function recordMessageFact(
  transaction: DatabaseTransaction,
  input: MessageFactInput,
): Promise<void> {
  await transaction`
    INSERT INTO chai.message_fact (
      id, tenant_id, event_id, conversation_id, message_id,
      provider, mode, conversation_created
    ) VALUES (
      ${randomUUID()}, ${input.tenantId}, ${input.eventId}, ${input.conversationId},
      ${input.messageId}, ${input.provider}, ${input.mode}, ${input.conversationCreated}
    )
    ON CONFLICT (tenant_id, event_id) DO NOTHING
  `;
}

interface MessageFactRow {
  conversation_created: boolean;
  mode: string;
  occurred_at: Date;
}

/**
 * Reads message facts for the current tenant (RLS scopes the rows), optionally
 * bounded to those at or after `since`. Returns the pure {@link MessageFact}
 * shape the metric functions consume, so dashboards read this fact table instead
 * of the operational chai.message.
 */
export async function readMessageFacts(
  transaction: DatabaseTransaction,
  since?: Date,
): Promise<MessageFact[]> {
  const rows = since
    ? await transaction<MessageFactRow[]>`
        SELECT mode, conversation_created, occurred_at
        FROM chai.message_fact
        WHERE occurred_at >= ${since}
        ORDER BY occurred_at
      `
    : await transaction<MessageFactRow[]>`
        SELECT mode, conversation_created, occurred_at
        FROM chai.message_fact
        ORDER BY occurred_at
      `;
  return rows.map((row) => ({
    aiHandled: row.mode === 'AI_ACTIVE',
    conversationCreated: row.conversation_created,
    occurredAt: row.occurred_at,
  }));
}
