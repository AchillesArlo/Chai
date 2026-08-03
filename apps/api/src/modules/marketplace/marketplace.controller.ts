import { TenantId } from '../../common/tenant-id.decorator';
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Inject,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { MarketplaceRepository } from './marketplace.repository';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { MarketplaceCategory, WebhookStatus, InstallationStatus } from './marketplace.repository';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateWebhookDto {
  url: string;
  description?: string;
  events?: string[];
}

export interface UpdateWebhookDto {
  url?: string;
  description?: string;
  events?: string[];
  status?: WebhookStatus;
}

export interface CreateListingDto {
  providerId: string;
  name: string;
  description: string;
  category?: MarketplaceCategory;
  iconUrl?: string;
  documentationUrl?: string;
  configSchema?: unknown;
  version?: string;
}

export interface UpdateListingDto {
  name?: string;
  description?: string;
  published?: boolean;
  version?: string;
}

export interface InstallListingDto {
  listingId: string;
  config?: unknown;
}

export interface UpdateInstallationDto {
  config?: unknown;
  status?: InstallationStatus;
}

// ── Controller ───────────────────────────────────────────────────────────────

@Controller('api/owner/v1/marketplace')
export class MarketplaceController {
  constructor(
    @Inject(MarketplaceRepository)
    private readonly repo: MarketplaceRepository,
  ) {}

  // ── Webhook Subscriptions ──────────────────────────────────────────────────

  @Get('webhooks')
  @RequirePermission('platform.settings.manage')
  async listWebhooks(@TenantId() tenantId: string) {
    return this.repo.listWebhooks(tenantId);
  }

  @Get('webhooks/:id')
  @RequirePermission('platform.settings.manage')
  async getWebhook(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const webhook = await this.repo.getWebhook(tenantId, id);
    if (!webhook) throw new NotFoundException('Webhook not found');
    return webhook;
  }

  @Post('webhooks')
  @RequirePermission('platform.settings.manage')
  async createWebhook(
    @TenantId() tenantId: string,
    @Body() dto: CreateWebhookDto,
  ) {
    return this.repo.createWebhook(tenantId, dto);
  }

  @Put('webhooks/:id')
  @RequirePermission('platform.settings.manage')
  async updateWebhook(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.repo.updateWebhook(tenantId, id, dto);
  }

  @Delete('webhooks/:id')
  @RequirePermission('platform.settings.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWebhook(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.repo.deleteWebhook(tenantId, id);
  }

  // ── Marketplace Listings ───────────────────────────────────────────────────

  @Get('listings')
  @RequirePermission('platform.settings.manage')
  async listListings(@Query('category') category?: string) {
    return this.repo.listListings(category as MarketplaceCategory | undefined);
  }

  @Get('listings/:id')
  @RequirePermission('platform.settings.manage')
  async getListing(@Param('id', ParseUUIDPipe) id: string) {
    const listing = await this.repo.getListing(id);
    if (!listing) throw new NotFoundException('Listing not found');
    return listing;
  }

  @Post('listings')
  @RequirePermission('platform.settings.manage')
  async createListing(@Body() dto: CreateListingDto) {
    return this.repo.createListing(dto);
  }

  @Put('listings/:id')
  @RequirePermission('platform.settings.manage')
  async updateListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateListingDto,
  ) {
    return this.repo.updateListing(id, dto);
  }

  // ── Installations ──────────────────────────────────────────────────────────

  @Get('installations')
  @RequirePermission('platform.settings.manage')
  async listInstallations(@TenantId() tenantId: string) {
    return this.repo.listInstallations(tenantId);
  }

  @Post('installations')
  @RequirePermission('platform.settings.manage')
  async installListing(
    @TenantId() tenantId: string,
    @Body() dto: InstallListingDto,
  ) {
    return this.repo.installListing(tenantId, dto.listingId, dto.config);
  }

  @Put('installations/:listingId')
  @RequirePermission('platform.settings.manage')
  async updateInstallation(
    @TenantId() tenantId: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Body() dto: UpdateInstallationDto,
  ) {
    return this.repo.updateInstallation(tenantId, listingId, dto);
  }

  @Delete('installations/:listingId')
  @RequirePermission('platform.settings.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async uninstallInstallation(
    @TenantId() tenantId: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ) {
    await this.repo.uninstallInstallation(tenantId, listingId);
  }
}
