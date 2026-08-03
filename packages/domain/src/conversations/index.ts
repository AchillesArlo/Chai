import { randomUUID } from 'node:crypto';

import type { DatabaseTransaction } from '@chai/database';

import type { InboundContentType } from '@chai/connector-sdk';

import { commitBusinessMutation } from '../outbox/producer';

/**
 * Actor recorded when the platform itself ingests provider traffic. Audit rows
 * require an actor, and a webhook has no human behind it.
 */
export const SERVICE_ACTOR_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Platform worker service principal. Distinct from {@link SERVICE_ACTOR_ID} (a
 * v4 UUID) because principal ids are validated as UUIDv7 by ActorIdSchema /
 * withTenantTransaction. This is the exact literal chai.active_tenant_roster()
 * (migration 0050) hands every worker, so a worker that writes OUTSIDE the
 * roster loop — e.g. the message.received fact consumer — assumes the same
 * sanctioned identity instead of inventing its own.
 */
export const WORKER_SERVICE_PRINCIPAL_ID = '00000000-0000-7000-8000-000000000001';

export interface InboundEventInput {
  /** Actor recorded in the audit trail; defaults to the platform service identity. */
  actorId?: string;
  channelAccount: string;
  content: { contentType: InboundContentType; mediaRef?: string; text?: string };
  externalEventId: string;
  externalMessageId?: string;
  externalUserId: string;
  provider: string;
  providerTimestamp: Date;
  tenantId: string;
}

export interface ConversationSummary {
  assigneeUserId: string | null;
  contactId: string;
  id: string;
  lastMessageAt: Date;
  mode: string;
  status: string;
  version: number;
}

export interface IngestResult {
  contact: { id: string };
  conversation: ConversationSummary;
  created: boolean;
  message: { id: string };
}

interface ContactRow {
  id: string;
}

interface IdentityRow {
  contact_id: string;
}

interface ConversationRow {
  assignee_user_id: string | null;
  contact_id: string;
  id: string;
  last_message_at: Date;
  mode: string;
  status: string;
  version: number;
}

interface MessageRow {
  id: string;
}

/**
 * Ingests a single canonical inbound event: resolve-or-create the contact via
 * its channel identity, resolve-or-create the active conversation, and append
 * the message idempotently on the external message id. Every step is scoped to
 * the transaction's tenant context, so a webhook can never write across tenants.
 *
 * The state change, its audit entry, and the canonical `message.received` event
 * are committed together (ADR-007): a consumer can never observe a message that
 * has no event, and no event can describe a message that was rolled back.
 */
export async function ingestInboundEvent(
  transaction: DatabaseTransaction,
  event: InboundEventInput,
): Promise<IngestResult> {
  return commitBusinessMutation(transaction, {
    describe: (result) => ({
      audit: {
        action: 'message.received',
        actorId: event.actorId ?? SERVICE_ACTOR_ID,
        metadata: {
          channelAccount: event.channelAccount,
          externalEventId: event.externalEventId,
          messageId: result.message.id,
          provider: event.provider,
        },
        resourceId: result.conversation.id,
        resourceType: 'conversation',
      },
      events: [
        {
          aggregateId: result.conversation.id,
          aggregateType: 'conversation',
          aggregateVersion: result.conversation.version,
          eventType: 'message.received',
          partitionKey: result.conversation.id,
          payload: {
            contactId: result.contact.id,
            conversationCreated: result.created,
            conversationId: result.conversation.id,
            messageId: result.message.id,
            mode: result.conversation.mode,
            provider: event.provider,
            status: result.conversation.status,
          },
        },
      ],
    }),
    mutate: async () => {
      const contactId = await resolveContactId(transaction, event);
      const { conversation, created } = await resolveActiveConversation(
        transaction,
        contactId,
        event,
      );
      const message = await appendInboundMessage(
        transaction,
        conversation.id,
        event,
      );
      return {
        contact: { id: contactId },
        conversation: toSummary(conversation),
        created,
        message: { id: message.id },
      };
    },
    tenantId: event.tenantId,
  });
}

export async function listConversations(
  transaction: DatabaseTransaction,
): Promise<ConversationSummary[]> {
  const rows = await transaction<ConversationRow[]>`
    SELECT id, contact_id, status, mode, last_message_at, assignee_user_id, version
    FROM chai.conversation
    ORDER BY last_message_at DESC
    LIMIT 100
  `;

  return rows.map(toSummary);
}

