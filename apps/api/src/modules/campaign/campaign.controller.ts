import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { CampaignRepository } from './campaign.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { Campaign, CampaignMessage } from './campaign.repository';

@Controller('api/client/v1/campaigns')
@UseGuards(TenantGuard)
export class CampaignController {
  constructor(private readonly repo: CampaignRepository) {}

  @Get()
  @RequirePermission('automation.read')
  async list(@TenantId() tenantId: string) { return this.repo.listCampaigns(tenantId); }

  @Get(':id')
  @RequirePermission('automation.read')
  async get(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.getCampaign(tenantId, id); }

  @Post()
  @RequirePermission('automation.manage')
  async create(@TenantId() tenantId: string, @Body() campaign: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt' | 'startedAt' | 'completedAt' | 'metrics'>) { return this.repo.createCampaign(tenantId, campaign); }

  @Put(':id')
  @RequirePermission('automation.manage')
  async update(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: Partial<Campaign>) { return this.repo.updateCampaign(tenantId, id, update); }

  @Get(':id/messages')
  @RequirePermission('automation.read')
  async listMessages(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.listCampaignMessages(tenantId, id); }

  @Post(':id/messages')
  @RequirePermission('automation.manage')
  async createMessage(@TenantId() tenantId: string, @Param('id') campaignId: string, @Body() message: Omit<CampaignMessage, 'id' | 'createdAt' | 'updatedAt' | 'sentAt' | 'deliveredAt' | 'readAt' | 'failedAt' | 'errorCode'>) { return this.repo.createCampaignMessage(tenantId, { ...message, campaignId }); }
}
