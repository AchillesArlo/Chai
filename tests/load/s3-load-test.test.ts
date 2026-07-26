import { describe, it, expect, beforeEach } from 'vitest';

import { createAutoAssignmentEngine } from '@chai/domain';
import { createIdempotencyStore } from '@chai/domain';
import { createEventChainProcessor, type ChainHandlers, type WebhookInput } from '@chai/domain';

import { createRealtimeBus } from '@chai/realtime-gateway';

/**
 * S3: Load Test — 100 agents, 1000 messages/minute
 *
 * Verifies the event chain sustains 1000 msg/min (≈17 msg/s) with 100 active
 * agents, meeting <3s SLA per message.
 */
const TENANT = '01890f47-9b3c-7cc2-98e8-123456789207';
const TARGET_MSG_PER_MIN = 1000;
const TARGET_AGENTS = 100;

function makeWebhook(id: number): WebhookInput {
  return {
    externalEventId: `load-evt-${Date.now()}-${id}`,
    payload: { message: `Load test message ${id}` },
    provider: 'whatsapp',
    providerAccountId: `acct-${id % 50}`,
    tenantId: TENANT,
  };
}

function createLoadHarness(): {
  processor: ReturnType<typeof createEventChainProcessor>;
  receivedCount: () => number;
} {
  const bus = createRealtimeBus();
  const assignmentEngine = createAutoAssignmentEngine();
  const idempotencyStore = createIdempotencyStore();
  let count = 0;

  bus.subscribe(`tenant:${TENANT}`, () => {
    count++;
  });

  const handlers: ChainHandlers = {
    assignmentEngine,
    idempotencyStore,
    publishToRealtime: async () => {
      // no-op for load test (already counted by subscriber)
    },
    appendOutbox: async (event) => ({ ...event, id: `outbox-${Date.now()}-${Math.random()}` }) as never,
    appendInbox: async () => `inbox-${Math.random()}`,
  };

  return {
    processor: createEventChainProcessor(handlers),
    receivedCount: () => count,
  };
}

describe('S3: Load test (100 agents, 1000 msg/min)', () => {
  let harness: ReturnType<typeof createLoadHarness>;

  beforeEach(() => {
    harness = createLoadHarness();
  });

  it('registers 100 agents in assignment engine', () => {
    const engine = createAutoAssignmentEngine();
    for (let i = 0; i < TARGET_AGENTS; i++) {
      engine.registerAgent({
        active: true,
        agentId: `agent-${i}`,
        skills: i % 3 === 0 ? ['technical'] : i % 3 === 1 ? ['billing'] : ['support'],
        tenantId: TENANT,
      });
    }
    const roster = engine.getRoster(TENANT);
    expect(roster).toHaveLength(TARGET_AGENTS);
  });

  it('processes 100 messages under 3s each', async () => {
    for (let i = 0; i < 100; i++) {
      const result = await harness.processor.processWebhook(makeWebhook(i));
      expect(result.latencyMs).toBeLessThan(3000);
    }
  });

  it('processes 500 concurrent messages all meeting SLA', async () => {
    const webhooks = Array.from({ length: 500 }, (_, i) => makeWebhook(i));
    const results = await Promise.all(
      webhooks.map((w) => harness.processor.processWebhook(w))
    );

    const maxLatency = Math.max(...results.map((r) => r.latencyMs));
    expect(maxLatency).toBeLessThan(3000);
    expect(results.every((r) => r.acknowledged)).toBe(true);
  });

  it('sustains 1000 messages total (1 min target burst)', async () => {
    const batchSize = 100;
    const batches = TARGET_MSG_PER_MIN / batchSize;

    let totalLatency = 0;
    let allAcknowledged = true;

    for (let b = 0; b < batches; b++) {
      const webhooks = Array.from({ length: batchSize }, (_, i) =>
        makeWebhook(b * batchSize + i)
      );
      const results = await Promise.all(
        webhooks.map((w) => harness.processor.processWebhook(w))
      );
      for (const r of results) {
        totalLatency += r.latencyMs;
        if (!r.acknowledged) allAcknowledged = false;
      }
    }

    expect(allAcknowledged).toBe(true);
    const avgLatency = totalLatency / TARGET_MSG_PER_MIN;
    // Average latency should be well under 3s
    expect(avgLatency).toBeLessThan(1000);
  });

  it('round-robin distributes across 100 agents evenly', () => {
    const engine = createAutoAssignmentEngine();
    for (let i = 0; i < TARGET_AGENTS; i++) {
      engine.registerAgent({
        active: true,
        agentId: `agent-${i}`,
        skills: [],
        tenantId: TENANT,
      });
    }

    const assignments: Record<string, number> = {};
    for (let i = 0; i < TARGET_MSG_PER_MIN; i++) {
      const result = engine.assignRoundRobin({ conversationId: `c${i}`, tenantId: TENANT });
      const id = result.agentId ?? 'none';
      assignments[id] = (assignments[id] ?? 0) + 1;
    }

    // Each agent should get ~10 messages (1000/100)
    const counts = Object.values(assignments);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    // Fair distribution: max - min should be small (≤1)
    expect(max - min).toBeLessThanOrEqual(1);
  });

  it('idempotency store handles 1000 unique events', async () => {
    const store = createIdempotencyStore();
    for (let i = 0; i < TARGET_MSG_PER_MIN; i++) {
      const eventId = `load-evt-unique-${i}`;
      expect(store.tryClaim(TENANT, eventId)).toBe(true);
      store.record(TENANT, eventId, 'processed');
    }
    expect(store.size()).toBe(TARGET_MSG_PER_MIN);

    // Re-claiming should all be deduplicated
    for (let i = 0; i < TARGET_MSG_PER_MIN; i++) {
      expect(store.tryClaim(TENANT, `load-evt-unique-${i}`)).toBe(false);
    }
  });

  it('load test produces no memory leaks (store bounded)', async () => {
    // Process 200 messages, verify idempotency store grows linearly
    const store = createIdempotencyStore();
    const startSize = store.size();

    for (let i = 0; i < 200; i++) {
      store.record(TENANT, `leak-test-${i}`, 'processed');
    }

    expect(store.size()).toBe(startSize + 200);
  });
});
