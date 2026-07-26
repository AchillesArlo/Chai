import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AttachmentRepository } from './attachment.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { Attachment } from './attachment.repository';

@Controller('api/client/v1/attachments')
@UseGuards(TenantGuard)
export class AttachmentController {
  constructor(private readonly repo: AttachmentRepository) {}

  @Get()
  @RequirePermission('inbox.read')
  async list(@TenantId() tenantId: string, @Query('messageId') messageId?: string) { return this.repo.listAttachments(tenantId, messageId); }

  @Get(':id')
  @RequirePermission('inbox.read')
  async get(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.getAttachment(tenantId, id); }

  @Post()
  @RequirePermission('inbox.manage')
  async create(@TenantId() tenantId: string, @Body() attachment: Omit<Attachment, 'id' | 'createdAt' | 'updatedAt'>) { return this.repo.createAttachment(tenantId, attachment); }

  @Put(':id')
  @RequirePermission('inbox.manage')
  async update(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: Partial<Attachment>) { return this.repo.updateAttachment(tenantId, id, update); }
}
