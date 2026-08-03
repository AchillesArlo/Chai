import { describe, it, expect, beforeEach } from 'vitest';
import { ChannelsController } from '../src/modules/channels/channels.controller';
import { ForbiddenException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import type { ConversationRepository } from '../src/modules/shared/conversation.port';
import type { RealtimePublisher } from '../src/modules/channels/realtime-publisher';

describe('ChannelsController - Meta Webhook Handshake (REQ-09-007)', () => {
  let controller: ChannelsController;

  beforeEach(() => {
    const mockRepository = {
      ingest: async () => ({ duplicate: false, conversationId: 'c-1', created: true }),
      listConversations: async () => [],
    } as unknown as ConversationRepository;
    const mockPublisher = {
      publishConversationChange: () => {},
    } as unknown as RealtimePublisher;
    controller = new ChannelsController(mockRepository, mockPublisher);
  });

  it('returns hub.challenge when hub.verify_token matches expected token', async () => {
    const req = {
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'chai_meta_verify_token_secret',
        'hub.challenge': 'challenge_token_abc123',
      },
    } as unknown as FastifyRequest;

    const result = await controller.verifyWebhookHandshake('whatsapp-meta', req);
    expect(result).toBe('challenge_token_abc123');
  });

  it('throws ForbiddenException when verify token is incorrect', async () => {
    const req = {
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': 'challenge_token_abc123',
      },
    } as unknown as FastifyRequest;

    await expect(controller.verifyWebhookHandshake('whatsapp-meta', req)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