/** Read one conversation under the current tenant RLS, or null if invisible. */
export async function getConversation(
  transaction: DatabaseTransaction,
  conversationId: string,
): Promise<ConversationSummary | null> {
  const rows = await transaction<ConversationRow[]>`
    SELECT id, contact_id, status, mode, last_message_at, assignee_user_id, version
    FROM chai.conversation
    WHERE id = ${conversationId}
    LIMIT 1
  `;
  const row = rows[0];
  return row ? toSummary(row) : null;
}

/**
 * Takes over a conversation for a human agent: switches mode to HUMAN_ACTIVE
 * and pins the assignee. Returns the updated conversation, or null if the
 * conversation is not visible under the current tenant (or version mismatches).
 */
export async function takeOverConversation(
  transaction: DatabaseTransaction,
  conversationId: string,
  assigneeId: string,
  expectedVersion?: number,
): Promise<ConversationSummary | null> {
  const rows =
    expectedVersion === undefined
      ? await transaction<ConversationRow[]>`
          UPDATE chai.conversation
          SET mode = 'HUMAN_ACTIVE',
              assignee_user_id = ${assigneeId},
              version = version + 1
          WHERE id = ${conversationId}
          RETURNING id, contact_id, status, mode, last_message_at, assignee_user_id, version
        `
      : await transaction<ConversationRow[]>`
          UPDATE chai.conversation
          SET mode = 'HUMAN_ACTIVE',
              assignee_user_id = ${assigneeId},
              version = version + 1
          WHERE id = ${conversationId}
            AND version = ${expectedVersion}
          RETURNING id, contact_id, status, mode, last_message_at, assignee_user_id, version
        `;
  const row = rows[0];
  return row ? toSummary(row) : null;
}

/**
 * Hands the conversation back to AI: mode AI_ACTIVE, clears assignee.
 * Optional expectedVersion enforces optimistic concurrency.
 */
export async function resumeAiConversation(
  transaction: DatabaseTransaction,
  conversationId: string,
  expectedVersion?: number,
): Promise<ConversationSummary | null> {
  const rows =
    expectedVersion === undefined
      ? await transaction<ConversationRow[]>`
          UPDATE chai.conversation
          SET mode = 'AI_ACTIVE',
              assignee_user_id = NULL,
              version = version + 1
          WHERE id = ${conversationId}
            AND status IN ('OPEN', 'PENDING_AGENT')
          RETURNING id, contact_id, status, mode, last_message_at, assignee_user_id, version
        `
      : await transaction<ConversationRow[]>`
          UPDATE chai.conversation
          SET mode = 'AI_ACTIVE',
              assignee_user_id = NULL,
              version = version + 1
          WHERE id = ${conversationId}
            AND status IN ('OPEN', 'PENDING_AGENT')
            AND version = ${expectedVersion}
          RETURNING id, contact_id, status, mode, last_message_at, assignee_user_id, version
        `;
  const row = rows[0];
  return row ? toSummary(row) : null;
}

/**
 * Resolves a conversation: sets status RESOLVED and clears the AI mode so any
 * pending AI outbound is cancelled (HUMAN terminal state).
 */
export async function resolveConversation(
  transaction: DatabaseTransaction,
  conversationId: string,
  expectedVersion?: number,
): Promise<ConversationSummary | null> {
  const rows =
    expectedVersion === undefined
      ? await transaction<ConversationRow[]>`
          UPDATE chai.conversation
          SET status = 'RESOLVED',
              mode = 'PAUSED',
              resolved_at = now(),
              version = version + 1
          WHERE id = ${conversationId}
          RETURNING id, contact_id, status, mode, last_message_at, assignee_user_id, version
        `
      : await transaction<ConversationRow[]>`
          UPDATE chai.conversation
          SET status = 'RESOLVED',
              mode = 'PAUSED',
              resolved_at = now(),
              version = version + 1
          WHERE id = ${conversationId}
            AND version = ${expectedVersion}
          RETURNING id, contact_id, status, mode, last_message_at, assignee_user_id, version
        `;
  const row = rows[0];
  return row ? toSummary(row) : null;
}

function toSummary(row: ConversationRow): ConversationSummary {
  return {
    assigneeUserId: row.assignee_user_id,
    contactId: row.contact_id,
    id: row.id,
    lastMessageAt: row.last_message_at,
    mode: row.mode,
    status: row.status,
    version: row.version,
  };
}

