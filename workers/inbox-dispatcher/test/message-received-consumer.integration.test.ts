import { randomUUID } from 'node:crypto';

import {
  createBrokerClient,
  RedisStreamsOutboxPublisher,
  type BrokerClient,
} from '@chai/broker';
import { createDatabase, withTenantTransaction } from '@chai/database';
import {
  recordMessageFact,
  WORKER_SERVICE_PRINCIPAL_ID,
  type OutboxClaim,
} from '@chai/domain';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';

import { runMessageReceivedConsumer } from '../src';

import { seedTenantRoster, WORKER_IDS } from './helpers';

interface MessageFactRow {
  conversation_created: boolean;
  conversation_id: string;
  event_id: string;
  message_id: string;
  mode: string;
  provider: string;
}

function messageReceivedClaim(overrides: {
  conversationCreated?: boolean;
  conversationId: string;
  eventId: string;
  messageId: string;
  mode?: string;
}): OutboxClaim {
  return {
    aggregateId: overrides.conversationId,
    aggregateType: 'conversation',
    aggregateVersion: 1,
    attempts: 1,
    eventType: 'message.received',
    id: overrides.eventId,
    partitionKey: overrides.conversationId,
    payload: {
      contactId: randomUUID(),
      conversationCreated: overrides.conversationCreated ?? false,
      conversationId: overrides.conversationId,
      messageId: overrides.messageId,
      mode: overrides.mode ?? 'AI_ACTIVE',
      provider: 'mock-channel',
      status: 'OPEN',
    },
    schemaVersion: 1,
    tenantId: WORKER_IDS.tenantA,
    traceparent: null,
  };
}

async function fetchMessageFacts(
  adminDatabaseUrl: string,
): Promise<MessageFactRow[]> {
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    return await admin<MessageFactRow[]>`
      SELECT event_id, conversation_id, message_id, provider, mode, conversation_created
      FROM chai.message_fact
      WHERE tenant_id = ${WORKER_IDS.tenantA}
      ORDER BY created_at
    `;
  } finally {
    await admin.end();
  }
}

/**
 * FASE 30: RedisStreamsConsumer gains its first PRODUCTION user. The consumer
 * drains the outbox `message.received` stream and materializes chai.message_fact
 * (which also proves the FASE 32 fact table is filled from events, not scans).
 */
describe('inbox dispatcher — message.received Redis consumer', () => {
  let adminDatabaseUrl: string;
  let workerDatabaseUrl: string;
  let container: StartedRedisContainer;
  let redis: BrokerClient;

  beforeAll(async () => {
    adminDatabaseUrl = inject('adminDatabaseUrl');
    workerDatabaseUrl = inject('workerDatabaseUrl');
    await seedTenantRoster(adminDatabaseUrl);
    container = await new RedisContainer('redis:7.4-alpine').start();
    redis = createBrokerClient(container.getConnectionUrl());
  });

  afterEach(async () => {
    const admin = postgres(adminDatabaseUrl, { max: 1 });
    try {
      await admin`DELETE FROM chai.message_fact WHERE tenant_id = ${WORKER_IDS.tenantA}`;
    } finally {
      await admin.end();
    }
    await redis.flushall();
  });

  afterAll(async () => {
    await redis.quit().catch(() => redis.disconnect());
    await container.stop();
  });

  async function consumeOnce(): Promise<void> {
    const worker = createDatabase(workerDatabaseUrl);
    try {
      await runMessageReceivedConsumer({
        blockMs: 100,
        consumerName: `test-${randomUUID()}`,
        database: worker,
        iterations: 1,
        minIdleMs: 0,
        redis,
      });
    } finally {
      await worker.end();
    }
  }

  it('records a published message.received event into chai.message_fact', async () => {
    const eventId = randomUUID();
    const conversationId = randomUUID();
    const messageId = randomUUID();
    const publisher = new RedisStreamsOutboxPublisher(redis);
    expect(
      await publisher.publish(
        messageReceivedClaim({
          conversationCreated: true,
          conversationId,
          eventId,
          messageId,
          mode: 'AI_ACTIVE',
        }),
      ),
    ).toBe('acked');

    await consumeOnce();

    const facts = await fetchMessageFacts(adminDatabaseUrl);
    expect(facts).toHaveLength(1);
    expect(facts[0]?.event_id).toBe(eventId);
    expect(facts[0]?.conversation_id).toBe(conversationId);
    expect(facts[0]?.message_id).toBe(messageId);
    expect(facts[0]?.mode).toBe('AI_ACTIVE');
    expect(facts[0]?.conversation_created).toBe(true);
  });

  it('does not double-count a redelivered event (Redis dedup + DB unique)', async () => {
    const eventId = randomUUID();
    const conversationId = randomUUID();
    const messageId = randomUUID();
    const publisher = new RedisStreamsOutboxPublisher(redis);
    const claim = messageReceivedClaim({ conversationId, eventId, messageId });

    // At-least-once: the same event id lands on the stream twice.
    await publisher.publish(claim);
    await publisher.publish(claim);

    await consumeOnce();
    // A fresh consumer in the same group; already-acked entries are not
    // redelivered, so the fact count must not grow.
    await consumeOnce();

    expect(await fetchMessageFacts(adminDatabaseUrl)).toHaveLength(1);

    // Second idempotency layer, exercised directly: inserting the same
    // (tenant, event_id) again via the worker path is a no-op, not a duplicate
    // or an error — the chai.message_fact UNIQUE constraint + ON CONFLICT.
    const worker = createDatabase(workerDatabaseUrl);
    try {
      await withTenantTransaction(
        worker,
        { principalId: WORKER_SERVICE_PRINCIPAL_ID, tenantId: WORKER_IDS.tenantA },
        (tx) =>
          recordMessageFact(tx, {
            conversationCreated: false,
            conversationId,
            eventId,
            messageId,
            mode: 'AI_ACTIVE',
            provider: 'mock-channel',
            tenantId: WORKER_IDS.tenantA,
          }),
      );
    } finally {
      await worker.end();
    }

    expect(await fetchMessageFacts(adminDatabaseUrl)).toHaveLength(1);
  });
});
