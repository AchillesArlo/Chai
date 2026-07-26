import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { MultiRegionRepository } from './multi-region.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { TenantRegion, RegionRoutingRule, RegionReplicationStatus, DataResidencyAudit } from './multi-region.repository';

@Controller('api/owner/v1/multi-region')
@UseGuards(TenantGuard)
export class MultiRegionController {
  constructor(private readonly repo: MultiRegionRepository) {}

  // Tenant Region endpoints
  @Get('regions')
  @RequirePermission('platform.tenant.read')
  async listTenantRegions(@TenantId() tenantId: string): Promise<TenantRegion[]> {
    return this.repo.listTenantRegions(tenantId);
  }

  @Get('regions/:region')
  @RequirePermission('platform.tenant.read')
  async getTenantRegion(
    @TenantId() tenantId: string,
    @Param('region') region: string,
  ): Promise<TenantRegion | null> {
    return this.repo.getTenantRegion(tenantId, region);
  }

  @Post('regions')
  @RequirePermission('platform.tenant.manage')
  async createTenantRegion(
    @TenantId() tenantId: string,
    @Body() region: Omit<TenantRegion, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<TenantRegion> {
    return this.repo.createTenantRegion(tenantId, region);
  }

  @Put('regions/:id')
  @RequirePermission('platform.tenant.manage')
  async updateTenantRegion(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: Partial<TenantRegion>,
  ): Promise<TenantRegion> {
    return this.repo.updateTenantRegion(tenantId, id, update);
  }

  @Delete('regions/:id')
  @RequirePermission('platform.tenant.manage')
  async deleteTenantRegion(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.repo.deleteTenantRegion(tenantId, id);
  }

  // Routing Rule endpoints
  @Get('routing-rules')
  @RequirePermission('platform.tenant.read')
  async listRoutingRules(@TenantId() tenantId: string): Promise<RegionRoutingRule[]> {
    return this.repo.listRoutingRules(tenantId);
  }

  @Post('routing-rules')
  @RequirePermission('platform.tenant.manage')
  async createRoutingRule(
    @TenantId() tenantId: string,
    @Body() rule: Omit<RegionRoutingRule, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<RegionRoutingRule> {
    return this.repo.createRoutingRule(tenantId, rule);
  }

  @Put('routing-rules/:id')
  @RequirePermission('platform.tenant.manage')
  async updateRoutingRule(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: Partial<RegionRoutingRule>,
  ): Promise<RegionRoutingRule> {
    return this.repo.updateRoutingRule(tenantId, id, update);
  }

  @Delete('routing-rules/:id')
  @RequirePermission('platform.tenant.manage')
  async deleteRoutingRule(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.repo.deleteRoutingRule(tenantId, id);
  }

  // Replication Status endpoints
  @Get('replication')
  @RequirePermission('platform.tenant.read')
  async listReplicationStatus(
    @TenantId() tenantId: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ): Promise<RegionReplicationStatus[]> {
    return this.repo.listReplicationStatus(tenantId, entityType, entityId);
  }

  @Post('replication')
  @RequirePermission('platform.tenant.manage')
  async upsertReplicationStatus(
    @TenantId() tenantId: string,
    @Body() status: Omit<RegionReplicationStatus, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<RegionReplicationStatus> {
    return this.repo.upsertReplicationStatus(tenantId, status);
  }

  // Data Residency Audit endpoints
  @Get('residency-audit')
  @RequirePermission('platform.tenant.read')
  async listResidencyAudit(
    @TenantId() tenantId: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ): Promise<DataResidencyAudit[]> {
    return this.repo.listResidencyAudit(tenantId, entityType, entityId);
  }

  @Post('residency-audit')
  @RequirePermission('platform.tenant.manage')
  async createResidencyAudit(
    @TenantId() tenantId: string,
    @Body() audit: Omit<DataResidencyAudit, 'id'>,
  ): Promise<DataResidencyAudit> {
    return this.repo.createResidencyAudit(tenantId, audit);
  }
}
