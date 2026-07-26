import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { IsOptional, IsString, IsISO8601, IsInt, Min } from 'class-validator';

import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { AuditLogRepository } from './audit-log.repository';
import type { AuditLog } from '@chai/domain';

function tenantScope(request: FastifyRequest): string {
  const tenantId = request.tenantContext?.tenantId;
  if (!tenantId) throw new NotFoundException();
  return tenantId;
}

class AuditLogQueryDto {
  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  resourceType?: string;

  @IsOptional()
  @IsString()
  resourceId?: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

@Controller('api/client/v1/audit-logs')
@RequireAudience('client-portal')
export class AuditController {
  constructor(
    @Inject(AuditLogRepository) private readonly repository: AuditLogRepository,
  ) {}

  @Get()
  @RequirePermission('tenant.team.read')
  async listAuditLogs(
    @Query() query: AuditLogQueryDto,
    @Req() request: FastifyRequest,
  ): Promise<AuditLog[]> {
    const tenantId = tenantScope(request);
    const filters = {
      actorId: query.actorId,
      action: query.action,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      limit: query.limit,
      offset: query.offset,
    };
    return this.repository.queryAuditLogs(tenantId, filters);
  }

  @Get(':id')
  @RequirePermission('tenant.team.read')
  async getAuditLog(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ): Promise<AuditLog> {
    const tenantId = tenantScope(request);
    const log = await this.repository.getAuditLogById(tenantId, id);
    if (!log) throw new NotFoundException();
    return log;
  }
}
