import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { adapterFor } from './channel-adapters';
import {
  ConversationRepository,
  type ConversationSummary,
} from '../shared/conversation.port';
import { RealtimePublisher } from './realtime-publisher';

@Controller('api')
export class ChannelsController {
  constructor(
    @Inject(ConversationRepository)
    private readonly repository: ConversationRepository,
    private readonly publisher: RealtimePublisher,
  ) {}

  @Post('service/v1/channels/:provider/webhook')
  async ingestWebhook(
    @Param('provider') provider: string,
    @Req() request: FastifyRequest,
  ): Promise<{ accepted: number }> {
    const adapter = adapterFor(provider);
    if (!adapter) {
      throw new NotFoundException({ code: 'UNKNOWN_CHANNEL' });
    }

    const body = request.body ?? {};
    // Meta posts the full envelope; mock/synthetic posts flat data fields.
    const payload =
      typeof body === 'object' &&
      body !== null &&
      'object' in body &&
      (body as { object?: string }).object === 'whatsapp_business_account'
        ? JSON.stringify(body)
        : JSON.stringify({ data: body });

    const signatureHeader = request.headers['x-hub-signature-256'];
    const signature = Array.isArray(signatureHeader)
      ? signatureHeader[0]
      : signatureHeader;

    const { events, verification } = await adapter.normalizeWebhook({
      raw: new TextEncoder().encode(payload),
      signature,
    });
    if (!verification.verified) {
      throw new BadRequestException({ code: 'WEBHOOK_REJECTED' });
    }

    for (const event of events) {
      const result = await this.repository.ingest(event);
      // A provider redelivery collapsed on the inbox: no domain effect ran, so
      // there is nothing new to broadcast.
      if (result.duplicate || !result.conversationId) {
        continue;
      }
      const conversationId = result.conversationId;
      // ponytail: listConversations+find to fetch summary; add repo.getById when throughput matters
      const summary = (await this.repository.listConversations(event.tenantId)).find(
        (c) => c.id === conversationId,
      );
      if (summary) {
        this.publisher.publishConversationChange(
          event.tenantId,
          result.created,
          summary,
        );
      }
    }
    return { accepted: events.length };
  }

  @Get('client/v1/conversations')
  @RequireAudience('client-portal')
  @RequirePermission('conversation.read')
  async listConversations(
    @Req() request: FastifyRequest,
  ): Promise<ConversationSummary[]> {
    const context = request.tenantContext;
    if (!context) throw new NotFoundException();
    return this.repository.listConversations(
      context.tenantId,
      context.principalId,
    );
  }
}
