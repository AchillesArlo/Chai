import { describe, it, expect, beforeEach } from 'vitest';

import { serializeServerSentEvent } from '@chai/realtime-gateway';

import { createIntegrationHarness, sampleWebhook } from './harness';

/**
 * S1.2: SSE Realtime Delivery to Frontend
 *
 * Verifies that events published to the realtime bus are serialized
 * correctly and can be consumed via SSE (the frontend useInboxStream path).
 */
describe('S1.2: SSE realtime delivery', () => {
  let harness: ReturnType<typeof createIntegrationHarness>;

  beforeEach(() => {
    harness = createIntegrationHarness();
  });

  it('serializes events to SSE wire format', () => {
    const event = {
      data: { message: 'hello' },
      event: 'MESSAGE_RECEIVED',
      id: 'evt-1',
    };
    const wire = serializeServerSentEvent(event);
    expect(wire).toContain('event: MESSAGE_RECEIVED');
    expect(wire).toContain('id: evt-1');
    expect(wire).toContain('data: ');
  });

  it('event store serves latest events for SSE replay', async () => {
    const webhook = sampleWebhook();
    await harness.processor.processWebhook(webhook);

    const events = await harness.eventStore.replay(
      '01890f47-9b3c-7cc2-98e8-123456789207',
      null,
      10
    );
    expect(events.length).toBeGreaterThan(0);

    // Verify events are SSE-serializable
    for (const event of events) {
      const wire = serializeServerSentEvent(event);
      expect(wire).toContain('event: ');
      expect(wire).toContain('data: ');
    }
  });

  it('event store supports cursor-based pagination (eventsAfter)', async () => {
    // Publish 3 events
    const events: string[] = [];
    for (let i = 0; i < 3; i++) {
      const result = await harness.processor.processWebhook(
        sampleWebhook({ externalEventId: `evt-cursor-${i}` })
      );
      events.push(result.outboxEventId);
    }

    const store = harness.eventStore;
    const tenant = '01890f47-9b3c-7cc2-98e8-123456789207';

    // Get all events (latest via replay with null cursor)
    const all = await store.replay(tenant, null, 10);
    expect(all.length).toBe(3);

    // Get events after the first one
    const firstId = all[0]?.id ?? null;
    const after = await store.replay(tenant, firstId, 10);
    expect(after.length).toBe(2);
  });

  it('delivers conversation.created event to subscriber', async () => {
    let receivedType: string | null = null;
    harness.bus.subscribe(`tenant:01890f47-9b3c-7cc2-98e8-123456789207`, (event) => {
      receivedType = event.type;
    });

    await harness.processor.processWebhook(sampleWebhook());

    expect(receivedType).toBe('conversation.created');
  });

  it('broadcasts to all subscribers on the same channel', async () => {
    const received1: unknown[] = [];
    const received2: unknown[] = [];

    harness.bus.subscribe(`tenant:01890f47-9b3c-7cc2-98e8-123456789207`, (e) => {
      received1.push(e);
    });
    harness.bus.subscribe(`tenant:01890f47-9b3c-7cc2-98e8-123456789207`, (e) => {
      received2.push(e);
    });

    await harness.processor.processWebhook(sampleWebhook());

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });
});
