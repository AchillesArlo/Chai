import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Delete, Body, Inject, Param, UseGuards } from '@nestjs/common';
import { IsInt, IsObject, IsOptional, IsString } from 'class-validator';
import { ContactSegmentRepository } from './contact-segment.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';

class CreateContactSegmentDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description!: string | null;

  @IsObject()
  filterRules!: Record<string, unknown>;
}

class UpdateContactSegmentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsObject()
  filterRules?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  memberCount?: number;
}

@Controller('api/client/v1/contact-segments')
@UseGuards(TenantGuard)
export class ContactSegmentController {
  constructor(
    @Inject(ContactSegmentRepository)
    private readonly repo: ContactSegmentRepository,
  ) {}

  @Get()
  @RequirePermission('contact.read')
  async list(@TenantId() tenantId: string) { return this.repo.listSegments(tenantId); }

  @Get(':id')
  @RequirePermission('contact.read')
  async get(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.getSegment(tenantId, id); }

  @Post()
  @RequirePermission('contact.manage')
  async create(@TenantId() tenantId: string, @Body() segment: CreateContactSegmentDto) { return this.repo.createSegment(tenantId, { ...segment, tenantId }); }

  @Put(':id')
  @RequirePermission('contact.manage')
  async update(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: UpdateContactSegmentDto) { return this.repo.updateSegment(tenantId, id, update); }

  @Delete(':id')
  @RequirePermission('contact.manage')
  async delete(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.deleteSegment(tenantId, id); }
}
