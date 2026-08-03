import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Delete, Body, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { MultiRegionRepository } from './multi-region.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { TenantRegion, RegionRoutingRule, RegionReplicationStatus, DataResidencyAudit } from './multi-region.repository';

class CreateTenantRegionDto {
  @IsString()
  region!: string;

  @IsBoolean()
  isPrimary!: boolean;

  @IsString()
  dataResidencyPolicy!: string;
}

class UpdateTenantRegionDto {
  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  dataResidencyPolicy?: string;
}

class CreateRoutingRuleDto {
  @IsString()
  sourceRegion!: string;

  @IsString()
  targetRegion!: string;

  @IsIn(['latency', 'cost', 'compliance', 'manual'])
  routingType!: 'latency' | 'cost' | 'compliance' | 'manual';

  @IsInt()
  priority!: number;

  @IsBoolean()
  isActive!: boolean;
}

class UpdateRoutingRuleDto {
  @IsOptional()
  @IsString()
  sourceRegion?: string;

  @IsOptional()
  @IsString()
  targetRegion?: string;

  @IsOptional()
  @IsIn(['latency', 'cost', 'compliance', 'manual'])
  routingType?: 'latency' | 'cost' | 'compliance' | 'manual';

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class UpsertReplicationStatusDto {
  @IsString()
  sourceRegion!: string;

  @IsString()
  targetRegion!: string;

  @IsString()
  entityType!: string;

  @IsString()
  entityId!: string;

  @IsOptional()
  @IsString()
  lastReplicatedAt!: string | null;

  @IsOptional()
  @IsInt()
  replicationLagMs!: number | null;

  @IsIn(['synced', 'lagging', 'failed', 'pending'])
  status!: 'synced' | 'lagging' | 'failed' | 'pending';
}

class CreateResidencyAuditDto {
  @IsString()
  region!: string;

  @IsString()
  entityType!: string;

  @IsString()
  entityId!: string;

  @IsIn(['create', 'read', 'update', 'delete', 'replicate', 'migrate'])
  action!: 'create' | 'read' | 'update' | 'delete' | 'replicate' | 'migrate';

  @IsBoolean()
  complianceCheckPassed!: boolean;

  @IsOptional()
  @IsString()
  violationReason!: string | null;

  @IsString()
  performedBy!: string;

  @IsString()
  performedAt!: string;
}

@Controller('api/owner/v1/multi-region')
@UseGuards(TenantGuard)
export class MultiRegionController {
  constructor(
    @Inject(MultiRegionRepository)
    private readonly repo: MultiRegionRepository,
  ) {}

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
    @Body() region: CreateTenantRegionDto,
  ): Promise<TenantRegion> {
    return this.repo.createTenantRegion(tenantId, { ...region, tenantId });
  }

  @Put('regions/:id')
  @RequirePermission('platform.tenant.manage')
  async updateTenantRegion(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: UpdateTenantRegionDto,
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
    @Body() rule: CreateRoutingRuleDto,
  ): Promise<RegionRoutingRule> {
    return this.repo.createRoutingRule(tenantId, { ...rule, tenantId });
  }

  @Put('routing-rules/:id')
  @RequirePermission('platform.tenant.manage')
  async updateRoutingRule(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: UpdateRoutingRuleDto,
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
    @Body() status: UpsertReplicationStatusDto,
  ): Promise<RegionReplicationStatus> {
    return this.repo.upsertReplicationStatus(tenantId, { ...status, tenantId });
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
    @Body() audit: CreateResidencyAuditDto,
  ): Promise<DataResidencyAudit> {
    return this.repo.createResidencyAudit(tenantId, { ...audit, tenantId });
  }
}
