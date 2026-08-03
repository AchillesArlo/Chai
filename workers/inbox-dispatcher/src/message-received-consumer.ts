import { randomUUID } from 'node:crypto';

import {
  outboxStreamKey,
  RedisStreamsConsumer,
  type BrokerClient,
  type OutboxStreamMessage,
} from '@chai/broker';
import { withTenantTransaction, type Database } from '@chai/database';
import {
  recordMessageFact,
  WORKER_SERVICE_PRINCIPAL_ID,
  type MessageFactInput,
} from '@chai/domain';

/**
 * The single event type this consumer drains, and the durable group name every
 * inbox-dispatcher instance shares while draining it.
 */
export const MESSAGE_RECEIVED_EVENT_TYPE = 'message.received';
export const MESSAGE_RECEIVED_CONSUMER_GROUP = 'inbox-message-fact';

export interface MessageReceivedConsumerConfig {
  database: Database;
  redis: BrokerClient;
  /** Unique name for this instance within the group. */
  consumerName?: string;
  /** Bounded loop for tests; runs until the signal aborts when omitted. */
  iterations?: number;
  signal?: AbortSignal;
  blockMs?: number;
  minIdleMs?: number;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Projects a `message.received` stream entry onto a fact row, or null when it
 * lacks the identifiers a fact needs. A null is a malformed analytics event
 * (not a business record), so the caller skips it rather than retrying forever.
 */
export function toMessageFactInput(
  message: OutboxStreamMessage,
): MessageFactInput | null {
  const payload = message.payload;
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const conversationId =
    asString(record['conversationId']) ?? asString(message.aggregateId);
  const messageId = asString(record['messageId']);
  const tenantId = asString(message.tenantId);
  const eventId = asString(message.eventId);
  if (!conversationId || !messageId || !tenantId || !eventId) {
    return null;
  }
  return {
    conversationCreated: record['conversationCreated'] === true,
    conversationId,
    eventId,
    messageId,
    mode: asString(record['mode']) ?? 'UNKNOWN',
    provider: asString(record['provider']) ?? 'unknown',
    tenantId,
  };
}

/**
 * Writes one message fact under the message's tenant context. Idempotency is
 * layered: the consumer already dedups by event id at the Redis level, and
 * recordMessageFact dedups again on (tenant_id, event_id) at the DB level, so an
 * at-least-once redelivery can never double-count.
 */
async function handleMessageReceived(
  database: Database,
  message: OutboxStreamMessage,
): Promise<void> {
  if (message.eventType !== MESSAGE_RECEIVED_EVENT_TYPE) return;
  const fact = toMessageFactInput(message);
  if (!fact) {
    console.warn(
      'inbox-dispatcher: skipping unparseable message.received event',
      { eventId: message.eventId },
    );
    return;
  }
  await withTenantTransaction(
    database,
    { principalId: WORKER_SERVICE_PRINCIPAL_ID, tenantId: fact.tenantId },
    (tx) => recordMessageFact(tx, fact),
  );
}

/**
 * Production consumer of the outbox `message.received` stream: the first real
 * user of RedisStreamsConsumer. It materializes chai.message_fact so analytics
 * is fed by events, not by scanning operational tables (FASE 30 + FASE 32).
 *
 * `groupStartId: '0'` so the group, when first created, replays from the start
 * of the (capped) stream rather than only seeing events published after it
 * attached — an analytics consumer must not silently skip a backlog.
 */
export async function runMessageReceivedConsumer(
  config: MessageReceivedConsumerConfig,
): Promise<void> {
  const consumer = new RedisStreamsConsumer({
    consumerName: config.consumerName ?? `inbox-dispatcher-${randomUUID()}`,
    group: MESSAGE_RECEIVED_CONSUMER_GROUP,
    groupStartId: '0',
    redis: config.redis,
    streamKey: outboxStreamKey(MESSAGE_RECEIVED_EVENT_TYPE),
  });
  await consumer.ensureGroup();
  await consumer.run({
    blockMs: config.blockMs ?? 5_000,
    handler: (message) => handleMessageReceived(config.database, message),
    iterations: config.iterations,
    minIdleMs: config.minIdleMs ?? 60_000,
    signal: config.signal,
  });
}
