import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { CommandEventRepository, InMemoryCommandEventRepository } from './command-event.repository';

const COMMAND_STATUS = [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
] as const;

class CreateCommandDto {
  @IsString()
  aggregateId!: string;

  @IsString()
  aggregateType!: string;

  @IsOptional()
  @IsString()
  causationId!: string | null;

  @IsString()
  commandType!: string;

  @IsOptional()
  @IsISO8601()
  completedAt!: string | null;

  @IsOptional()
  @IsString()
  correlationId!: string | null;

  @IsOptional()
  @IsISO8601()
  deadline!: string | null;

  @IsOptional()
  @IsString()
  errorMessage!: string | null;

  @IsOptional()
  @IsString()
  idempotencyKey!: string | null;

  /** Command envelope metadata; opaque to the store. */
  @IsObject()
  metadata!: Record<string, unknown>;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  result!: Record<string, unknown> | null;

  @IsOptional()
  @IsISO8601()
  startedAt!: string | null;

  @IsIn(COMMAND_STATUS)
  status!: (typeof COMMAND_STATUS)[number];
}

class UpdateCommandDto {
  @IsOptional()
  @IsISO8601()
  completedAt?: string;

  @IsOptional()
  @IsISO8601()
  deadline?: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  result?: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  startedAt?: string;

  @IsOptional()
  @IsIn(COMMAND_STATUS)
  status?: (typeof COMMAND_STATUS)[number];
}

class CreateDomainEventDto {
  @IsString()
  aggregateId!: string;

  @IsString()
  aggregateType!: string;

  @IsInt()
  @Min(0)
  aggregateVersion!: number;

  @IsOptional()
  @IsString()
  causationId!: string | null;

  @IsOptional()
  @IsString()
  commandId!: string | null;

  @IsOptional()
  @IsString()
  correlationId!: string | null;

  @IsString()
  eventType!: string;

  /** Event envelope metadata; opaque to the store. */
  @IsObject()
  metadata!: Record<string, unknown>;

  @IsObject()
  payload!: Record<string, unknown>;
}

@Controller('internal/v1/command-events')
@RequireAudience('service')
@RequirePermission('event.publish')
export class CommandEventController {
  private repo: CommandEventRepository;

  constructor() {
    this.repo = new InMemoryCommandEventRepository();
  }

  @Get()
  async listCommands(@TenantId() tenantId: string, @Query('status') status?: string) {
    return this.repo.listCommands(tenantId, status);
  }

  @Get(':id')
  async getCommand(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.repo.getCommand(tenantId, id);
  }

  @Post()
  async createCommand(@TenantId() tenantId: string, @Body() body: CreateCommandDto) {
    return this.repo.createCommand(tenantId, body);
  }

  @Put(':id')
  async updateCommand(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: UpdateCommandDto) {
    return this.repo.updateCommand(tenantId, id, body);
  }

  @Get('idempotency/:key')
  async findByIdempotencyKey(@TenantId() tenantId: string, @Param('key') key: string) {
    return this.repo.findCommandByIdempotencyKey(tenantId, key);
  }
}

@Controller('domain-events')
@RequireAudience('service')
@RequirePermission('event.publish')
export class DomainEventController {
  private repo: CommandEventRepository;

  constructor() {
    this.repo = new InMemoryCommandEventRepository();
  }

  @Get()
  async listEvents(
    @TenantId() tenantId: string,
    @Query('aggregateType') aggregateType?: string,
    @Query('aggregateId') aggregateId?: string,
  ) {
    return this.repo.listEvents(tenantId, aggregateType, aggregateId);
  }

  @Get(':id')
  async getEvent(@Param('id') id: string) {
    return this.repo.getEvent(id);
  }

  @Post()
  async createEvent(@TenantId() tenantId: string, @Body() body: CreateDomainEventDto) {
    return this.repo.createEvent(tenantId, body);
  }
}
