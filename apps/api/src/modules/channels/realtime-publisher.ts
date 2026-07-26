import { Injectable } from '@nestjs/common';

import { realtimeBus, type ConversationEvent } from '@chai/realtime-gateway';

import type { ConversationSummary } from '../shared/conversation.port';

@Injectable()
export class RealtimePublisher {
  publishConversationChange(
    tenantId: string,
    created: boolean,
    conversation: ConversationSummary,
  ): void {
    // ponytail: fire-and-forget; bus failure must not break ingest
    try {
      const event: ConversationEvent = {
        type: created ? 'conversation.created' : 'conversation.updated',
        tenantId,
        conversationId: conversation.id,
        payload: {
          assigneeUserId: conversation.assigneeUserId,
          contactId: conversation.contactId,
          externalUserId: conversation.externalUserId,
          id: conversation.id,
          lastMessageAt: conversation.lastMessageAt.toISOString(),
          mode: conversation.mode,
          provider: conversation.provider,
          status: conversation.status,
          version: conversation.version,
        },
      };
      realtimeBus.publish(tenantId, event);
    } catch {
      // swallow; ingest must not fail due to realtime bus
    }
  }
}
