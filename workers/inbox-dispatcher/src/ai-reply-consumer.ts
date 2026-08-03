import { randomUUID } from 'node:crypto';

import {
  createAiGateway,
  processAiReplyTurn,
  type AiGateway,
  type ProcessAiReplyTurnResult,
} from '@chai/ai-gateway';
import {
  outboxStreamKey,
  RedisStreamsConsumer,
  type BrokerClient,
  type OutboxStreamMessage,
} from '@chai/broker';
import { createMockAiAdapter } from '@chai/connectors/mock-ai';
import type { Database } from '@chai/database';

export const AI_REPLY_EVENT_TYPE = 'message.received';
export const AI_REPLY_CONSUMER_GROUP = 'inbox-ai-reply';

export interface AiReplyConsumerConfig {
  database: Database;
  redis: BrokerClient;
  gateway?: AiGateway;
  consumerName?: string;
  iterations?: number;
  signal?: AbortSignal;
  blockMs?: number;
  minIdleMs?: number;
}

/**
 * Handles a single `message.received` outbox stream message by triggering the AI reply turn.
 */
export async function handleAiReplyEvent(
  database: Database,
  gateway: AiGateway,
  message: OutboxStreamMessage,
): Promise<ProcessAiReplyTurnResult | null> {
  if (message.eventType !== AI_REPLY_EVENT_TYPE) return null;

  const tenantId = message.tenantId;
  const conversationId = message.aggregateId;
  const payload = message.payload as Record<string, unknown> | null;
  const messageId =
    payload && typeof payload['messageId'] === 'string'
      ? (payload['messageId'] as string)
      : null;

  if (!tenantId || !conversationId || !messageId) {
    return null;
  }

  return processAiReplyTurn(database, gateway, {
    conversationId,
    messageId,
    tenantId,
  });
}

/**
 * Production consumer for automated AI replies (FASE 31, T-01, T-02).
 * Drains `message.received` stream entries and invokes the AI reply pipeline.
 */
export async function runAiReplyConsumer(
  config: AiReplyConsumerConfig,
): Promise<void> {
  const gateway =
    config.gateway ??
    createAiGateway({
      adapter: createMockAiAdapter(),
    });

  const consumer = new RedisStreamsConsumer({
    consumerName: config.consumerName ?? `inbox-ai-reply-${randomUUID()}`,
    group: AI_REPLY_CONSUMER_GROUP,
    groupStartId: '0',
    redis: config.redis,
    streamKey: outboxStreamKey(AI_REPLY_EVENT_TYPE),
  });

  await consumer.ensureGroup();
  await consumer.run({
    blockMs: config.blockMs ?? 5_000,
    handler: async (message) => {
      await handleAiReplyEvent(config.database, gateway, message);
    },
    iterations: config.iterations,
    minIdleMs: config.minIdleMs ?? 60_000,
    signal: config.signal,
  });
}
