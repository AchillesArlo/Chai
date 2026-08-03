import { describe, expect, it, vi } from 'vitest';

import * as aiGatewayModule from '@chai/ai-gateway';
import type { OutboxStreamMessage } from '@chai/broker';

import { handleAiReplyEvent } from '../src/ai-reply-consumer';

describe('handleAiReplyEvent', () => {
  it('skips event when eventType is not message.received', async () => {
    const message: OutboxStreamMessage = {
      aggregateId: 'conv-1',
      aggregateType: 'conversation',
      aggregateVersion: 1,
      eventId: 'evt-1',
      eventType: 'message.created',
      partitionKey: 'conv-1',
      payload: { messageId: 'msg-1' },
      schemaVersion: 1,
      tenantId: 'tenant-1',
      traceparent: null,
    };

    const result = await handleAiReplyEvent({} as never, {} as never, message);
    expect(result).toBeNull();
  });

  it('skips event when identifiers are missing', async () => {
    const message: OutboxStreamMessage = {
      aggregateId: '',
      aggregateType: 'conversation',
      aggregateVersion: 1,
      eventId: 'evt-1',
      eventType: 'message.received',
      partitionKey: 'conv-1',
      payload: null,
      schemaVersion: 1,
      tenantId: 'tenant-1',
      traceparent: null,
    };

    const result = await handleAiReplyEvent({} as never, {} as never, message);
    expect(result).toBeNull();
  });

  it('delegates to processAiReplyTurn for valid message.received event', async () => {
    const message: OutboxStreamMessage = {
      aggregateId: 'conv-123',
      aggregateType: 'conversation',
      aggregateVersion: 1,
      eventId: 'evt-1',
      eventType: 'message.received',
      partitionKey: 'conv-123',
      payload: { messageId: 'msg-456' },
      schemaVersion: 1,
      tenantId: 'tenant-123',
      traceparent: null,
    };

    const turnSpy = vi
      .spyOn(aiGatewayModule, 'processAiReplyTurn')
      .mockResolvedValue('REPLIED');

    const result = await handleAiReplyEvent({} as never, {} as never, message);
    expect(result).toBe('REPLIED');
    expect(turnSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      {
        conversationId: 'conv-123',
        messageId: 'msg-456',
        tenantId: 'tenant-123',
      },
    );
  });
});
