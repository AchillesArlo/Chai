import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { TemplateRepository } from './template.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { MessageTemplate } from './template.repository';

@Controller('api/client/v1/templates')
@UseGuards(TenantGuard)
export class TemplateController {
  constructor(private readonly repo: TemplateRepository) {}

  @Get()
  @RequirePermission('channel.read')
  async list(@TenantId() tenantId: string) { return this.repo.listTemplates(tenantId); }

  @Get(':id')
  @RequirePermission('channel.read')
  async get(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.getTemplate(tenantId, id); }

  @Post()
  @RequirePermission('channel.manage')
  async create(@TenantId() tenantId: string, @Body() template: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'>) { return this.repo.createTemplate(tenantId, template); }

  @Put(':id')
  @RequirePermission('channel.manage')
  async update(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: Partial<MessageTemplate>) { return this.repo.updateTemplate(tenantId, id, update); }

  @Delete(':id')
  @RequirePermission('channel.manage')
  async delete(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.deleteTemplate(tenantId, id); }
}
