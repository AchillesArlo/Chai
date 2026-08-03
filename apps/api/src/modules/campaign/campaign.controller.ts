import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Body, Inject, Param, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CampaignRepository } from './campaign.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';

class CreateCampaignDto {
  @IsString()
  name!: string;

  @IsIn(['BROADCAST', 'SCHEDULED', 'SEGMENTED'])
  type!: 'BROADCAST' | 'SCHEDULED' | 'SEGMENTED';

  @IsIn(['DRAFT', 'SCHEDULED', 'RUNNING', 'ACTIVE', 'COMPLETED', 'CANCELLED'])
  status!: 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

  @IsString()
  channel!: string;

  @IsOptional()
  @IsString()
  messageTemplateId!: string | null;

  @IsOptional()
  @IsObject()
  targetSegment!: Record<string, unknown> | null;

  @IsOptional()
  @IsString()
  scheduledAt!: string | null;
}

class CampaignMetricsDto {
  @IsInt()
  sent!: number;

  @IsInt()
  delivered!: number;

  @IsInt()
  read!: number;

  @IsInt()
  failed!: number;
}

class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['BROADCAST', 'SCHEDULED', 'SEGMENTED'])
  type?: 'BROADCAST' | 'SCHEDULED' | 'SEGMENTED';

  @IsOptional()
  @IsIn(['DRAFT', 'SCHEDULED', 'RUNNING', 'ACTIVE', 'COMPLETED', 'CANCELLED'])
  status?: 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  messageTemplateId?: string | null;

  @IsOptional()
  @IsObject()
  targetSegment?: Record<string, unknown> | null;

  @IsOptional()
  @IsString()
  scheduledAt?: string | null;

  @IsOptional()
  @IsString()
  startedAt?: string | null;

  @IsOptional()
  @IsString()
  completedAt?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => CampaignMetricsDto)
  metrics?: CampaignMetricsDto;
}

class CreateCampaignMessageDto {
  @IsString()
  contactId!: string;

  @IsOptional()
  @IsString()
  messageId!: string | null;

  @IsIn(['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED'])
  status!: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
}

@Controller('api/client/v1/campaigns')
@UseGuards(TenantGuard)
export class CampaignController {
  constructor(
    @Inject(CampaignRepository)
    private readonly repo: CampaignRepository,
  ) {}

  @Get()
  @RequirePermission('automation.read')
  async list(@TenantId() tenantId: string) { return this.repo.listCampaigns(tenantId); }

  @Get(':id')
  @RequirePermission('automation.read')
  async get(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.getCampaign(tenantId, id); }

  @Post()
  @RequirePermission('automation.manage')
  async create(@TenantId() tenantId: string, @Body() campaign: CreateCampaignDto) { return this.repo.createCampaign(tenantId, campaign); }

  @Put(':id')
  @RequirePermission('automation.manage')
  async update(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: UpdateCampaignDto) { return this.repo.updateCampaign(tenantId, id, update); }

  @Get(':id/messages')
  @RequirePermission('automation.read')
  async listMessages(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.listCampaignMessages(tenantId, id); }

  @Post(':id/messages')
  @RequirePermission('automation.manage')
  async createMessage(@TenantId() tenantId: string, @Param('id') campaignId: string, @Body() message: CreateCampaignMessageDto) { return this.repo.createCampaignMessage(tenantId, { ...message, campaignId }); }
}
