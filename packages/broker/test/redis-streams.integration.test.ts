import { randomUUID } from 'node:crypto';

import type { OutboxClaim } from '@chai/domain';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  createBrokerClient,
  outboxStreamKey,
  RedisStreamsConsumer,
  RedisStreamsOutboxPublisher,
  type BrokerClient,
  type OutboxStreamMessage,
} from '../src';

function makeClaim(overrides: Partial<OutboxClaim> = {}): OutboxClaim {
  return {
    aggregateId: '00000000-0000-0000-0000-0000000000aa',
    aggregateType: 'message',
    aggregateVersion: 1,
    attempts: 1,
    eventType: 'message.delivered',
    id: randomUUID(),
    partitionKey: 'pk-1',
    payload: { hello: 'world' },
    schemaVersion: 1,
    tenantId: '00000000-0000-0000-0000-0000000000bb',
    traceparent: null,
    ...overrides,
  };
}

/** Reads a stream entry's field map straight off the wire (no decode helper),
 * so the tests assert on what physically landed in Redis. */
async function firstEntryFields(
  client: BrokerClient,
  streamKey: string,
): Promise<Record<string, string>> {
  const reply = await client.xrange(streamKey, '-', '+');
  const record: Record<string, string> = {};
  const entry = Array.isArray(reply) ? reply[0] : undefined;
  const flat = Array.isArray(entry) ? entry[1] : undefined;
  if (Array.isArray(flat)) {
    for (let index = 0; index + 1 < flat.length; index += 2) {
      const key = flat[index];
      const value = flat[index + 1];
      if (typeof key === 'string' && typeof value === 'string') {
        record[key] = value;
      }
    }
  }
  return record;
}

describe('redis streams broker', () => {
  let container: StartedRedisContainer;
  let client: BrokerClient;

  beforeAll(async () => {
    container = await new RedisContainer('redis:7.4-alpine').start();
    client = createBrokerClient(container.getConnectionUrl());
  });

  afterEach(async () => {
    await client.flushall();
  });

  afterAll(async () => {
    await client.quit().catch(() => client.disconnect());
    await container.stop();
  });

  it('publishes an event to its per-type stream', async () => {
    const publisher = new RedisStreamsOutboxPublisher(client);
    const claim = makeClaim({ eventType: 'message.delivered' });

    const result = await publisher.publish(claim);

    expect(result).toBe('acked');
    const streamKey = outboxStreamKey('message.delivered');
    expect(await client.xlen(streamKey)).toBe(1);

    const fields = await firstEntryFields(client, streamKey);
    expect(fields['event_id']).toBe(claim.id);
    expect(fields['tenant_id']).toBe(claim.tenantId);
    expect(fields['event_type']).toBe('message.delivered');
    expect(fields['aggregate_type']).toBe('message');
    expect(fields['aggregate_id']).toBe(claim.aggregateId);
    expect(JSON.parse(fields['payload'] ?? 'null')).toEqual({ hello: 'world' });
  });

  it('carries the traceparent across the stream boundary', async () => {
    const publisher = new RedisStreamsOutboxPublisher(client);
    const traceparent =
      '00-a1b2c3d4e5f60718293a4b5c6d7e8f90-0102030405060708-01';

    expect(await publisher.publish(makeClaim({ traceparent }))).toBe('acked');

    const fields = await firstEntryFields(
      client,
      outboxStreamKey('message.delivered'),
    );
    expect(fields['traceparent']).toBe(traceparent);
  });

  it('omits traceparent when the event carries none', async () => {
    const publisher = new RedisStreamsOutboxPublisher(client);

    expect(await publisher.publish(makeClaim({ traceparent: null }))).toBe(
      'acked',
    );

    const fields = await firstEntryFields(
      client,
      outboxStreamKey('message.delivered'),
    );
    expect('traceparent' in fields).toBe(false);
  });

  it('reports failed (never acked) when Redis rejects the write', async () => {
    const publisher = new RedisStreamsOutboxPublisher(client);
    const claim = makeClaim({ eventType: 'message.poisoned' });
    // Poison the key: a string cannot take XADD, so Redis replies WRONGTYPE.
    // A real broker rejection must surface as 'failed', not a false 'acked'.
    await client.set(outboxStreamKey('message.poisoned'), 'not-a-stream');

    expect(await publisher.publish(claim)).toBe('failed');
  });

  it('delivers to a consumer group and leaves nothing pending after ack', async () => {
    const streamKey = outboxStreamKey('message.delivered');
    const consumer = new RedisStreamsConsumer({
      consumerName: 'live-1',
      group: 'g-deliver',
      redis: client,
      streamKey,
    });
    await consumer.ensureGroup();

    const publisher = new RedisStreamsOutboxPublisher(client);
    const claim = makeClaim();
    await publisher.publish(claim);

    const seen: OutboxStreamMessage[] = [];
    const handled = await consumer.pollOnce({
      blockMs: 100,
      handler: async (message) => {
        seen.push(message);
      },
      minIdleMs: 0,
    });

    expect(handled).toBe(1);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.eventId).toBe(claim.id);
    expect(seen[0]?.payload).toEqual({ hello: 'world' });

    // Nothing left pending: a second pass handles nothing.
    const again = await consumer.pollOnce({
      blockMs: 100,
      handler: async () => {
        throw new Error('handler must not run on an empty stream');
      },
      minIdleMs: 0,
    });
    expect(again).toBe(0);
  });

  it('does not reprocess an event id that was already acked', async () => {
    const streamKey = outboxStreamKey('message.delivered');
    const consumer = new RedisStreamsConsumer({
      consumerName: 'live-1',
      group: 'g-dedup',
      redis: client,
      streamKey,
    });
    await consumer.ensureGroup();

    const publisher = new RedisStreamsOutboxPublisher(client);
    const claim = makeClaim();
    // At-least-once by design: the same event id is delivered twice.
    await publisher.publish(claim);
    await publisher.publish(claim);
    expect(await client.xlen(streamKey)).toBe(2);

    let calls = 0;
    await consumer.pollOnce({
      blockMs: 100,
      handler: async () => {
        calls += 1;
      },
      minIdleMs: 0,
    });

    expect(calls).toBe(1);
  });

  it('reclaims a message a dead consumer left pending', async () => {
    const streamKey = outboxStreamKey('message.delivered');
    const consumer = new RedisStreamsConsumer({
      consumerName: 'live-1',
      group: 'g-claim',
      redis: client,
      streamKey,
    });
    await consumer.ensureGroup();

    const publisher = new RedisStreamsOutboxPublisher(client);
    const claim = makeClaim();
    await publisher.publish(claim);

    // A consumer reads the message then dies without acking it.
    await client.xreadgroup(
      'GROUP',
      'g-claim',
      'dead-1',
      'COUNT',
      10,
      'STREAMS',
      streamKey,
      '>',
    );

    const seen: OutboxStreamMessage[] = [];
    // idle threshold 0 → the stuck message is immediately reclaimable.
    const handled = await consumer.pollOnce({
      blockMs: 100,
      handler: async (message) => {
        seen.push(message);
      },
      minIdleMs: 0,
    });

    expect(handled).toBe(1);
    expect(seen[0]?.eventId).toBe(claim.id);
  });
});
