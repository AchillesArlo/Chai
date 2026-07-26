import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { EnterpriseRepository } from './enterprise.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { SsoConfiguration, ScimConfiguration, CustomRole, RoleAssignment, AuditExportConfig, AuditExportHistory } from './enterprise.repository';

@Controller('api/owner/v1/enterprise')
@UseGuards(TenantGuard)
export class EnterpriseController {
  constructor(private readonly repo: EnterpriseRepository) {}

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
    @Body() config: Omit<SsoConfiguration, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<SsoConfiguration> {
    return this.repo.upsertSsoConfig(tenantId, config);
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
    @Body() config: Omit<ScimConfiguration, 'id' | 'createdAt' | 'updatedAt' | 'lastSyncAt'>,
  ): Promise<ScimConfiguration> {
    return this.repo.upsertScimConfig(tenantId, config);
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
    @Body() role: Omit<CustomRole, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<CustomRole> {
    return this.repo.createRole(tenantId, role);
  }

  @Put('roles/:id')
  @RequirePermission('platform.access.manage')
  async updateRole(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: Partial<CustomRole>,
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
    @Body() body: { userId: string; roleId: string; assignedBy: string },
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
    @Body() config: Omit<AuditExportConfig, 'id' | 'createdAt' | 'updatedAt' | 'lastExportAt'>,
  ): Promise<AuditExportConfig> {
    return this.repo.upsertAuditExportConfig(tenantId, config);
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
    @Body() history: Omit<AuditExportHistory, 'id' | 'createdAt'>,
  ): Promise<AuditExportHistory> {
    return this.repo.createAuditExportHistory(tenantId, history);
  }

  @Put('audit-export-history/:id')
  @RequirePermission('platform.settings.manage')
  async updateAuditExportHistory(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: Partial<AuditExportHistory>,
  ): Promise<AuditExportHistory> {
    return this.repo.updateAuditExportHistory(tenantId, id, update);
  }
}
