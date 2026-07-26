import { Inject, Injectable } from '@nestjs/common';

import type { InboundEvent } from '@chai/connector-sdk';
import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';
import {
  getConversation,
  ingestInboundEvent,
  markInboxEventProcessed,
  recordInboxEvent,
  resolveConversation,
  resumeAiConversation,
  takeOverConversation,
  type ConversationSummary as DomainConversationSummary,
} from '@chai/domain';

import {
  DATABASE,
  SERVICE_PRINCIPAL_ID,
} from '../../database/database.module';
import type {
  AssignmentResult,
  ConversationSummary,
  IngestOutcome,
} from '../shared/conversation.port';
import { ConversationRepository } from '../shared/conversation.port';

interface ListedRow {
  assignee_user_id: string | null;
  contact_id: string;
  external_user_id: string | null;
  id: string;
  last_message_at: Date;
  mode: string;
  status: string;
  version: number;
}

/**
 * Postgres-backed ConversationRepository. Requires DATABASE_URL and seeded
 * tenant rows for RLS. Webhook ingest uses SERVICE_PRINCIPAL_ID.
 */
@Injectable()
export class PostgresConversationRepository extends ConversationRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  /**
   * Persists the verified provider event in the transactional inbox BEFORE any
   * domain effect, then processes it inline in the same transaction (GAP-003).
   *
   * Ordering matters: the inbox row is what makes the acknowledgement safe. A
   * redelivery collapses on the inbox unique constraint, and an inline failure
   * rolls back to a PENDING row that the dispatcher retries under a lease.
   */
  override async ingest(event: InboundEvent): Promise<IngestOutcome> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId: event.tenantId },
      async (tx) => {
        const recorded = await recordInboxEvent(tx, {
          externalEventId: event.externalEventId,
          payload: JSON.stringify(event),
          payloadReference: `inbox:${event.provider}:${event.externalEventId}`,
          provider: event.provider,
          providerAccountId: event.channelAccount,
          tenantId: event.tenantId,
        });
        if (recorded.duplicate) {
          return { conversationId: null, created: false, duplicate: true };
        }

        const result = await ingestInboundEvent(tx, {
          channelAccount: event.channelAccount,
          content: event.content,
          externalEventId: event.externalEventId,
          externalMessageId: event.externalMessageId,
          externalUserId: event.externalUserId,
          provider: event.provider,
          providerTimestamp: event.providerTimestamp,
          tenantId: event.tenantId,
        });
        await markInboxEventProcessed(tx, recorded.id);
        return {
          conversationId: result.conversation.id,
          created: result.created,
          duplicate: false,
        };
      },
    );
  }

  override async listConversations(
    tenantId: string,
    principalId = SERVICE_PRINCIPAL_ID,
  ): Promise<ConversationSummary[]> {
    return withTenantTransaction(
      this.database,
      { principalId, tenantId },
      async (tx) => {
        const rows = await tx<ListedRow[]>`
          SELECT
            c.id,
            c.contact_id,
            c.status,
            c.mode,
            c.last_message_at,
            c.assignee_user_id,
            c.version,
            (
              SELECT ci.external_user_id
              FROM chai.contact_identity ci
              WHERE ci.contact_id = c.contact_id
              ORDER BY ci.last_seen_at DESC
              LIMIT 1
            ) AS external_user_id
          FROM chai.conversation c
          ORDER BY c.last_message_at DESC
          LIMIT 100
        `;
        return rows.map((row) => this.mapListed(row));
      },
    );
  }

  override async takeOver(
    tenantId: string,
    conversationId: string,
    assigneeId: string,
    expectedVersion: number,
  ): Promise<AssignmentResult> {
    return this.mutate(
      tenantId,
      conversationId,
      expectedVersion,
      assigneeId,
      (tx) => takeOverConversation(tx, conversationId, assigneeId, expectedVersion),
    );
  }

  override async resumeAi(
    tenantId: string,
    conversationId: string,
    expectedVersion: number,
  ): Promise<AssignmentResult> {
    return this.mutate(
      tenantId,
      conversationId,
      expectedVersion,
      SERVICE_PRINCIPAL_ID,
      (tx) => resumeAiConversation(tx, conversationId, expectedVersion),
    );
  }

  override async resolve(
    tenantId: string,
    conversationId: string,
    expectedVersion: number,
  ): Promise<AssignmentResult> {
    return this.mutate(
      tenantId,
      conversationId,
      expectedVersion,
      SERVICE_PRINCIPAL_ID,
      (tx) => resolveConversation(tx, conversationId, expectedVersion),
    );
  }

  private async mutate(
    tenantId: string,
    conversationId: string,
    expectedVersion: number,
    principalId: string,
    apply: (
      tx: DatabaseTransaction,
    ) => Promise<DomainConversationSummary | null>,
  ): Promise<AssignmentResult> {
    return withTenantTransaction(
      this.database,
      { principalId, tenantId },
      async (tx) => {
        const current = await getConversation(tx, conversationId);
        if (!current) return { kind: 'not_found' as const };
        if (current.version !== expectedVersion) {
          return { kind: 'version_conflict' as const };
        }
        const updated = await apply(tx);
        if (!updated) return { kind: 'version_conflict' as const };
        return {
          kind: 'ok' as const,
          conversation: this.mapDomain(updated),
        };
      },
    );
  }

  private mapDomain(row: DomainConversationSummary): ConversationSummary {
    return {
      assigneeUserId: row.assigneeUserId,
      contactId: row.contactId,
      externalUserId: '',
      id: row.id,
      lastMessageAt: row.lastMessageAt,
      mode: row.mode,
      provider: 'mock-channel',
      status: row.status,
      version: row.version,
    };
  }

  private mapListed(row: ListedRow): ConversationSummary {
    return {
      assigneeUserId: row.assignee_user_id,
      contactId: row.contact_id,
      externalUserId: row.external_user_id ?? '',
      id: row.id,
      lastMessageAt: row.last_message_at,
      mode: row.mode,
      provider: 'mock-channel',
      status: row.status,
      version: row.version,
    };
  }
}
