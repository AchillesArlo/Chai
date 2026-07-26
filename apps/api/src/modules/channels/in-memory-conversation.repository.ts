import { randomUUID } from 'node:crypto';

import type { InboundEvent } from '@chai/connector-sdk';
import { requestHash } from '@chai/domain';

import type {
  AssignmentResult,
  ConversationSummary,
  IngestOutcome,
  OutboundMessageSummary,
  SendMessageInput,
  SendMessageResult,
} from '../shared/conversation.port';
import { ConversationRepository } from '../shared/conversation.port';

interface ConversationRecord {
  assigneeUserId: string | null;
  contactId: string;
  externalUserId: string;
  id: string;
  lastMessageAt: Date;
  mode: string;
  provider: string;
  status: string;
  tenantId: string;
  version: number;
}

interface OutboundMessageRecord extends OutboundMessageSummary {
  tenantId: string;
}

/** Mirrors one row the transactional outbox would carry for a reply. */
interface RecordedReplyEvent {
  aggregateVersion: number;
  conversationId: string;
  eventType: string;
  messageId: string;
  tenantId: string;
}

interface ReplyIdempotencyRecord {
  messageId: string;
  requestHash: string;
}

/**
 * In-memory ConversationRepository for the API e2e suite and local development.
 *
 * ponytail: a database-backed implementation replaces this once the API has a
 * runtime database connection (see @chai/domain conversations). The contract
 * stays identical, so the controller and webhook simulator do not change.
 */
export class InMemoryConversationRepository extends ConversationRepository {
  private readonly conversations = new Map<string, ConversationRecord>();
  private readonly identityIndex = new Map<string, string>();
  /**
   * Stands in for the inbox unique constraint so the double refuses a provider
   * redelivery exactly like the database path does.
   */
  private readonly seenProviderEvents = new Set<string>();
  /** Outbound messages, so a reply and its dedup can be asserted end to end. */
  private readonly messages: OutboundMessageRecord[] = [];
  /** Stands in for the transactional outbox rows a reply commits. */
  private readonly replyEvents: RecordedReplyEvent[] = [];
  /**
   * Stands in for chai.idempotency_record: same key + same body replays the
   * first message, same key + different body is a conflict.
   */
  private readonly replyIdempotency = new Map<string, ReplyIdempotencyRecord>();

  override async ingest(event: InboundEvent): Promise<IngestOutcome> {
    const eventKey = `${event.tenantId}:${event.provider}:${event.channelAccount}:${event.externalEventId}`;
    if (this.seenProviderEvents.has(eventKey)) {
      return { conversationId: null, created: false, duplicate: true };
    }
    this.seenProviderEvents.add(eventKey);

    const key = `${event.tenantId}:${event.channelAccount}:${event.externalUserId}`;
    const existingId = this.identityIndex.get(key);
    if (existingId) {
      const record = this.conversations.get(existingId);
      if (record) {
        record.lastMessageAt = event.providerTimestamp;
        record.status = 'OPEN';
        record.version += 1;
      }
      return { conversationId: existingId, created: false, duplicate: false };
    }

    const id = randomUUID();
    const record: ConversationRecord = {
      assigneeUserId: null,
      contactId: randomUUID(),
      externalUserId: event.externalUserId,
      id,
      lastMessageAt: event.providerTimestamp,
      mode: 'AI_ACTIVE',
      provider: event.provider,
      status: 'OPEN',
      tenantId: event.tenantId,
      version: 1,
    };
    this.conversations.set(id, record);
    this.identityIndex.set(key, id);

    return { conversationId: id, created: true, duplicate: false };
  }

  override async listConversations(
    tenantId: string,
  ): Promise<ConversationSummary[]> {
    return [...this.conversations.values()]
      .filter((record) => record.tenantId === tenantId)
      .map((record) => this.toSummary(record))
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  }

  override async takeOver(
    tenantId: string,
    conversationId: string,
    assigneeId: string,
    expectedVersion: number,
  ): Promise<AssignmentResult> {
    const record = this.find(tenantId, conversationId);
    if (!record) return { kind: 'not_found' };
    if (record.version !== expectedVersion) return { kind: 'version_conflict' };
    record.mode = 'HUMAN_ACTIVE';
    record.assigneeUserId = assigneeId;
    record.version += 1;
    return { kind: 'ok', conversation: this.toSummary(record) };
  }

