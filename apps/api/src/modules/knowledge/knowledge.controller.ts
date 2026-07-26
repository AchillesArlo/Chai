import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

import type { KnowledgeDocument } from '@chai/connectors/mock-ai';

import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import {
  KnowledgeRepository,
  type RetrievedEvidence,
} from './knowledge.repository';

function tenantScope(request: FastifyRequest): string {
  const tenantId = request.tenantContext?.tenantId;
  if (!tenantId) throw new NotFoundException();
  return tenantId;
}

class IngestBody {
  @IsString()
  knowledgeBaseId!: string;

  @IsString()
  text!: string;
}

class RetrieveBody {
  @IsArray()
  @IsString({ each: true })
  knowledgeBaseIds!: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  /** The question being answered; retrieval ranks against it. */
  @IsString()
  query!: string;
}

@Controller('api/client/v1/knowledge')
@RequireAudience('client-portal')
export class KnowledgeController {
  constructor(
    @Inject(KnowledgeRepository)
    private readonly repository: KnowledgeRepository,
  ) {}

  @Get('documents')
  @RequirePermission('knowledge.read')
  async list(
    @Req() request: FastifyRequest,
    @Query('knowledgeBaseId') knowledgeBaseId?: string,
  ): Promise<KnowledgeDocument[]> {
    return this.repository.list(tenantScope(request), knowledgeBaseId);
  }

  @Post('documents')
  @RequirePermission('knowledge.manage')
  @HttpCode(201)
  async ingest(
    @Body() body: IngestBody,
    @Req() request: FastifyRequest,
  ): Promise<KnowledgeDocument> {
    return this.repository.ingest(tenantScope(request), body);
  }

  @Post('retrieve')
  @RequirePermission('knowledge.read')
  @HttpCode(200)
  async retrieve(
    @Body() body: RetrieveBody,
    @Req() request: FastifyRequest,
  ): Promise<RetrievedEvidence[]> {
    return this.repository.retrieve(tenantScope(request), {
      knowledgeBaseIds: body.knowledgeBaseIds,
      ...(body.limit === undefined ? {} : { limit: body.limit }),
      query: body.query,
    });
  }
}
