import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { InboundEvent } from '@chai/connector-sdk';
import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';
import {
  claimIdempotentOperation,
  commitBusinessMutation,
  getConversation,
  ingestInboundEvent,
  markInboxEventProcessed,
  recordInboxEvent,
  resolveConversation,
  resumeAiConversation,
  settleOperation,
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
  OutboundMessageSummary,
  SendMessageInput,
  SendMessageResult,
} from '../shared/conversation.port';
import { ConversationRepository } from '../shared/conversation.port';

/**
 * Aborts a reply transaction so the idempotency claim made earlier in the same
 * transaction rolls back with it — a precondition failure must not consume the
 * caller's key or leave a dangling PROCESSING record.
 */
class ConversationReplyAbort extends Error {
  constructor(readonly kind: 'not_found' | 'version_conflict') {
    super(kind);
    this.name = 'ConversationReplyAbort';
  }
}

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

  /**
   * Records an operator reply and enqueues its outbound send in ONE transaction.
   *
   * Order matters (ADR-007, GAP-006):
   * 1. Claim the idempotency key first, so a retry replays the first message
   *    instead of sending twice — even if the retry carries a stale version.
   * 2. Guard the aggregate version, so a reply cannot race a state change.
   * 3. Bump the conversation, append the OUTBOUND/HUMAN message, and emit the
   *    `message.created` outbox event together via commitBusinessMutation — the
   *    provider call is a worker's job downstream, never inside this request.
   * A precondition failure throws, rolling the claim back so the key is free.
   */
  override async sendMessage(
    tenantId: string,
    conversationId: string,
    operatorId: string,
    expectedVersion: number,
    input: SendMessageInput,
  ): Promise<SendMessageResult> {
    try {
      return await withTenantTransaction(
        this.database,
        { principalId: operatorId, tenantId },
        async (tx): Promise<SendMessageResult> => {
          const claim = await claimIdempotentOperation(tx, {
            audience: 'client-portal',
            idempotencyKey: input.idempotencyKey,
            operation: 'conversation.reply',
            request: { conversationId, contentType: 'TEXT', text: input.text },
            tenantId,
          });
          if (claim.outcome === 'CONFLICT') {
            return { kind: 'idempotency_conflict' };
          }
          if (claim.outcome === 'REPLAY') {
            const replayed =
              claim.responseReference === null
                ? null
                : await this.readMessage(tx, claim.responseReference);
            if (!replayed) {
              // Claim and settle share one transaction, so a committed record
              // always carries its message; a missing one is corrupt state.
              throw new Error('CONVERSATION_REPLY_REPLAY_WITHOUT_MESSAGE');
            }
            return { kind: 'ok', duplicate: true, message: replayed };
          }

          const current = await getConversation(tx, conversationId);
          if (!current) throw new ConversationReplyAbort('not_found');
          if (current.version !== expectedVersion) {
            throw new ConversationReplyAbort('version_conflict');
          }

          const created = await commitBusinessMutation(tx, {
            describe: (result) => ({
              audit: {
                action: 'message.created',
                actorId: operatorId,
                metadata: {
                  direction: 'OUTBOUND',
                  messageId: result.id,
                  senderType: 'HUMAN',
                },
                resourceId: conversationId,
                resourceType: 'conversation',
              },
              events: [
                {
                  aggregateId: conversationId,
                  aggregateType: 'conversation',
                  aggregateVersion: result.version,
                  eventType: 'message.created',
                  partitionKey: conversationId,
                  payload: {
                    contentType: 'TEXT',
                    conversationId,
                    direction: 'OUTBOUND',
                    messageId: result.id,
                    senderType: 'HUMAN',
                    text: input.text,
                  },
                },
              ],
            }),
            mutate: async () => {
              const bumped = await tx<{ version: number }[]>`
                UPDATE chai.conversation
                SET last_message_at = now(), version = version + 1
                WHERE id = ${conversationId} AND version = ${expectedVersion}
                RETURNING version
              `;
              const version = bumped[0]?.version;
              // Lost an optimistic race between the read and the update.
              if (version === undefined) {
                throw new ConversationReplyAbort('version_conflict');
              }
              const inserted = await tx<{ created_at: Date; id: string }[]>`
                INSERT INTO chai.message (
                  id, tenant_id, conversation_id, external_message_id,
                  direction, sender_type, content_type, text_content, created_at
                )
                VALUES (
                  ${randomUUID()}, chai.current_tenant_id(), ${conversationId}, ${null},
                  'OUTBOUND', 'HUMAN', 'TEXT', ${input.text}, now()
                )
                RETURNING id, created_at
              `;
              const row = inserted[0];
              if (!row) throw new Error('message insert returned no row');
              return { createdAt: row.created_at, id: row.id, version };
            },
            tenantId,
          });

          await settleOperation(tx, {
            operationId: claim.operationId,
            recordId: claim.recordId,
            responseReference: created.id,
            status: 'SUCCEEDED',
          });

          return {
            kind: 'ok',
            duplicate: false,
            message: {
              contentType: 'TEXT',
              conversationId,
              createdAt: created.createdAt,
              direction: 'OUTBOUND',
              id: created.id,
              senderType: 'HUMAN',
              text: input.text,
            },
          };
        },
      );
    } catch (error) {
      if (error instanceof ConversationReplyAbort) {
        return { kind: error.kind };
      }
      throw error;
    }
  }

  private async readMessage(
    tx: DatabaseTransaction,
    messageId: string,
  ): Promise<OutboundMessageSummary | null> {
    const rows = await tx<
      {
        content_type: string;
        conversation_id: string;
        created_at: Date;
        direction: string;
        id: string;
        sender_type: string;
        text_content: string | null;
      }[]
    >`
      SELECT id, conversation_id, direction, sender_type, content_type, text_content, created_at
      FROM chai.message
      WHERE id = ${messageId}
      LIMIT 1
    `;
    const row = rows[0];
    return row
      ? {
          contentType: row.content_type,
          conversationId: row.conversation_id,
          createdAt: row.created_at,
          direction: row.direction,
          id: row.id,
          senderType: row.sender_type,
          text: row.text_content,
        }
      : null;
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
