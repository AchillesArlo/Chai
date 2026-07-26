import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  EventChainProcessor,
  createEventChainProcessor,
} from './processor';
import type { ChainHandlers, WebhookInput } from './processor';
import { createIdempotencyStore, type IdempotencyStore } from '../idempotency/consumer';
import { createAutoAssignmentEngine, type AutoAssignmentEngine } from '../auto-assignment/engine';

const TENANT = '01890f47-9b3c-7cc2-98e8-123456789207';

function makeHandlers(overrides: Partial<ChainHandlers> = {}): ChainHandlers {
  return {
    appendInbox: vi.fn().mockResolvedValue('inbox-1'),
    appendOutbox: vi.fn().mockResolvedValue({
      aggregateId: 'ext-1',
      aggregateType: 'webhook',
      aggregateVersion: 1,
      eventType: 'whatsapp.webhook.received',
      id: 'outbox-1',
      partitionKey: 't:acct',
      payload: {},
      schemaVersion: 1,
      tenantId: TENANT,
    }),
    assignmentEngine: createAutoAssignmentEngine(),
    idempotencyStore: createIdempotencyStore(),
    publishToRealtime: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeWebhook(overrides: Partial<WebhookInput> = {}): WebhookInput {
  return {
    externalEventId: 'evt-1',
    payload: { message: 'hello' },
    provider: 'whatsapp',
    providerAccountId: 'acct-1',
    tenantId: TENANT,
    ...overrides,
  };
}

describe('EventChainProcessor', () => {
  let processor: EventChainProcessor;
  let handlers: ChainHandlers;

  beforeEach(() => {
    handlers = makeHandlers();
    processor = createEventChainProcessor(handlers);
  });

  it('processes webhook through the full chain', async () => {
    const result = await processor.processWebhook(makeWebhook());

    expect(result.acknowledged).toBe(true);
    expect(result.deduplicated).toBe(false);
    expect(result.outboxEventId).toBe('outbox-1');
    expect(result.inboxEventId).toBe('inbox-1');
    expect(result.published).toBe(true);
    expect(result.event).not.toBeNull();
    expect(result.event?.type).toBe('conversation.created');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('appends to outbox with correct event type', async () => {
    await processor.processWebhook(makeWebhook());

    expect(handlers.appendOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateType: 'webhook',
        eventType: 'whatsapp.webhook.received',
        tenantId: TENANT,
      })
    );
  });

  it('publishes to realtime channel', async () => {
    await processor.processWebhook(makeWebhook());

    expect(handlers.publishToRealtime).toHaveBeenCalledWith(
      `tenant:${TENANT}`,
      expect.objectContaining({
        tenantId: TENANT,
        type: 'conversation.created',
      })
    );
  });

  it('appends to inbox with outbox event reference', async () => {
    await processor.processWebhook(makeWebhook());

    expect(handlers.appendInbox).toHaveBeenCalledWith(
      expect.objectContaining({
        externalEventId: 'evt-1',
        payloadReference: 'outbox-1',
        provider: 'whatsapp',
        tenantId: TENANT,
      })
    );
  });

  it('deduplicates repeated webhooks', async () => {
    const webhook = makeWebhook();
    const r1 = await processor.processWebhook(webhook);
    const r2 = await processor.processWebhook(webhook);

    expect(r1.deduplicated).toBe(false);
    expect(r1.acknowledged).toBe(true);
    expect(r2.deduplicated).toBe(true);
    expect(r2.acknowledged).toBe(false);
  });

  it('records processing in idempotency store', async () => {
    const store = handlers.idempotencyStore as IdempotencyStore;
    await processor.processWebhook(makeWebhook());

    expect(store.has(TENANT, 'evt-1')).toBe(true);
  });

  it('assigns agent when available', async () => {
    const engine = handlers.assignmentEngine as AutoAssignmentEngine;
    engine.registerAgent({
      active: true,
      agentId: 'agent-1',
      skills: [],
      tenantId: TENANT,
    });
    processor = createEventChainProcessor(handlers);

    const result = await processor.processWebhook(makeWebhook());

    expect(result.assigned).toBe(true);
    expect(result.agentId).toBe('agent-1');
  });

  it('marks unassigned when no agents available', async () => {
    const result = await processor.processWebhook(makeWebhook());
    expect(result.assigned).toBe(false);
    expect(result.agentId).toBeNull();
  });
});

describe('EventChainProcessor SLA', () => {
  it('meets SLA for sub-3s latency', () => {
    expect(EventChainProcessor.meetsSla(500)).toBe(true);
    expect(EventChainProcessor.meetsSla(2999)).toBe(true);
  });

  it('fails SLA for 3s+ latency', () => {
    expect(EventChainProcessor.meetsSla(3000)).toBe(false);
    expect(EventChainProcessor.meetsSla(5000)).toBe(false);
  });

  it('full chain completes under 3s in fast mock setup', async () => {
    const handlers = makeHandlers();
    const processor = createEventChainProcessor(handlers);

    const result = await processor.processWebhook(makeWebhook());

    expect(EventChainProcessor.meetsSla(result.latencyMs)).toBe(true);
  });
});
