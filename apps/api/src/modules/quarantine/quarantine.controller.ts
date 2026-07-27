import { TenantId } from '../../common/tenant-id.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, Inject } from '@nestjs/common';
import {
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { QuarantineRepository } from './quarantine.repository';

const SOURCE_TYPE = ['webhook', 'provider_event', 'unknown_payload'] as const;
const ENTRY_STATUS = ['pending', 'reviewed', 'released', 'rejected', 'expired'] as const;
const ACCESS_TYPE = ['view', 'release', 'reject', 'export'] as const;

class CreateEntryDto {
  /** Untrusted captured payload held for review; never interpreted here. */
  @IsObject()
  rawPayload!: Record<string, unknown>;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsObject()
  redactedPayload!: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  redactionOrder!: Record<string, unknown> | null;

  @IsISO8601()
  retentionUntil!: string;

  @IsOptional()
  @IsISO8601()
  reviewedAt!: string | null;

  @IsOptional()
  @IsString()
  reviewedBy!: string | null;

  @IsOptional()
  @IsString()
  reviewNotes!: string | null;

  @IsOptional()
  @IsString()
  sourceIdentifier!: string | null;

  @IsIn(SOURCE_TYPE)
  sourceType!: (typeof SOURCE_TYPE)[number];

  @IsIn(ENTRY_STATUS)
  status!: (typeof ENTRY_STATUS)[number];

  @IsOptional()
  @IsString()
  tenantId!: string | null;
}

class UpdateEntryDto {
  @IsOptional()
  @IsObject()
  redactedPayload?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  redactionOrder?: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  retentionUntil?: string;

  @IsOptional()
  @IsISO8601()
  reviewedAt?: string;

  @IsOptional()
  @IsString()
  reviewedBy?: string;

  @IsOptional()
  @IsString()
  reviewNotes?: string;

  @IsOptional()
  @IsIn(ENTRY_STATUS)
  status?: (typeof ENTRY_STATUS)[number];
}

class LogAccessDto {
  @IsString()
  accessedBy!: string;

  @IsIn(ACCESS_TYPE)
  accessType!: (typeof ACCESS_TYPE)[number];

  @IsOptional()
  @IsString()
  ipAddress!: string | null;

  @IsOptional()
  @IsString()
  reason!: string | null;

  @IsOptional()
  @IsString()
  userAgent!: string | null;
}

@Controller('api/owner/v1/quarantine')
export class QuarantineController {
  constructor(
    @Inject('QuarantineRepository') private readonly repo: QuarantineRepository,
  ) {}

  @Get('entries')
  @RequirePermission('platform.reliability.read')
  async listEntries(@TenantId() tenantId: string, @Query('status') status?: string) {
    return this.repo.listEntries(tenantId, status);
  }

  @Get('entries/:id')
  @RequirePermission('platform.reliability.read')
  async getEntry(@Param('id') id: string) {
    return this.repo.getEntry(id);
  }

  @Post('entries')
  @RequirePermission('platform.reliability.manage')
  async createEntry(@Body() body: CreateEntryDto) {
    return this.repo.createEntry(body);
  }

  @Put('entries/:id')
  @RequirePermission('platform.reliability.manage')
  async updateEntry(@Param('id') id: string, @Body() body: UpdateEntryDto) {
    return this.repo.updateEntry(id, body);
  }

  @Delete('entries/:id')
  @RequirePermission('platform.reliability.manage')
  async deleteEntry(@Param('id') id: string) {
    return this.repo.deleteEntry(id);
  }

  @Post('entries/:id/access')
  @RequirePermission('platform.reliability.manage')
  async logAccess(@Param('id') id: string, @Body() body: LogAccessDto) {
    return this.repo.logAccess({ ...body, quarantineEntryId: id });
  }

  @Get('entries/:id/access-logs')
  @RequirePermission('platform.reliability.read')
  async listAccessLogs(@Param('id') id: string) {
    return this.repo.listAccessLogs(id);
  }
}
