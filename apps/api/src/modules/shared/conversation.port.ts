// Shared kernel: the conversation aggregate is read by more than one module
// (channels ingests, assignment transitions ownership). The port lives here so a
// module never imports another module's repository — see the import-boundary rule
// in eslint.config.mjs (02 §5, GAP-009). Implementations stay in the owning module.
import type { InboundEvent } from '@chai/connector-sdk';

export interface ConversationSummary {
  assigneeUserId: string | null;
  contactId: string;
  externalUserId: string;
  id: string;
  lastMessageAt: Date;
  mode: string;
  provider: string;
  status: string;
  version: number;
}

export type AssignmentResult =
  | { kind: 'ok'; conversation: ConversationSummary }
  | { kind: 'not_found' }
  | { kind: 'version_conflict' };

/**
 * Persistence port for the channels/conversations vertical. The in-memory
 * implementation backs the API e2e suite; a database-backed implementation
 * (wrapping @chai/domain conversations under withTenantTransaction) is wired
 * when the API gains a runtime database connection.
 */
/**
 * Result of accepting one verified provider event.
 *
 * `duplicate` is true when the event was already recorded in the transactional
 * inbox, so no domain effect ran a second time (ADR-007). Callers must not
 * publish a realtime change for a duplicate.
 */
export interface IngestOutcome {
  conversationId: string | null;
  created: boolean;
  duplicate: boolean;
}

/**
 * Operator (human) reply to send on a conversation.
 *
 * `idempotencyKey` is the caller-supplied `Idempotency-Key` header: the actual
 * send to the provider is a worker's job via the outbox, and the platform must
 * never emit two outbound messages for one keyed request (ADR-007, 06_API §5).
 */
export interface SendMessageInput {
  idempotencyKey: string;
  text: string;
}

/** A recorded outbound message on the conversation aggregate. */
export interface OutboundMessageSummary {
  contentType: string;
  conversationId: string;
  createdAt: Date;
  direction: string;
  id: string;
  senderType: string;
  text: string | null;
}

/**
 * Result of an operator reply.
 *
 * `duplicate` marks a replay of an earlier keyed request: the same message is
 * returned and no second effect ran. `idempotency_conflict` is the same key
 * reused with a different body (06_API §5 IDEMPOTENCY_CONFLICT).
 */
export type SendMessageResult =
  | { kind: 'ok'; duplicate: boolean; message: OutboundMessageSummary }
  | { kind: 'not_found' }
  | { kind: 'version_conflict' }
  | { kind: 'idempotency_conflict' };

export abstract class ConversationRepository {
  abstract ingest(event: InboundEvent): Promise<IngestOutcome>;
  abstract listConversations(
    tenantId: string,
    principalId?: string,
  ): Promise<ConversationSummary[]>;
  abstract takeOver(
    tenantId: string,
    conversationId: string,
    assigneeId: string,
    expectedVersion: number,
  ): Promise<AssignmentResult>;
  abstract resumeAi(
    tenantId: string,
    conversationId: string,
    expectedVersion: number,
  ): Promise<AssignmentResult>;
  abstract resolve(
    tenantId: string,
    conversationId: string,
    expectedVersion: number,
  ): Promise<AssignmentResult>;
  /**
   * Records an operator (human) reply on the conversation aggregate and enqueues
   * the outbound send via the transactional outbox. The provider call itself is
   * a worker's job — the request never talks to a provider directly.
   */
  abstract sendMessage(
    tenantId: string,
    conversationId: string,
    operatorId: string,
    expectedVersion: number,
    input: SendMessageInput,
  ): Promise<SendMessageResult>;
}
