import { withTenantTransaction, type Database } from '@chai/database';
import {
  AI_SENDER_TYPE,
  escalateConversationToHuman,
  loadAiReplyContext,
  recordAiReply,
  WORKER_SERVICE_PRINCIPAL_ID,
} from '@chai/domain';

import type { AiGateway } from './index';

export interface ProcessAiReplyTurnInput {
  conversationId: string;
  messageId: string;
  tenantId: string;
  model?: string;
}

export type ProcessAiReplyTurnResult =
  | 'REPLIED'
  | 'SKIPPED_ALREADY_REPLIED'
  | 'SKIPPED_NOT_AI_ACTIVE'
  | 'SKIPPED_AI_SENDER'
  | 'SKIPPED_CHANNEL_DISABLED'
  | 'SKIPPED_NO_TEXT'
  | 'SKIPPED_NOT_FOUND'
  | 'ESCALATED_BUDGET'
  | 'ESCALATED_GUARDRAIL'
  | 'ESCALATED_EMPTY';

/**
 * End-to-end pipeline turn for an automated AI reply (FASE 31, T-01, T-02).
 *
 * 1. Loads context under the target tenant's RLS.
 * 2. Checks fail-safe conditions (already replied, anti-loop AI sender, non-AI_ACTIVE mode,
 *    channel kill switch disabled, empty text).
 * 3. Invokes the AI gateway with budget cap & guardrail checks.
 * 4. On budget exhaustion / guardrail block / empty response -> escalates mode to HUMAN_ACTIVE
 *    and sends an in-app notification to the tenant owner.
 * 5. On success -> records the outbound AI message, audit entry, and message.created event
 *    in ONE atomic business mutation (ADR-007).
 */
export async function processAiReplyTurn(
  database: Database,
  gateway: AiGateway,
  input: ProcessAiReplyTurnInput,
): Promise<ProcessAiReplyTurnResult> {
  const { conversationId, messageId, tenantId, model = 'gpt-4o' } = input;

  return withTenantTransaction(
    database,
    { principalId: WORKER_SERVICE_PRINCIPAL_ID, tenantId },
    async (tx) => {
      const context = await loadAiReplyContext(tx, { conversationId, messageId });
      if (!context) return 'SKIPPED_NOT_FOUND';
      if (context.alreadyReplied) return 'SKIPPED_ALREADY_REPLIED';
      if (context.triggerSenderType === AI_SENDER_TYPE) return 'SKIPPED_AI_SENDER';
      if (context.mode !== 'AI_ACTIVE') return 'SKIPPED_NOT_AI_ACTIVE';
      if (!context.channelAiEnabled) return 'SKIPPED_CHANNEL_DISABLED';
      if (!context.customerText || context.customerText.trim().length === 0) {
        return 'SKIPPED_NO_TEXT';
      }

      const completion = await gateway.complete({
        conversationId,
        messages: [{ content: context.customerText, role: 'user' }],
        model,
        tenantId,
      });

      if (completion.budgetExhausted && (!completion.content || completion.content.length === 0)) {
        await escalateConversationToHuman(tx, {
          auditAction: 'ai.budget_exceeded',
          conversationId,
          notificationBody: `Percakapan ${conversationId} dialihkan ke agen manusia karena plafon biaya AI tenant telah tercapai.`,
          notificationTitle: 'Plafon Biaya AI Tercapai',
          reason: 'BUDGET_EXHAUSTED',
          tenantId,
        });
        return 'ESCALATED_BUDGET';
      }

      if (completion.safeFallback && (!completion.content || completion.content.length === 0)) {
        await escalateConversationToHuman(tx, {
          auditAction: 'ai.guardrail_blocked',
          conversationId,
          notificationBody: `Percakapan ${conversationId} dialihkan ke agen manusia karena jawaban AI memicu batas keamanan (guardrail).`,
          notificationTitle: 'Eskalasi AI Guardrail',
          reason: 'GUARDRAIL_BLOCKED',
          tenantId,
        });
        return 'ESCALATED_GUARDRAIL';
      }

      if (!completion.content || completion.content.trim().length === 0) {
        await escalateConversationToHuman(tx, {
          auditAction: 'ai.empty_response',
          conversationId,
          notificationBody: `Percakapan ${conversationId} dialihkan ke agen manusia karena AI tidak menghasilkan jawaban.`,
          notificationTitle: 'Respon AI Kosong',
          reason: 'EMPTY_RESPONSE',
          tenantId,
        });
        return 'ESCALATED_EMPTY';
      }

      try {
        await recordAiReply(tx, {
          conversationId,
          replyText: completion.content,
          tenantId,
          triggerMessageId: messageId,
        });
        return 'REPLIED';
      } catch (error) {
        if (error instanceof Error && error.message === 'AI_REPLY_ALREADY_RECORDED') {
          return 'SKIPPED_ALREADY_REPLIED';
        }
        if (error instanceof Error && error.message === 'AI_REPLY_CONVERSATION_NOT_AI_ACTIVE') {
          return 'SKIPPED_NOT_AI_ACTIVE';
        }
        throw error;
      }
    },
  );
}
