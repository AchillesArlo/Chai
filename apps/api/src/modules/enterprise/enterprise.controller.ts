import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Delete, Body, Inject, Param, Query, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { EnterpriseRepository } from './enterprise.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { assertRecentAuthentication } from '../../guards/high-risk';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { SsoConfiguration, ScimConfiguration, CustomRole, RoleAssignment, AuditExportConfig, AuditExportHistory } from './enterprise.repository';

class UpsertSsoConfigDto {
  @IsIn(['saml', 'oidc'])
  provider!: 'saml' | 'oidc';

  @IsString()
  entityId!: string;

  @IsString()
  ssoUrl!: string;

  @IsString()
  certificate!: string;

  @IsObject()
  attributeMapping!: Record<string, string>;

  @IsBoolean()
  enabled!: boolean;
}

class UpsertScimConfigDto {
  @IsString()
  baseUrl!: string;

  @IsBoolean()
  userSyncEnabled!: boolean;

  @IsBoolean()
  groupSyncEnabled!: boolean;
}

class CreateRoleDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

class UpdateRoleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

class AssignRoleDto {
  @IsString()
  userId!: string;

  @IsString()
  roleId!: string;

  @IsString()
  assignedBy!: string;
}

class UpsertAuditExportConfigDto {
  @IsIn(['s3', 'splunk', 'elk', 'webhook'])
  destinationType!: 's3' | 'splunk' | 'elk' | 'webhook';

  @IsObject()
  destinationConfig!: Record<string, unknown>;

  @IsObject()
  filterCriteria!: Record<string, unknown>;

  @IsBoolean()
  enabled!: boolean;
}

class CreateAuditExportHistoryDto {
  @IsString()
  configId!: string;

  @IsIn(['pending', 'running', 'completed', 'failed'])
  status!: 'pending' | 'running' | 'completed' | 'failed';

  @IsInt()
  recordsExported!: number;

  @IsString()
  startedAt!: string;

  @IsOptional()
  @IsString()
  completedAt?: string | null;

  @IsOptional()
  @IsString()
  errorMessage?: string | null;
}

class UpdateAuditExportHistoryDto {
  @IsOptional()
  @IsString()
  configId?: string;

  @IsOptional()
  @IsIn(['pending', 'running', 'completed', 'failed'])
  status?: 'pending' | 'running' | 'completed' | 'failed';

  @IsOptional()
  @IsInt()
  recordsExported?: number;

  @IsOptional()
  @IsString()
  startedAt?: string;

  @IsOptional()
  @IsString()
  completedAt?: string | null;

  @IsOptional()
  @IsString()
  errorMessage?: string | null;
}

@Controller('api/owner/v1/enterprise')
@UseGuards(TenantGuard)
export class EnterpriseController {
  constructor(
    @Inject(EnterpriseRepository)
    private readonly repo: EnterpriseRepository,
  ) {}

  // SSO endpoints
  @Get('sso/:provider')
  @RequirePermission('platform.access.manage')
  async getSsoConfig(
    @TenantId() tenantId: string,
    @Param('provider') provider: 'saml' | 'oidc',
  ): Promise<SsoConfiguration | null> {
    return this.repo.getSsoConfig(tenantId, provider);
  }

  @Post('sso')
  @RequirePermission('platform.access.manage')
  async upsertSsoConfig(
    @TenantId() tenantId: string,
    @Body() config: UpsertSsoConfigDto,
  ): Promise<SsoConfiguration> {
    return this.repo.upsertSsoConfig(tenantId, config as Omit<SsoConfiguration, 'id' | 'createdAt' | 'updatedAt'>);
  }

  // SCIM endpoints
  @Get('scim')
  @RequirePermission('platform.access.manage')
  async getScimConfig(@TenantId() tenantId: string): Promise<ScimConfiguration | null> {
    return this.repo.getScimConfig(tenantId);
  }

  @Post('scim')
  @RequirePermission('platform.access.manage')
  async upsertScimConfig(
    @TenantId() tenantId: string,
    @Body() config: UpsertScimConfigDto,
  ): Promise<ScimConfiguration> {
    return this.repo.upsertScimConfig(tenantId, config as Omit<ScimConfiguration, 'id' | 'createdAt' | 'updatedAt' | 'lastSyncAt'>);
  }

