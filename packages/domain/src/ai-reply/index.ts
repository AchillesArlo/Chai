import { randomUUID } from 'node:crypto';

import type { DatabaseTransaction } from '@chai/database';

import { WORKER_SERVICE_PRINCIPAL_ID } from '../conversations';
import { commitBusinessMutation } from '../outbox/producer';

/**
 * sender_type marker for messages the AI writes. Matches the CHECK constraint on
 * chai.message (migration 0006). The reply pipeline skips any trigger message
 * whose sender_type is this value, so an AI reply can never trigger another AI
 * reply (FASE 31 anti-loop, decision 6).
 */
export const AI_SENDER_TYPE = 'AI';

/**
 * Deterministic external id for an AI reply, derived from the customer message
 * that triggered it. This is the pipeline's idempotency key: the UNIQUE
 * (tenant_id, conversation_id, external_message_id) constraint on chai.message
 * guarantees at-most-one AI reply per inbound message even under the broker's
 * at-least-once redelivery.
 */
export function aiReplyExternalId(triggerMessageId: string): string {
  return `ai-reply:${triggerMessageId}`;
}

export interface AiReplyContext {
  /** True when an AI reply for this trigger message already exists. */
  alreadyReplied: boolean;
  /** Channel account the conversation belongs to; the outbound send target. */
  channelAccountId: string;
  /** Per-channel kill switch: false means AI replies are switched off here. */
  channelAiEnabled: boolean;
  /** The customer's message text, or null for a non-text inbound. */
  customerText: string | null;
  /** External user id (provider handle) to address the reply to. */
  externalUserId: string | null;
  /** Conversation mode; the AI only replies when this is 'AI_ACTIVE'. */
  mode: string;
  /** sender_type of the triggering message; 'AI' means skip (anti-loop). */
  triggerSenderType: string;
}

interface AiReplyContextRow {
  already_replied: boolean;
  channel_account_id: string;
  channel_ai_enabled: boolean;
  customer_text: string | null;
  external_user_id: string | null;
  mode: string;
  trigger_sender_type: string;
}

/**
 * Loads everything the reply pipeline needs to decide and act on one inbound
 * message, in a single RLS-scoped read: conversation mode and channel, the
 * triggering message's text and author, the customer's provider handle, the
 * per-channel kill switch state, and whether a reply was already produced.
 *
 * Returns null when the conversation or the triggering message is not visible
 * (deleted, or another tenant's) so the caller skips rather than guessing.
 */
