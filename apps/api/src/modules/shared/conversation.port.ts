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
}