  // Custom Role endpoints
  @Get('roles')
  @RequirePermission('platform.access.manage')
  async listRoles(@TenantId() tenantId: string): Promise<CustomRole[]> {
    return this.repo.listRoles(tenantId);
  }

  @Get('roles/:id')
  @RequirePermission('platform.access.manage')
  async getRole(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<CustomRole | null> {
    return this.repo.getRole(tenantId, id);
  }

  @Post('roles')
  @RequirePermission('platform.access.manage')
  async createRole(
    @TenantId() tenantId: string,
    @Body() role: CreateRoleDto,
  ): Promise<CustomRole> {
    return this.repo.createRole(tenantId, role as Omit<CustomRole, 'id' | 'createdAt' | 'updatedAt'>);
  }

  @Put('roles/:id')
  @RequirePermission('platform.access.manage')
  async updateRole(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: UpdateRoleDto,
  ): Promise<CustomRole> {
    return this.repo.updateRole(tenantId, id, update);
  }

  @Delete('roles/:id')
  @RequirePermission('platform.access.manage')
  async deleteRole(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.repo.deleteRole(tenantId, id);
  }

  // Role Assignment endpoints
  @Get('role-assignments')
  @RequirePermission('platform.access.manage')
  async listRoleAssignments(
    @TenantId() tenantId: string,
    @Query('userId') userId?: string,
  ): Promise<RoleAssignment[]> {
    return this.repo.listRoleAssignments(tenantId, userId);
  }

  @Post('role-assignments')
  @RequirePermission('platform.access.manage')
  async assignRole(
    @TenantId() tenantId: string,
    @Body() body: AssignRoleDto,
  ): Promise<RoleAssignment> {
    return this.repo.assignRole(tenantId, body.userId, body.roleId, body.assignedBy);
  }

  @Delete('role-assignments/:userId/:roleId')
  @RequirePermission('platform.access.manage')
  async revokeRole(
    @TenantId() tenantId: string,
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
  ): Promise<void> {
    return this.repo.revokeRole(tenantId, userId, roleId);
  }

  // Audit Export Config endpoints
  @Get('audit-export-config')
  @RequirePermission('platform.audit.read')
  async getAuditExportConfig(@TenantId() tenantId: string): Promise<AuditExportConfig | null> {
    return this.repo.getAuditExportConfig(tenantId);
  }

  @Post('audit-export-config')
  @RequirePermission('platform.settings.manage')
  async upsertAuditExportConfig(
    @TenantId() tenantId: string,
    @Body() config: UpsertAuditExportConfigDto,
    @Req() request: FastifyRequest,
  ): Promise<AuditExportConfig> {
    // Redirecting where audit data is exported to is a data-exfiltration
    // vector if a session were hijacked; require a recently-presented
    // credential, not merely a live session (ADR-029).
    assertRecentAuthentication(request);
    return this.repo.upsertAuditExportConfig(tenantId, config as Omit<AuditExportConfig, 'id' | 'createdAt' | 'updatedAt' | 'lastExportAt'>);
  }

  // Audit Export History endpoints
  @Get('audit-export-history')
  @RequirePermission('platform.audit.read')
  async listAuditExportHistory(
    @TenantId() tenantId: string,
    @Query('configId') configId?: string,
  ): Promise<AuditExportHistory[]> {
    return this.repo.listAuditExportHistory(tenantId, configId);
  }

  @Post('audit-export-history')
  @RequirePermission('platform.settings.manage')
  async createAuditExportHistory(
    @TenantId() tenantId: string,
    @Body() history: CreateAuditExportHistoryDto,
  ): Promise<AuditExportHistory> {
    return this.repo.createAuditExportHistory(tenantId, history as Omit<AuditExportHistory, 'id' | 'createdAt'>);
  }

  @Put('audit-export-history/:id')
  @RequirePermission('platform.settings.manage')
  async updateAuditExportHistory(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: UpdateAuditExportHistoryDto,
  ): Promise<AuditExportHistory> {
    return this.repo.updateAuditExportHistory(tenantId, id, update);
  }
}
