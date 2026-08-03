import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { IsNotEmpty, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

import { RequireAudience } from '../../auth/require-audience.decorator';
import { resolveExpectedVersion } from '../../common/concurrency';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { adapterFor } from './channel-adapters';
import {
  ConversationRepository,
  type ConversationSummary,
  type OutboundMessageSummary,
} from '../shared/conversation.port';
import { RealtimePublisher } from './realtime-publisher';

/** Operator reply body. `Idempotency-Key` travels as a header, not a field. */
class SendMessageBody {
  /** Compatibility fallback; `If-Match` is the canonical precondition (06_API §3). */
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  text!: string;
}

@Controller('api')
export class ChannelsController {
  constructor(
    @Inject(ConversationRepository)
    private readonly repository: ConversationRepository,
    @Inject(RealtimePublisher)
    private readonly publisher: RealtimePublisher,
  ) {}

  @Get('service/v1/channels/:provider/webhook')
  async verifyWebhookHandshake(
    @Param('provider') _provider: string,
    @Req() request: FastifyRequest,
  ): Promise<string> {
    const query = request.query as Record<string, string | undefined>;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'chai_meta_verify_token_secret';

    if (mode === 'subscribe' && token === expectedToken && challenge) {
      return challenge;
    }

    throw new ForbiddenException({ code: 'INVALID_VERIFY_TOKEN' });
  }

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

  @Post('client/v1/conversations/:id/messages')
  @RequireAudience('client-portal')
  @RequirePermission('conversation.respond')
  @HttpCode(201)
  async sendMessage(
    @Param('id') id: string,
    @Body() body: SendMessageBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FastifyRequest,
  ): Promise<OutboundMessageSummary> {
    const context = request.tenantContext;
    if (!context) throw new NotFoundException();
    if (!idempotencyKey) {
      // The global interceptor already enforces this; a send to a customer must
      // never proceed without a dedup key, so the controller refuses too.
      throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }
    const result = await this.repository.sendMessage(
      context.tenantId,
      id,
      context.principalId,
      resolveExpectedVersion(request, body.expectedVersion),
      { idempotencyKey, text: body.text },
    );
    switch (result.kind) {
      case 'not_found':
        throw new NotFoundException();
      case 'version_conflict':
        throw new ConflictException({ code: 'VERSION_CONFLICT' });
      case 'idempotency_conflict':
        throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT' });
      case 'ok':
        return result.message;
    }
  }
}
