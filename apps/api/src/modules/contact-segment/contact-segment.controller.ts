import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ContactSegmentRepository } from './contact-segment.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { ContactSegment } from './contact-segment.repository';

@Controller('api/client/v1/contact-segments')
@UseGuards(TenantGuard)
export class ContactSegmentController {
  constructor(private readonly repo: ContactSegmentRepository) {}

  @Get()
  @RequirePermission('contact.read')
  async list(@TenantId() tenantId: string) { return this.repo.listSegments(tenantId); }

  @Get(':id')
  @RequirePermission('contact.read')
  async get(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.getSegment(tenantId, id); }

  @Post()
  @RequirePermission('contact.manage')
  async create(@TenantId() tenantId: string, @Body() segment: Omit<ContactSegment, 'id' | 'createdAt' | 'updatedAt' | 'memberCount'>) { return this.repo.createSegment(tenantId, segment); }

  @Put(':id')
  @RequirePermission('contact.manage')
  async update(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: Partial<ContactSegment>) { return this.repo.updateSegment(tenantId, id, update); }

  @Delete(':id')
  @RequirePermission('contact.manage')
  async delete(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.deleteSegment(tenantId, id); }
}