  override async resumeAi(
    tenantId: string,
    conversationId: string,
    expectedVersion: number,
  ): Promise<AssignmentResult> {
    const record = this.find(tenantId, conversationId);
    if (!record) return { kind: 'not_found' };
    if (record.status !== 'OPEN' && record.status !== 'PENDING_AGENT') {
      return { kind: 'not_found' };
    }
    if (record.version !== expectedVersion) return { kind: 'version_conflict' };
    record.mode = 'AI_ACTIVE';
    record.assigneeUserId = null;
    record.version += 1;
    return { kind: 'ok', conversation: this.toSummary(record) };
  }

  override async resolve(
    tenantId: string,
    conversationId: string,
    expectedVersion: number,
  ): Promise<AssignmentResult> {
    const record = this.find(tenantId, conversationId);
    if (!record) return { kind: 'not_found' };
    if (record.version !== expectedVersion) return { kind: 'version_conflict' };
    record.status = 'RESOLVED';
    record.mode = 'PAUSED';
    record.version += 1;
    return { kind: 'ok', conversation: this.toSummary(record) };
  }

  override async sendMessage(
    tenantId: string,
    conversationId: string,
    operatorId: string,
    expectedVersion: number,
    input: SendMessageInput,
  ): Promise<SendMessageResult> {
    // Idempotency is resolved before the precondition, exactly like the database
    // path: a replay must return the first outcome even if the caller retries
    // with a now-stale version, so it can never surface as a version conflict.
    const claimKey = `${tenantId}:client-portal:conversation.reply:${input.idempotencyKey}`;
    const hash = requestHash({ conversationId, contentType: 'TEXT', text: input.text });
    const claimed = this.replyIdempotency.get(claimKey);
    if (claimed) {
      if (claimed.requestHash !== hash) return { kind: 'idempotency_conflict' };
      const original = this.messages.find((message) => message.id === claimed.messageId);
      if (!original) return { kind: 'not_found' };
      return { kind: 'ok', duplicate: true, message: this.toMessageSummary(original) };
    }

    const record = this.find(tenantId, conversationId);
    if (!record) return { kind: 'not_found' };
    if (record.version !== expectedVersion) return { kind: 'version_conflict' };

    // Business mutation + outbox event advance together, as they must in one
    // transaction on the database path.
    record.version += 1;
    record.lastMessageAt = new Date();
    const message: OutboundMessageRecord = {
      contentType: 'TEXT',
      conversationId,
      createdAt: new Date(),
      direction: 'OUTBOUND',
      id: randomUUID(),
      senderType: 'HUMAN',
      tenantId,
      text: input.text,
    };
    this.messages.push(message);
    this.replyIdempotency.set(claimKey, { messageId: message.id, requestHash: hash });
    this.replyEvents.push({
      aggregateVersion: record.version,
      conversationId,
      eventType: 'message.created',
      messageId: message.id,
      tenantId,
    });
    // operatorId is the human actor; recorded HUMAN (never AI) on the message.
    void operatorId;
    return { kind: 'ok', duplicate: false, message: this.toMessageSummary(message) };
  }

  /** Test view: outbound messages recorded on a conversation. */
  messagesFor(conversationId: string): OutboundMessageSummary[] {
    return this.messages
      .filter((message) => message.conversationId === conversationId)
      .map((message) => this.toMessageSummary(message));
  }

  /** Test view: reply outbox events recorded for a conversation. */
  replyEventsFor(conversationId: string): RecordedReplyEvent[] {
    return this.replyEvents.filter((event) => event.conversationId === conversationId);
  }

  private toMessageSummary(record: OutboundMessageRecord): OutboundMessageSummary {
    return {
      contentType: record.contentType,
      conversationId: record.conversationId,
      createdAt: record.createdAt,
      direction: record.direction,
      id: record.id,
      senderType: record.senderType,
      text: record.text,
    };
  }

  private find(tenantId: string, conversationId: string): ConversationRecord | undefined {
    const record = this.conversations.get(conversationId);
    if (!record || record.tenantId !== tenantId) return undefined;
    return record;
  }

  private toSummary(record: ConversationRecord): ConversationSummary {
    return {
      assigneeUserId: record.assigneeUserId,
      contactId: record.contactId,
      externalUserId: record.externalUserId,
      id: record.id,
      lastMessageAt: record.lastMessageAt,
      mode: record.mode,
      provider: record.provider,
      status: record.status,
      version: record.version,
    };
  }
}
