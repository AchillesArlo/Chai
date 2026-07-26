import { TenantId } from '../../common/tenant-id.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ImpersonationRepository, InMemoryImpersonationRepository } from './impersonation.repository';

const IMPERSONATION_STATUS = ['active', 'ended', 'expired', 'revoked'] as const;

class CreateSessionDto {
  @IsOptional()
  @IsISO8601()
  approvedAt!: string | null;

  @IsOptional()
  @IsString()
  approvedBy!: string | null;

  @IsString()
  impersonatedUserId!: string;

  @IsString()
  impersonatorId!: string;

  @IsOptional()
  @IsString()
  ipAddress!: string | null;

  @IsInt()
  @Min(1)
  maxDurationMinutes!: number;

  @IsString()
  reason!: string;

  @IsBoolean()
  requiresApproval!: boolean;

  @IsISO8601()
  startedAt!: string;

  @IsIn(IMPERSONATION_STATUS)
  status!: (typeof IMPERSONATION_STATUS)[number];

  @IsString()
  tenantId!: string;

  @IsOptional()
  @IsString()
  userAgent!: string | null;
}

class UpdateSessionDto {
  @IsOptional()
  @IsISO8601()
  approvedAt?: string;

  @IsOptional()
  @IsString()
  approvedBy?: string;

  @IsOptional()
  @IsISO8601()
  endedAt?: string;

  @IsOptional()
  @IsIn(IMPERSONATION_STATUS)
  status?: (typeof IMPERSONATION_STATUS)[number];
}

class CreateAuditLogDto {
  @IsString()
  action!: string;

  /** Structured detail of the impersonated action; caller-defined shape. */
  @IsObject()
  details!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  resourceId!: string | null;

  @IsOptional()
  @IsString()
  resourceType!: string | null;
}

@Controller('api/owner/v1/impersonation')
export class ImpersonationController {
  private repo: ImpersonationRepository;

  constructor() {
    this.repo = new InMemoryImpersonationRepository();
  }

  @Get('sessions')
  @RequirePermission('platform.audit.read')
  async listSessions(@TenantId() tenantId: string, @Query('status') status?: string) {
    return this.repo.listSessions(tenantId, status);
  }

  @Get('sessions/:id')
  @RequirePermission('platform.audit.read')
  async getSession(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.repo.getSession(tenantId, id);
  }

  @Post('sessions')
  @RequirePermission('platform.access.manage')
  async createSession(@Body() body: CreateSessionDto) {
    return this.repo.createSession(body);
  }

  @Put('sessions/:id')
  @RequirePermission('platform.access.manage')
  async updateSession(@Param('id') id: string, @Body() body: UpdateSessionDto) {
    return this.repo.updateSession(id, body);
  }

  @Get('sessions/:id/audit-logs')
  @RequirePermission('platform.audit.read')
  async listAuditLogs(@Param('id') id: string) {
    return this.repo.listAuditLogs(id);
  }

  @Post('sessions/:id/audit-logs')
  @RequirePermission('platform.access.manage')
  async createAuditLog(@Param('id') id: string, @Body() body: CreateAuditLogDto) {
    return this.repo.createAuditLog({ ...body, impersonationSessionId: id });
  }
}
