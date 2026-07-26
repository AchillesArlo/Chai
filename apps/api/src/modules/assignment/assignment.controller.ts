import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { IsInt, IsOptional, Min } from 'class-validator';

import { RequireAudience } from '../../auth/require-audience.decorator';
import { resolveExpectedVersion } from '../../common/concurrency';
import { RequirePermission } from '../../guards/require-permission.decorator';
import {
  ConversationRepository,
  type ConversationSummary,
} from '../shared/conversation.port';

function tenantScope(request: FastifyRequest): { principalId: string; tenantId: string } {
  const context = request.tenantContext;
  if (!context) throw new NotFoundException();
  return context;
}

class ExpectedVersionBody {
  /** Compatibility fallback; `If-Match` is the canonical channel (06_API §3). */
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

@Controller('api/client/v1/conversations')
@RequireAudience('client-portal')
export class AssignmentController {
  constructor(
    @Inject(ConversationRepository)
    private readonly repository: ConversationRepository,
  ) {}

  @Post(':id/takeover')
  @RequirePermission('conversation.take_over')
  @HttpCode(200)
  async takeOver(
    @Param('id') id: string,
    @Body() body: ExpectedVersionBody,
    @Req() request: FastifyRequest,
  ): Promise<ConversationSummary> {
    const { principalId, tenantId } = tenantScope(request);
    const result = await this.repository.takeOver(
      tenantId,
      id,
      principalId,
      resolveExpectedVersion(request, body.expectedVersion),
    );
    return this.unwrap(result);
  }

  @Post(':id/resume-ai')
  @RequirePermission('conversation.take_over')
  @HttpCode(200)
  async resumeAi(
    @Param('id') id: string,
    @Body() body: ExpectedVersionBody,
    @Req() request: FastifyRequest,
  ): Promise<ConversationSummary> {
    const { tenantId } = tenantScope(request);
    const result = await this.repository.resumeAi(
      tenantId,
      id,
      resolveExpectedVersion(request, body.expectedVersion),
    );
    return this.unwrap(result);
  }

  @Post(':id/resolve')
  @RequirePermission('conversation.respond')
  @HttpCode(200)
  async resolve(
    @Param('id') id: string,
    @Body() body: ExpectedVersionBody,
    @Req() request: FastifyRequest,
  ): Promise<ConversationSummary> {
    const { tenantId } = tenantScope(request);
    const result = await this.repository.resolve(
      tenantId,
      id,
      resolveExpectedVersion(request, body.expectedVersion),
    );
    return this.unwrap(result);
  }

  private unwrap(
    result: Awaited<ReturnType<ConversationRepository['takeOver']>>,
  ): ConversationSummary {
    if (result.kind === 'not_found') throw new NotFoundException();
    if (result.kind === 'version_conflict') {
      throw new ConflictException({ code: 'VERSION_CONFLICT' });
    }
    return result.conversation;
  }
}
