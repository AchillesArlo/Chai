// ponytail: end-to-end event chain wiring.
// Webhook → Outbox → Realtime Gateway → SSE → Inbox (<3s target).
// This module orchestrates the full chain in-process; swap segments for real brokers when scaling.

/**
 * Conversation event types (mirrors realtime-gateway bus).
 */
export type ConversationEventType =
  | 'conversation.created'
  | 'conversation.updated';

export interface ConversationEventPayload {
  assigneeUserId: string | null;
  contactId: string;
  externalUserId: string;
  id: string;
  lastMessageAt: string;
  mode: string;
  provider: string;
  status: string;
  version: number;
}

export interface ConversationEvent {
  type: ConversationEventType;
  tenantId: string;
  conversationId: string;
  payload: ConversationEventPayload;
}

/**
 * Realtime bus interface (mirrors realtime-gateway RealtimeBus).
 */
export interface RealtimeBus {
  publish(channel: string, event: ConversationEvent): void;
  subscribe(channel: string, handler: (event: ConversationEvent) => void): () => void;
}

/**
 * Auto-assignment engine interface (structural typing — avoids circular import).
 */
export interface AssignmentEngineLike {
  assign(context: { conversationId: string; requiredSkills?: string[]; tenantId: string }, strategy?: 'round-robin' | 'skill-based'): {
    agentId: string | null;
    reason: string;
    strategy: 'round-robin' | 'skill-based';
  };
}

/**
 * Idempotency store interface (structural typing).
 */
export interface IdempotencyStoreLike {
  tryClaim(tenantId: string, eventId: string): boolean;
  record(tenantId: string, eventId: string, result: 'processed' | 'failed', resultData?: unknown): unknown;
}

/**
 * Webhook event input (raw from provider).
 */
export interface WebhookInput {
  externalEventId: string;
  payload: unknown;
  provider: string;
  providerAccountId: string;
  tenantId: string;
}

/**
 * Outbox event record.
 */
export interface OutboxEventRecord {
  aggregateId: string;
  aggregateType: string;
  aggregateVersion: number;
  eventType: string;
  id: string;
  partitionKey: string;
  payload: unknown;
  schemaVersion: number;
  tenantId: string;
}

/**
 * Chain processing result.
 */
export interface ChainResult {
  assigned: boolean;
  agentId: string | null;
  acknowledged: boolean;
  deduplicated: boolean;
  event: ConversationEvent | null;
  inboxEventId: string;
  latencyMs: number;
  outboxEventId: string;
  published: boolean;
  tenantId: string;
  webhookEventId: string;
}

/**
 * Chain stage handlers — inject real implementations when wiring.
 */
export interface ChainHandlers {
  appendOutbox: (event: Omit<OutboxEventRecord, 'id'>) => Promise<OutboxEventRecord>;
  appendInbox: (event: { externalEventId: string; payloadReference: string; provider: string; providerAccountId: string; schemaVersion: number; tenantId: string }) => Promise<string>;
  publishToRealtime: (channel: string, event: ConversationEvent) => Promise<void>;
  assignmentEngine: AssignmentEngineLike;
  idempotencyStore: IdempotencyStoreLike;
  realtimeBus?: RealtimeBus;
}

/**
 * End-to-end event chain processor.
 * Target: <3s from webhook receipt to inbox delivery.
 */
export class EventChainProcessor {
  constructor(private handlers: ChainHandlers) {}

  /**
   * Process a webhook event through the full chain.
   */
  async processWebhook(input: WebhookInput): Promise<ChainResult> {
    const startTime = Date.now();

    // 1. Idempotency check — dedup by externalEventId
    const deduplicated = !this.handlers.idempotencyStore.tryClaim(input.tenantId, input.externalEventId);
    if (deduplicated) {
      return {
        acknowledged: false,
        agentId: null,
        assigned: false,
        deduplicated: true,
        event: null,
        inboxEventId: '',
        latencyMs: Date.now() - startTime,
        outboxEventId: '',
        published: false,
        tenantId: input.tenantId,
        webhookEventId: input.externalEventId,
      };
    }

    // 2. Append to outbox (transactional outbox pattern)
    const outboxEvent = await this.handlers.appendOutbox({
      aggregateId: input.externalEventId,
      aggregateType: 'webhook',
      aggregateVersion: 1,
      eventType: `${input.provider}.webhook.received`,
      partitionKey: `${input.tenantId}:${input.providerAccountId}`,
      payload: input.payload,
      schemaVersion: 1,
      tenantId: input.tenantId,
    });

    // 3. Publish to realtime bus (→ SSE gateway)
    const conversationEvent: ConversationEvent = {
      conversationId: input.externalEventId,
      payload: {
        assigneeUserId: null,
        contactId: input.providerAccountId,
        externalUserId: input.externalEventId,
        id: outboxEvent.id,
        lastMessageAt: new Date().toISOString(),
        mode: 'AI_ACTIVE',
        provider: input.provider,
        status: 'NEW',
        version: 1,
      },
      tenantId: input.tenantId,
      type: 'conversation.created',
    };

    await this.handlers.publishToRealtime(`tenant:${input.tenantId}`, conversationEvent);

    // 4. Auto-assign the conversation
    const assignment = this.handlers.assignmentEngine.assign({
      conversationId: input.externalEventId,
      tenantId: input.tenantId,
    });

    // 5. Append to inbox (at-least-once delivery)
    const inboxEventId = await this.handlers.appendInbox({
      externalEventId: input.externalEventId,
      payloadReference: outboxEvent.id,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      schemaVersion: 1,
      tenantId: input.tenantId,
    });

    // 6. Record successful processing
    this.handlers.idempotencyStore.record(
      input.tenantId,
      input.externalEventId,
      'processed',
      { inboxEventId, outboxEventId: outboxEvent.id }
    );

    return {
      acknowledged: true,
      agentId: assignment.agentId,
      assigned: assignment.agentId !== null,
      deduplicated: false,
      event: conversationEvent,
      inboxEventId,
      latencyMs: Date.now() - startTime,
      outboxEventId: outboxEvent.id,
      published: true,
      tenantId: input.tenantId,
      webhookEventId: input.externalEventId,
    };
  }

  /**
   * Check if the chain is meeting the <3s SLA.
   */
  static meetsSla(latencyMs: number): boolean {
    return latencyMs < 3000;
  }
}

/**
 * Create an event chain processor with the given handlers.
 */
export function createEventChainProcessor(handlers: ChainHandlers): EventChainProcessor {
  return new EventChainProcessor(handlers);
}

