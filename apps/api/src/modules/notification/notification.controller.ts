import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Body, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { NotificationRepository } from './notification.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';

class CreateNotificationDto {
  @IsString()
  userId!: string;

  @IsIn(['IN_APP', 'EMAIL', 'PUSH'])
  type!: 'IN_APP' | 'EMAIL' | 'PUSH';

  @IsString()
  title!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  channel!: string | null;

  @IsIn(['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED'])
  status!: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

  @IsObject()
  metadata!: Record<string, unknown>;
}

class UpdateNotificationDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsIn(['IN_APP', 'EMAIL', 'PUSH'])
  type?: 'IN_APP' | 'EMAIL' | 'PUSH';

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  channel?: string | null;

  @IsOptional()
  @IsIn(['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED'])
  status?: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  sentAt?: string | null;

  @IsOptional()
  @IsString()
  readAt?: string | null;
}

@Controller('api/client/v1/notifications')
@UseGuards(TenantGuard)
export class NotificationController {
  constructor(
    @Inject(NotificationRepository)
    private readonly repo: NotificationRepository,
  ) {}

  @Get()
  @RequirePermission('inbox.read')
  async list(@TenantId() tenantId: string, @Query('userId') userId?: string) { return this.repo.listNotifications(tenantId, userId); }

  @Get(':id')
  @RequirePermission('inbox.read')
  async get(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.getNotification(tenantId, id); }

  @Post()
  @RequirePermission('inbox.manage')
  async create(@TenantId() tenantId: string, @Body() notification: CreateNotificationDto) { return this.repo.createNotification(tenantId, notification); }

  @Put(':id')
  @RequirePermission('inbox.manage')
  async update(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: UpdateNotificationDto) { return this.repo.updateNotification(tenantId, id, update); }

  @Post(':id/read')
  @RequirePermission('inbox.manage')
  async markAsRead(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.markAsRead(tenantId, id); }
}
