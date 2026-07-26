// ponytail: S1 integration test harness — wires Frontend (api-client/SSE) ↔ Realtime (gateway) ↔ Worker (event chain).
// In-process orchestration; no real HTTP servers needed for the core chain assertion.

import {
  createEventChainProcessor,
  type ChainHandlers,
  type WebhookInput,
} from '@chai/domain';
import { createAutoAssignmentEngine } from '@chai/domain';
import { createIdempotencyStore } from '@chai/domain';
import { EventStore, type RealtimeBus, createRealtimeBus } from '@chai/realtime-gateway';

/**
 * In-memory test harness for the full event chain.
 * Each instance is isolated — no shared state between tests.
 */
export interface IntegrationHarness {
  bus: RealtimeBus;
  eventStore: EventStore;
  handlers: ChainHandlers;
  processor: ReturnType<typeof createEventChainProcessor>;
  receivedEvents: Array<{ channel: string; event: unknown }>;
  reset: () => void;
}

/**
 * Create an isolated integration harness.
 */
export function createIntegrationHarness(tenantId: string = '01890f47-9b3c-7cc2-98e8-123456789207'): IntegrationHarness {
  const bus = createRealtimeBus();
  const eventStore = new EventStore();
  const assignmentEngine = createAutoAssignmentEngine();
  const idempotencyStore = createIdempotencyStore();
  const receivedEvents: Array<{ channel: string; event: unknown }> = [];

  // Subscribe to all tenant channels to capture SSE delivery
  bus.subscribe(`tenant:${tenantId}`, (event) => {
    receivedEvents.push({ channel: `tenant:${tenantId}`, event });
  });

  const outboxStore: Map<string, unknown> = new Map();
  const inboxStore: Map<string, unknown> = new Map();
  let outboxCounter = 0;
  let inboxCounter = 0;

  const handlers: ChainHandlers = {
    assignmentEngine,
    idempotencyStore,
    publishToRealtime: async (channel, event) => {
      bus.publish(channel, event);
      // Also append to event store for SSE replay
      await eventStore.append(tenantId, {
        data: event,
        event: 'conversation.created',
        id: `evt-${Date.now()}-${outboxCounter++}`,
      });
    },
    appendOutbox: async (event) => {
      const id = `outbox-${Date.now()}-${outboxCounter++}`;
      const record = { ...event, id };
      outboxStore.set(id, record);
      return record as never;
    },
    appendInbox: async (event) => {
      const id = `inbox-${Date.now()}-${inboxCounter++}`;
      inboxStore.set(id, event);
      return id;
    },
  };

  const processor = createEventChainProcessor(handlers);

  return {
    bus,
    eventStore,
    handlers,
    processor,
    receivedEvents,
    reset: () => {
      receivedEvents.length = 0;
      outboxStore.clear();
      inboxStore.clear();
      idempotencyStore.clear();
      assignmentEngine.reset();
    },
  };
}

/**
 * Build a sample webhook input.
 */
export function sampleWebhook(overrides: Partial<WebhookInput> = {}): WebhookInput {
  return {
    externalEventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    payload: { from: '+15551234567', message: 'Hello, I need help' },
    provider: 'whatsapp',
    providerAccountId: 'acct-001',
    tenantId: '01890f47-9b3c-7cc2-98e8-123456789207',
    ...overrides,
  };
}
