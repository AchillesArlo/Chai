import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PartnerEcosystemRepository } from './partner-ecosystem.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { Partner, ApiKey, ApiVersion, SdkRelease } from './partner-ecosystem.repository';

@Controller('api/owner/v1/partner-ecosystem')
@UseGuards(TenantGuard)
export class PartnerEcosystemController {
  constructor(private readonly repo: PartnerEcosystemRepository) {}

  // Partner endpoints
  @Get('partners')
  @RequirePermission('platform.access.manage')
  async listPartners(@TenantId() tenantId: string): Promise<Partner[]> {
    return this.repo.listPartners(tenantId);
  }

  @Get('partners/:id')
  @RequirePermission('platform.access.manage')
  async getPartner(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<Partner | null> {
    return this.repo.getPartner(tenantId, id);
  }

  @Post('partners')
  @RequirePermission('platform.access.manage')
  async createPartner(
    @TenantId() tenantId: string,
    @Body() partner: Omit<Partner, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Partner> {
    return this.repo.createPartner(tenantId, partner);
  }

  @Put('partners/:id')
  @RequirePermission('platform.access.manage')
  async updatePartner(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: Partial<Partner>,
  ): Promise<Partner> {
    return this.repo.updatePartner(tenantId, id, update);
  }

  // API Key endpoints
  @Get('api-keys')
  @RequirePermission('platform.access.manage')
  async listApiKeys(
    @TenantId() tenantId: string,
    @Query('partnerId') partnerId?: string,
  ): Promise<ApiKey[]> {
    return this.repo.listApiKeys(tenantId, partnerId);
  }

  @Post('api-keys')
  @RequirePermission('platform.access.manage')
  async createApiKey(
    @TenantId() tenantId: string,
    @Body() key: Omit<ApiKey, 'id' | 'createdAt' | 'updatedAt' | 'keyPrefix' | 'lastUsedAt'>,
  ) {
    return this.repo.createApiKey(tenantId, key);
  }

  @Delete('api-keys/:id')
  @RequirePermission('platform.access.manage')
  async revokeApiKey(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.repo.revokeApiKey(tenantId, id);
  }

  // API Version endpoints
  @Get('api-versions')
  @RequirePermission('platform.settings.manage')
  async listApiVersions(): Promise<ApiVersion[]> {
    return this.repo.listApiVersions();
  }

  @Get('api-versions/:version')
  @RequirePermission('platform.settings.manage')
  async getApiVersion(@Param('version') version: string): Promise<ApiVersion | null> {
    return this.repo.getApiVersion(version);
  }

  @Post('api-versions')
  @RequirePermission('platform.settings.manage')
  async createApiVersion(
    @Body() version: Omit<ApiVersion, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ApiVersion> {
    return this.repo.createApiVersion(version);
  }

  @Put('api-versions/:id')
  @RequirePermission('platform.settings.manage')
  async updateApiVersion(
    @Param('id') id: string,
    @Body() update: Partial<ApiVersion>,
  ): Promise<ApiVersion> {
    return this.repo.updateApiVersion(id, update);
  }

  // SDK Release endpoints
  @Get('sdk-releases')
  @RequirePermission('platform.settings.manage')
  async listSdkReleases(
    @Query('apiVersionId') apiVersionId?: string,
    @Query('language') language?: string,
  ): Promise<SdkRelease[]> {
    return this.repo.listSdkReleases(apiVersionId, language);
  }

  @Post('sdk-releases')
  @RequirePermission('platform.settings.manage')
  async createSdkRelease(
    @Body() release: Omit<SdkRelease, 'id'>,
  ): Promise<SdkRelease> {
    return this.repo.createSdkRelease(release);
  }

  // Rate Limit Usage endpoints
  @Get('rate-limit-usage')
  @RequirePermission('platform.usage.read')
  async getRateLimitUsage(
    @TenantId() tenantId: string,
    @Query('apiKeyId') apiKeyId: string,
  ) {
    return this.repo.getRateLimitUsage(tenantId, apiKeyId);
  }

  @Post('rate-limit-usage/increment')
  @RequirePermission('platform.access.manage')
  async incrementRateLimit(
    @TenantId() tenantId: string,
    @Query('apiKeyId') apiKeyId: string,
  ) {
    return this.repo.incrementRateLimit(tenantId, apiKeyId);
  }
}