async function resolveContactId(
  transaction: DatabaseTransaction,
  event: InboundEventInput,
): Promise<string> {
  const existing = await transaction<IdentityRow[]>`
    SELECT contact_id
    FROM chai.contact_identity
    WHERE channel_account_id = ${event.channelAccount}
      AND external_user_id = ${event.externalUserId}
    LIMIT 1
  `;
  if (existing[0]) {
    return existing[0].contact_id;
  }

  const contactRows = await transaction<ContactRow[]>`
    INSERT INTO chai.contact (id, tenant_id, display_name)
    VALUES (${randomUUID()}, chai.current_tenant_id(), ${event.externalUserId})
    RETURNING id
  `;
  const contact = contactRows[0];
  if (!contact) throw new Error('contact insert returned no row');

  await transaction`
    INSERT INTO chai.contact_identity (
      id, tenant_id, contact_id, channel_account_id, external_user_id, display_handle
    )
    VALUES (
      ${randomUUID()}, chai.current_tenant_id(), ${contact.id},
      ${event.channelAccount}, ${event.externalUserId}, ${event.externalUserId}
    )
  `;

  return contact.id;
}

async function resolveActiveConversation(
  transaction: DatabaseTransaction,
  contactId: string,
  event: InboundEventInput,
): Promise<{ conversation: ConversationRow; created: boolean }> {
  const open = await transaction<ConversationRow[]>`
    SELECT id, contact_id, status, mode, last_message_at, assignee_user_id, version
    FROM chai.conversation
    WHERE contact_id = ${contactId}
      AND status IN ('OPEN', 'PENDING_AGENT')
    ORDER BY last_message_at DESC
    LIMIT 1
  `;
  if (open[0]) {
    const reopened = open[0];
    const updated = await transaction<ConversationRow[]>`
      UPDATE chai.conversation
      SET last_message_at = ${event.providerTimestamp},
          status = 'OPEN',
          version = version + 1
      WHERE id = ${reopened.id}
      RETURNING id, contact_id, status, mode, last_message_at, assignee_user_id, version
    `;
    const row = updated[0] ?? {
      ...reopened,
      last_message_at: event.providerTimestamp,
      status: 'OPEN',
      version: reopened.version + 1,
    };
    return { conversation: row, created: false };
  }

  const created = await transaction<ConversationRow[]>`
    INSERT INTO chai.conversation (
      id, tenant_id, contact_id, channel_account_id, last_message_at, opened_at
    )
    VALUES (
      ${randomUUID()}, chai.current_tenant_id(), ${contactId},
      ${event.channelAccount}, ${event.providerTimestamp}, ${event.providerTimestamp}
    )
    RETURNING id, contact_id, status, mode, last_message_at, assignee_user_id, version
  `;
  const row = created[0];
  if (!row) throw new Error('conversation insert returned no row');
  return { conversation: row, created: true };
}

async function appendInboundMessage(
  transaction: DatabaseTransaction,
  conversationId: string,
  event: InboundEventInput,
): Promise<MessageRow> {
  if (!event.externalMessageId) {
    const inserted = await transaction<MessageRow[]>`
      INSERT INTO chai.message (
        id, tenant_id, conversation_id, external_message_id,
        direction, sender_type, content_type, text_content,
        provider_timestamp, received_at
      )
      VALUES (
        ${randomUUID()}, chai.current_tenant_id(), ${conversationId}, ${null},
        'INBOUND', 'CUSTOMER', ${event.content.contentType},
        ${event.content.text ?? null}, ${event.providerTimestamp}, now()
      )
      RETURNING id
    `;
    const row = inserted[0];
    if (!row) throw new Error('message insert returned no row');
    return row;
  }

  // Idempotent on the external message id — a duplicate webhook replays the
  // same row instead of producing a second message.
  const inserted = await transaction<MessageRow[]>`
    INSERT INTO chai.message (
      id, tenant_id, conversation_id, external_message_id,
      direction, sender_type, content_type, text_content,
      provider_timestamp, received_at
    )
    VALUES (
      ${randomUUID()}, chai.current_tenant_id(), ${conversationId},
      ${event.externalMessageId}, 'INBOUND', 'CUSTOMER',
      ${event.content.contentType}, ${event.content.text ?? null},
      ${event.providerTimestamp}, now()
    )
    ON CONFLICT (tenant_id, conversation_id, external_message_id)
    DO UPDATE SET external_message_id = EXCLUDED.external_message_id
    RETURNING id
  `;
  const row = inserted[0];
  if (!row) throw new Error('message insert returned no row');
  return row;
}
