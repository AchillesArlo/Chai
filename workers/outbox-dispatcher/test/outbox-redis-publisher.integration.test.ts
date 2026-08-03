import {
  createBrokerClient,
  outboxStreamKey,
  RedisStreamsConsumer,
  RedisStreamsOutboxPublisher,
  type BrokerClient,
} from '@chai/broker';
import { createDatabase } from '@chai/database';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';

import { runOutboxDispatcher } from '../src';

import {
  clearOutbox,
  fetchOutboxStatuses,
  seedOutboxEvent,
  seedTenantRoster,
  WORKER_IDS,
} from './helpers';

/**
 * The DB is the source of truth. The real broker publisher must only let an
 * event become PUBLISHED when Redis actually accepted the write; a broker
 * rejection has to leave the event re-claimable (RETRY), never silently
 * PUBLISHED — the exact regression the stub publisher caused.
 */
describe('outbox dispatcher — real Redis Streams publisher', () => {
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
    await clearOutbox(adminDatabaseUrl);
    await redis.flushall();
  });

  afterAll(async () => {
    await redis.quit().catch(() => redis.disconnect());
    await container.stop();
  });

  async function setTraceparent(id: string, traceparent: string): Promise<void> {
    const admin = postgres(adminDatabaseUrl, { max: 1 });
    try {
      await admin`
        UPDATE chai.outbox_event SET traceparent = ${traceparent} WHERE id = ${id}
      `;
    } finally {
      await admin.end();
    }
  }

  async function dispatchOnce(): Promise<void> {
    const worker = createDatabase(workerDatabaseUrl);
    try {
      await runOutboxDispatcher({
        database: worker,
        iterations: 1,
        options: {
          leaseMs: 5_000,
          limit: 10,
          maxAttempts: 3,
          pollIntervalMs: 10,
          retryBackoffMs: 0,
        },
        publisher: new RedisStreamsOutboxPublisher(redis),
        tenants: [{ principalId: WORKER_IDS.userA, tenantId: WORKER_IDS.tenantA }],
      });
    } finally {
      await worker.end();
    }
  }

  it('publishes to Redis, carries the traceparent, and marks PUBLISHED', async () => {
    const traceparent =
      '00-a1b2c3d4e5f60718293a4b5c6d7e8f90-0102030405060708-01';
    await seedOutboxEvent(adminDatabaseUrl, WORKER_IDS.outboxOne, 'message.delivered');
    await setTraceparent(WORKER_IDS.outboxOne, traceparent);

    await dispatchOnce();

    const statuses = await fetchOutboxStatuses(adminDatabaseUrl);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.status).toBe('PUBLISHED');

    const streamKey = outboxStreamKey('message.delivered');
    expect(await redis.xlen(streamKey)).toBe(1);

    const reply = await redis.xrange(streamKey, '-', '+');
    const entry = Array.isArray(reply) ? reply[0] : undefined;
    const flat = Array.isArray(entry) ? entry[1] : undefined;
    const fields: Record<string, string> = {};
    if (Array.isArray(flat)) {
      for (let index = 0; index + 1 < flat.length; index += 2) {
        const key = flat[index];
        const value = flat[index + 1];
        if (typeof key === 'string' && typeof value === 'string') {
          fields[key] = value;
        }
      }
    }
    expect(fields['event_id']).toBe(WORKER_IDS.outboxOne);
    expect(fields['traceparent']).toBe(traceparent);
  });

  it('marks the event RETRY (not PUBLISHED) when Redis rejects the write', async () => {
    await seedOutboxEvent(adminDatabaseUrl, WORKER_IDS.outboxOne, 'message.delivered');
    // Poison the target stream key so XADD hits a WRONGTYPE reply — a real broker
    // failure. The event must fall back to the DB-driven retry path.
    await redis.set(outboxStreamKey('message.delivered'), 'not-a-stream');

    await dispatchOnce();

    const statuses = await fetchOutboxStatuses(adminDatabaseUrl);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.status).toBe('RETRY');
    expect(statuses[0]?.attempts).toBe(1);
  });

  it('delivers dispatched event to RedisStreamsConsumer with deduplication by eventId (REQ-17-044, REQ-06-010)', async () => {
    const eventType = 'payment.paid';
    await seedOutboxEvent(adminDatabaseUrl, WORKER_IDS.outboxOne, eventType);

    await dispatchOnce();

    const streamKey = outboxStreamKey(eventType);
    const consumer = new RedisStreamsConsumer({
      consumerName: 'worker-1',
      group: 'g-payment-consumer',
      groupStartId: '0',
      redis,
      streamKey,
    });
    await consumer.ensureGroup();

    const received: string[] = [];
    const handled = await consumer.pollOnce({
      blockMs: 100,
      handler: async (msg) => {
        received.push(msg.eventId);
      },
      minIdleMs: 0,
    });

    expect(handled).toBe(1);
    expect(received).toEqual([WORKER_IDS.outboxOne]);

    // Simulate at-least-once redelivery of the same event entry
    const publisher = new RedisStreamsOutboxPublisher(redis);
    await publisher.publish({
      aggregateId: WORKER_IDS.outboxOne,
      aggregateType: 'payment',
      aggregateVersion: 1,
      attempts: 1,
      eventType,
      id: WORKER_IDS.outboxOne,
      partitionKey: WORKER_IDS.outboxOne,
      payload: { amountCents: 10000 },
      schemaVersion: 1,
      tenantId: WORKER_IDS.tenantA,
      traceparent: null,
    });

    const secondHandled = await consumer.pollOnce({
      blockMs: 100,
      handler: async (msg) => {
        received.push(msg.eventId);
      },
      minIdleMs: 0,
    });

    expect(secondHandled).toBe(0);
    expect(received).toEqual([WORKER_IDS.outboxOne]);
  });
});