export async function loadAiReplyContext(
  transaction: DatabaseTransaction,
  input: { conversationId: string; messageId: string },
): Promise<AiReplyContext | null> {
  const rows = await transaction<AiReplyContextRow[]>`
    SELECT
      c.mode AS mode,
      c.channel_account_id AS channel_account_id,
      m.sender_type AS trigger_sender_type,
      m.text_content AS customer_text,
      ci.external_user_id AS external_user_id,
      COALESCE(s.enabled, true) AS channel_ai_enabled,
      EXISTS (
        SELECT 1
        FROM chai.message r
        WHERE r.conversation_id = c.id
          AND r.external_message_id = ${aiReplyExternalId(input.messageId)}
      ) AS already_replied
    FROM chai.conversation c
    JOIN chai.message m
      ON m.id = ${input.messageId} AND m.conversation_id = c.id
    LEFT JOIN chai.contact_identity ci
      ON ci.contact_id = c.contact_id
     AND ci.channel_account_id = c.channel_account_id
    LEFT JOIN chai.ai_reply_setting s
      ON s.channel_account_id = c.channel_account_id
    WHERE c.id = ${input.conversationId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    alreadyReplied: row.already_replied,
    channelAccountId: row.channel_account_id,
    channelAiEnabled: row.channel_ai_enabled,
    customerText: row.customer_text,
    externalUserId: row.external_user_id,
    mode: row.mode,
    triggerSenderType: row.trigger_sender_type,
  };
}

/**
 * Resolves the tenant owner (first ACTIVE CLIENT_OWNER membership) under the
 * current tenant RLS. Returns null when no owner is visible, so the escalation
 * path can still record the handover without a notification recipient.
 */
export async function findTenantOwnerUserId(
  transaction: DatabaseTransaction,
): Promise<string | null> {
  const rows = await transaction<{ user_id: string }[]>`
    SELECT user_id
    FROM chai.membership
    WHERE role = 'CLIENT_OWNER' AND status = 'ACTIVE'
    ORDER BY created_at
    LIMIT 1
  `;
  return rows[0]?.user_id ?? null;
}

export interface RecordAiReplyInput {
  conversationId: string;
  replyText: string;
  tenantId: string;
  triggerMessageId: string;
}

export interface RecordedAiReply {
  messageId: string;
  version: number;
}

/**
 * Records an AI reply -- the outbound message, its audit entry, and a
 * `message.created` event -- in ONE transaction (FASE 31 step 3, ADR-007).
 *
 * The event type is `message.created`, never `message.received`, so the reply
 * cannot re-enter the reply pipeline (anti-loop). The insert is idempotent on
 * {@link aiReplyExternalId}, so a redelivered trigger is a no-op instead of a
 * second reply. The conversation update is guarded on mode = 'AI_ACTIVE' so a
 * human takeover between the read and here wins and the AI does not write into a
 * human-owned conversation.
 */
export async function recordAiReply(
  transaction: DatabaseTransaction,
  input: RecordAiReplyInput,
): Promise<RecordedAiReply> {
  return commitBusinessMutation<RecordedAiReply>(transaction, {
    describe: (result) => ({
      audit: {
        action: 'ai.reply_sent',
        actorId: WORKER_SERVICE_PRINCIPAL_ID,
        metadata: {
          direction: 'OUTBOUND',
          messageId: result.messageId,
          senderType: AI_SENDER_TYPE,
          triggerMessageId: input.triggerMessageId,
        },
        resourceId: input.conversationId,
        resourceType: 'conversation',
      },
      events: [
        {
          aggregateId: input.conversationId,
          aggregateType: 'conversation',
          aggregateVersion: result.version,
          eventType: 'message.created',
          partitionKey: input.conversationId,
          // Payload-by-reference (K-03): messageId only, never the reply text --
          // the outbox stream sits outside Postgres RLS and the PII pipeline.
          payload: {
            contentType: 'TEXT',
            conversationId: input.conversationId,
            direction: 'OUTBOUND',
            messageId: result.messageId,
            senderType: AI_SENDER_TYPE,
          },
        },
      ],
    }),
    mutate: async () => {
      const bumped = await transaction<{ version: number }[]>`
        UPDATE chai.conversation
        SET last_message_at = now(), version = version + 1
        WHERE id = ${input.conversationId} AND mode = 'AI_ACTIVE'
        RETURNING version
      `;
      const version = bumped[0]?.version;
      if (version === undefined) {
        // Lost a race with a human takeover; retry will see a non-AI mode and
        // skip cleanly, so the AI never overwrites a human-owned conversation.
        throw new Error('AI_REPLY_CONVERSATION_NOT_AI_ACTIVE');
      }
      const inserted = await transaction<{ id: string }[]>`
        INSERT INTO chai.message (
          id, tenant_id, conversation_id, external_message_id,
          direction, sender_type, content_type, text_content, created_at
        )
        VALUES (
          ${randomUUID()}, chai.current_tenant_id(), ${input.conversationId},
          ${aiReplyExternalId(input.triggerMessageId)},
          'OUTBOUND', ${AI_SENDER_TYPE}, 'TEXT', ${input.replyText}, now()
        )
        ON CONFLICT (tenant_id, conversation_id, external_message_id) DO NOTHING
        RETURNING id
      `;
      const row = inserted[0];
      if (!row) {
        // The unique idempotency key already exists: another delivery won.
        throw new Error('AI_REPLY_ALREADY_RECORDED');
      }
      return { messageId: row.id, version };
    },
    tenantId: input.tenantId,
  });
}

/**
 * Marks an AI reply as dispatched once the channel adapter confirmed the send.
 * Left NULL until then, so a recorded-but-undelivered reply is visible for
 * reconciliation (mirrors the human-reply path, which also defers `sent_at`).
 */
export async function markAiReplyDelivered(
  transaction: DatabaseTransaction,
  messageId: string,
): Promise<void> {
  await transaction`
    UPDATE chai.message
    SET sent_at = now()
    WHERE id = ${messageId} AND sent_at IS NULL
  `;
}

export interface EscalateToHumanInput {
  /** Audit action, e.g. 'ai.guardrail_blocked' or 'ai.budget_exceeded'. */
  auditAction: string;
  conversationId: string;
  notificationBody: string;
  notificationTitle: string;
  reason: string;
  tenantId: string;
}

export interface EscalationResult {
  escalated: boolean;
  notified: boolean;
}

/**
 * Hands an AI conversation to a human: flips mode to HUMAN_ACTIVE, files an
 * in-app notification to the tenant owner, and records the audit action plus a
 * `conversation.escalated` event -- all in ONE transaction (FASE 31 decision 3).
 *
 * Only an AI-owned conversation escalates. If a human already owns it (or it is
 * paused/resolved) there is nothing to hand over, so it returns without writing.
 */
export async function escalateConversationToHuman(
  transaction: DatabaseTransaction,
  input: EscalateToHumanInput,
): Promise<EscalationResult> {
  const current = await transaction<{ mode: string }[]>`
    SELECT mode FROM chai.conversation WHERE id = ${input.conversationId} LIMIT 1
  `;
  if (current[0]?.mode !== 'AI_ACTIVE') {
    return { escalated: false, notified: false };
  }

  const ownerUserId = await findTenantOwnerUserId(transaction);

  await commitBusinessMutation<{ notificationId: string | null; version: number }>(
    transaction,
    {
      describe: (result) => ({
        audit: {
          action: input.auditAction,
          actorId: WORKER_SERVICE_PRINCIPAL_ID,
          metadata: {
            notificationId: result.notificationId,
            reason: input.reason,
          },
          resourceId: input.conversationId,
          resourceType: 'conversation',
        },
        events: [
          {
            aggregateId: input.conversationId,
            aggregateType: 'conversation',
            aggregateVersion: result.version,
            eventType: 'conversation.escalated',
            partitionKey: input.conversationId,
            payload: {
              conversationId: input.conversationId,
              mode: 'HUMAN_ACTIVE',
              reason: input.reason,
            },
          },
        ],
      }),
      mutate: async () => {
        const updated = await transaction<{ version: number }[]>`
          UPDATE chai.conversation
          SET mode = 'HUMAN_ACTIVE', version = version + 1
          WHERE id = ${input.conversationId} AND mode = 'AI_ACTIVE'
          RETURNING version
        `;
        const version = updated[0]?.version;
        if (version === undefined) {
          // Concurrent takeover between the read and here; retry no-ops cleanly.
          throw new Error('AI_REPLY_ESCALATION_LOST_RACE');
        }
        let notificationId: string | null = null;
        if (ownerUserId) {
          const notification = await transaction<{ id: string }[]>`
            INSERT INTO chai.notification (
              id, tenant_id, user_id, type, title, body, channel, status, metadata
            )
            VALUES (
              ${randomUUID()}, chai.current_tenant_id(), ${ownerUserId}, 'IN_APP',
              ${input.notificationTitle}, ${input.notificationBody}, ${null}, 'PENDING',
              ${transaction.json({
                conversationId: input.conversationId,
                reason: input.reason,
              } as Parameters<typeof transaction.json>[0])}::jsonb
            )
            RETURNING id
          `;
          notificationId = notification[0]?.id ?? null;
        }
        return { notificationId, version };
      },
      tenantId: input.tenantId,
    },
  );

  return { escalated: true, notified: ownerUserId !== null };
}

/**
 * Sets the per-channel AI reply kill switch for the current tenant (upsert on
 * the tenant+channel pair). `enabled = false` switches automated replies off for
 * that channel account only; the default (no row) leaves them on.
 */
export async function setAiReplyChannelEnabled(
  transaction: DatabaseTransaction,
  channelAccountId: string,
  enabled: boolean,
): Promise<void> {
  await transaction`
    INSERT INTO chai.ai_reply_setting (id, tenant_id, channel_account_id, enabled)
    VALUES (${randomUUID()}, chai.current_tenant_id(), ${channelAccountId}, ${enabled})
    ON CONFLICT (tenant_id, channel_account_id)
    DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()
  `;
}
