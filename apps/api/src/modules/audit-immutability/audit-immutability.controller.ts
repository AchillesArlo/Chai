import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { AuditImmutabilityRepository } from './audit-immutability.repository';

const ACTOR_TYPE = ['user', 'system', 'api_key', 'automation'] as const;
const AUDIT_ACTION = ['create', 'update', 'delete', 'read', 'execute'] as const;

class CreateEntryDto {
  @IsIn(AUDIT_ACTION)
  action!: (typeof AUDIT_ACTION)[number];

  @IsString()
  actorId!: string;

  @IsIn(ACTOR_TYPE)
  actorType!: (typeof ACTOR_TYPE)[number];

  @IsOptional()
  @IsString()
  correlationId!: string | null;

  @IsString()
  eventType!: string;

  @IsOptional()
  @IsString()
  ipAddress!: string | null;

  /** Contextual audit metadata; not part of the hashed identity fields' shape. */
  @IsObject()
  metadata!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  newState!: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  previousState!: Record<string, unknown> | null;

  @IsString()
  resourceId!: string;

  @IsString()
  resourceType!: string;

  @IsString()
  tenantId!: string;

  @IsOptional()
  @IsString()
  userAgent!: string | null;
}

@Controller('internal/v1/audit-immutability')
@RequireAudience('service')
@RequirePermission('event.publish')
export class AuditImmutabilityController {
  constructor(private readonly repo: AuditImmutabilityRepository) {}

  @Post('entries')
  async createEntry(@Body() body: CreateEntryDto) {
    return this.repo.createEntry(body);
  }

  @Get('entries/:id')
  async getEntry(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.repo.getEntry(tenantId, id);
  }

  @Get('entries')
  async listEntries(
    @TenantId() tenantId: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('eventType') eventType?: string,
  ) {
    return this.repo.listEntries(tenantId, { resourceType, resourceId, eventType });
  }

  @Post('verify')
  async verifyChain(
    @TenantId() tenantId: string,
    @Body('checkedBy') checkedBy: string,
  ) {
    return this.repo.verifyChain(tenantId, checkedBy);
  }
}
