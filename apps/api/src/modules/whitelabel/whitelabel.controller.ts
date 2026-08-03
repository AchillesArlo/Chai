import { TenantId } from '../../common/tenant-id.decorator';
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Inject,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { WhitelabelRepository } from './whitelabel.repository';
import type { DomainStatus, SslStatus } from './whitelabel.repository';
import { RequirePermission } from '../../guards/require-permission.decorator';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateDomainDto {
  domain: string;
}

export interface UpdateDomainDto {
  status?: DomainStatus;
  sslStatus?: SslStatus;
}

export interface UpsertThemeDto {
  brandName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  customCss?: string;
  headerHtml?: string;
  footerHtml?: string;
}

// ── Controller ───────────────────────────────────────────────────────────────

@Controller('api/owner/v1/whitelabel')
export class WhitelabelController {
  constructor(
    @Inject(WhitelabelRepository)
    private readonly repo: WhitelabelRepository,
  ) {}

  // ── Custom Domains ─────────────────────────────────────────────────────────

  @Get('domains')
  @RequirePermission('platform.tenant.read')
  async listDomains(@TenantId() tenantId: string) {
    return this.repo.listDomains(tenantId);
  }

  @Get('domains/:id')
  @RequirePermission('platform.tenant.read')
  async getDomain(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const domain = await this.repo.getDomain(tenantId, id);
    if (!domain) throw new NotFoundException('Domain not found');
    return domain;
  }

  @Post('domains')
  @RequirePermission('platform.tenant.manage')
  async createDomain(
    @TenantId() tenantId: string,
    @Body() dto: CreateDomainDto,
  ) {
    return this.repo.createDomain(tenantId, dto);
  }

  @Put('domains/:id')
  @RequirePermission('platform.tenant.manage')
  async updateDomain(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDomainDto,
  ) {
    return this.repo.updateDomain(tenantId, id, dto);
  }

  @Delete('domains/:id')
  @RequirePermission('platform.tenant.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDomain(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.repo.deleteDomain(tenantId, id);
  }

  // ── Theme Settings ─────────────────────────────────────────────────────────

  @Get('themes')
  @RequirePermission('platform.tenant.read')
  async getTheme(@TenantId() tenantId: string) {
    const theme = await this.repo.getTheme(tenantId);
    if (!theme) throw new NotFoundException('Theme not configured');
    return theme;
  }

  @Put('themes')
  @RequirePermission('platform.tenant.manage')
  async upsertTheme(
    @TenantId() tenantId: string,
    @Body() dto: UpsertThemeDto,
  ) {
    return this.repo.createOrUpdateTheme(tenantId, dto);
  }
}
