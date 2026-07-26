import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
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
import { OutboxRepository, InMemoryOutboxRepository } from './outbox.repository';

const OUTBOX_EVENT_STATUS = ['pending', 'published', 'failed', 'expired'] as const;

class CreateOutboxEventDto {
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
  correlationId!: string | null;

  @IsOptional()
  @IsString()
  errorMessage!: string | null;

  @IsString()
  eventType!: string;

  @IsOptional()
  @IsISO8601()
  failedAt!: string | null;

  @IsInt()
  @Min(0)
  maxRetries!: number;

  /** Domain event body; opaque to the dispatcher. */
  @IsObject()
  metadata!: Record<string, unknown>;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  publishedAt!: string | null;

  @IsInt()
  @Min(0)
  retryCount!: number;

  @IsIn(OUTBOX_EVENT_STATUS)
  status!: (typeof OUTBOX_EVENT_STATUS)[number];
}

class UpdateOutboxEventDto {
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsISO8601()
  failedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxRetries?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  publishedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  retryCount?: number;

  @IsOptional()
  @IsIn(OUTBOX_EVENT_STATUS)
  status?: (typeof OUTBOX_EVENT_STATUS)[number];
}

class CreateSubscriptionDto {
  @IsBoolean()
  active!: boolean;

  @IsString()
  endpointUrl!: string;

  @IsArray()
  @IsString({ each: true })
  eventTypes!: string[];

  @IsOptional()
  @IsString()
  lastDeliveredAt!: string | null;

  @IsOptional()
  @IsString()
  lastError!: string | null;

  @IsString()
  name!: string;

  /** Retry/backoff configuration; shape is caller-defined. */
  @IsObject()
  retryPolicy!: Record<string, unknown>;

  @IsString()
  secretKey!: string;
}

class UpdateSubscriptionDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  endpointUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eventTypes?: string[];

  @IsOptional()
  @IsISO8601()
  lastDeliveredAt?: string;

  @IsOptional()
  @IsString()
  lastError?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  retryPolicy?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  secretKey?: string;
}

@Controller('internal/v1/outbox')
@RequireAudience('service')
@RequirePermission('outbox.dispatch')
export class OutboxController {
  private repo: OutboxRepository;

  constructor() {
    this.repo = new InMemoryOutboxRepository();
  }

  @Get('events')
  async listEvents(@TenantId() tenantId: string, @Query('status') status?: string) {
    return this.repo.listEvents(tenantId, status);
  }

  @Get('events/:id')
  async getEvent(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.repo.getEvent(tenantId, id);
  }

  @Post('events')
  async createEvent(@TenantId() tenantId: string, @Body() body: CreateOutboxEventDto) {
    return this.repo.createEvent(tenantId, body);
  }

  @Put('events/:id')
  async updateEvent(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: UpdateOutboxEventDto) {
    return this.repo.updateEvent(tenantId, id, body);
  }

  @Delete('events/:id')
  async deleteEvent(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.repo.deleteEvent(tenantId, id);
  }

  @Get('subscriptions')
  async listSubscriptions(@TenantId() tenantId: string) {
    return this.repo.listSubscriptions(tenantId);
  }

  @Get('subscriptions/:id')
  async getSubscription(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.repo.getSubscription(tenantId, id);
  }

  @Post('subscriptions')
  async createSubscription(@TenantId() tenantId: string, @Body() body: CreateSubscriptionDto) {
    return this.repo.createSubscription(tenantId, body);
  }

  @Put('subscriptions/:id')
  async updateSubscription(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: UpdateSubscriptionDto) {
    return this.repo.updateSubscription(tenantId, id, body);
  }

  @Delete('subscriptions/:id')
  async deleteSubscription(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.repo.deleteSubscription(tenantId, id);
  }
}
