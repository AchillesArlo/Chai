import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Delete, Body, Inject, Param, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { TemplateRepository } from './template.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';

class CreateTemplateDto {
  @IsString()
  name!: string;

  @IsIn(['MARKETING', 'UTILITY', 'AUTHENTICATION'])
  category!: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

  @IsString()
  language!: string;

  @IsString()
  body!: string;

  @IsArray()
  @IsString({ each: true })
  variables!: string[];

  @IsIn(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'])
  status!: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  providerRef!: string | null;
}

class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['MARKETING', 'UTILITY', 'AUTHENTICATION'])
  category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @IsOptional()
  @IsIn(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'])
  status?: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  providerRef?: string | null;
}

@Controller('api/client/v1/templates')
@UseGuards(TenantGuard)
export class TemplateController {
  constructor(
    @Inject(TemplateRepository)
    private readonly repo: TemplateRepository,
  ) {}

  @Get()
  @RequirePermission('channel.read')
  async list(@TenantId() tenantId: string) { return this.repo.listTemplates(tenantId); }

  @Get(':id')
  @RequirePermission('channel.read')
  async get(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.getTemplate(tenantId, id); }

  @Post()
  @RequirePermission('channel.manage')
  async create(@TenantId() tenantId: string, @Body() template: CreateTemplateDto) { return this.repo.createTemplate(tenantId, template); }

  @Put(':id')
  @RequirePermission('channel.manage')
  async update(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: UpdateTemplateDto) { return this.repo.updateTemplate(tenantId, id, update); }

  @Delete(':id')
  @RequirePermission('channel.manage')
  async delete(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.deleteTemplate(tenantId, id); }
}
