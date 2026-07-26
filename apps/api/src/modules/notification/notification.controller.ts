import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { NotificationRepository } from './notification.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { Notification } from './notification.repository';

@Controller('api/client/v1/notifications')
@UseGuards(TenantGuard)
export class NotificationController {
  constructor(private readonly repo: NotificationRepository) {}

  @Get()
  @RequirePermission('inbox.read')
  async list(@TenantId() tenantId: string, @Query('userId') userId?: string) { return this.repo.listNotifications(tenantId, userId); }

  @Get(':id')
  @RequirePermission('inbox.read')
  async get(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.getNotification(tenantId, id); }

  @Post()
  @RequirePermission('inbox.manage')
  async create(@TenantId() tenantId: string, @Body() notification: Omit<Notification, 'id' | 'createdAt' | 'updatedAt' | 'sentAt' | 'readAt'>) { return this.repo.createNotification(tenantId, notification); }

  @Put(':id')
  @RequirePermission('inbox.manage')
  async update(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: Partial<Notification>) { return this.repo.updateNotification(tenantId, id, update); }

  @Post(':id/read')
  @RequirePermission('inbox.manage')
  async markAsRead(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.markAsRead(tenantId, id); }
}
