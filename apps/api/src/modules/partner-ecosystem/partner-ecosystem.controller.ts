import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Delete, Body, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { PartnerEcosystemRepository } from './partner-ecosystem.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { Partner, ApiKey, ApiVersion, SdkRelease } from './partner-ecosystem.repository';

class CreatePartnerDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsString()
  contactEmail!: string;

  @IsIn(['pending', 'approved', 'suspended', 'revoked'])
  status!: 'pending' | 'approved' | 'suspended' | 'revoked';
}

class UpdatePartnerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  @IsIn(['pending', 'approved', 'suspended', 'revoked'])
  status?: 'pending' | 'approved' | 'suspended' | 'revoked';
}

class CreateApiKeyDto {
  @IsString()
  partnerId!: string;

  @IsString()
  name!: string;

  @IsArray()
  @IsString({ each: true })
  scopes!: string[];

  @IsInt()
  rateLimitPerMinute!: number;

  @IsOptional()
  @IsString()
  expiresAt?: string | null;

  @IsBoolean()
  isActive!: boolean;
}

class CreateApiVersionDto {
  @IsString()
  version!: string;

  @IsIn(['active', 'deprecated', 'sunset'])
  status!: 'active' | 'deprecated' | 'sunset';

  @IsString()
  releaseDate!: string;

  @IsOptional()
  @IsString()
  sunsetDate?: string | null;

  @IsOptional()
  @IsString()
  changelog?: string | null;
}

class UpdateApiVersionDto {
  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsIn(['active', 'deprecated', 'sunset'])
  status?: 'active' | 'deprecated' | 'sunset';

  @IsOptional()
  @IsString()
  releaseDate?: string;

  @IsOptional()
  @IsString()
  sunsetDate?: string | null;

  @IsOptional()
  @IsString()
  changelog?: string | null;
}

class CreateSdkReleaseDto {
  @IsString()
  apiVersionId!: string;

  @IsIn(['python', 'nodejs', 'go', 'java', 'ruby'])
  language!: 'python' | 'nodejs' | 'go' | 'java' | 'ruby';

  @IsString()
  version!: string;

  @IsString()
  packageUrl!: string;

  @IsOptional()
  @IsString()
  repositoryUrl?: string | null;

  @IsOptional()
  @IsString()
  releaseNotes?: string | null;

  @IsString()
  publishedAt!: string;
}

@Controller('api/owner/v1/partner-ecosystem')
@UseGuards(TenantGuard)
export class PartnerEcosystemController {
  constructor(
    @Inject(PartnerEcosystemRepository)
    private readonly repo: PartnerEcosystemRepository,
  ) {}

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
    @Body() partner: CreatePartnerDto,
  ): Promise<Partner> {
    return this.repo.createPartner(tenantId, partner as Omit<Partner, 'id' | 'createdAt' | 'updatedAt'>);
  }

  @Put('partners/:id')
  @RequirePermission('platform.access.manage')
  async updatePartner(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() update: UpdatePartnerDto,
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
    @Body() key: CreateApiKeyDto,
  ) {
    return this.repo.createApiKey(tenantId, key as Omit<ApiKey, 'id' | 'createdAt' | 'updatedAt' | 'keyPrefix' | 'lastUsedAt'>);
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
    @Body() version: CreateApiVersionDto,
  ): Promise<ApiVersion> {
    return this.repo.createApiVersion(version as Omit<ApiVersion, 'id' | 'createdAt' | 'updatedAt'>);
  }

  @Put('api-versions/:id')
  @RequirePermission('platform.settings.manage')
  async updateApiVersion(
    @Param('id') id: string,
    @Body() update: UpdateApiVersionDto,
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
    @Body() release: CreateSdkReleaseDto,
  ): Promise<SdkRelease> {
    return this.repo.createSdkRelease(release as Omit<SdkRelease, 'id'>);
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
