import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Delete, Body, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { SLARepository } from './sla.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { SLABreach } from './sla.repository';

class CreateDefinitionDto {
  @IsString()
  name!: string;

  @IsInt()
  firstResponseTime!: number;

  @IsInt()
  resolutionTime!: number;
}

class UpdateDefinitionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  firstResponseTime?: number;

  @IsOptional()
  @IsInt()
  resolutionTime?: number;
}

class CreateBreachDto {
  @IsString()
  ticketId!: string;

  @IsString()
  slaDefinitionId!: string;

  @IsIn(['FIRST_RESPONSE', 'RESOLUTION'])
  breachType!: 'FIRST_RESPONSE' | 'RESOLUTION';

  @IsString()
  breachedAt!: string;

  @IsOptional()
  @IsString()
  resolvedAt?: string | null;
}

class UpdateBreachDto {
  @IsOptional()
  @IsString()
  ticketId?: string;

  @IsOptional()
  @IsString()
  slaDefinitionId?: string;

  @IsOptional()
  @IsIn(['FIRST_RESPONSE', 'RESOLUTION'])
  breachType?: 'FIRST_RESPONSE' | 'RESOLUTION';

  @IsOptional()
  @IsString()
  breachedAt?: string;

  @IsOptional()
  @IsString()
  resolvedAt?: string | null;
}

@Controller('api/client/v1/sla')
@UseGuards(TenantGuard)
export class SLAController {
  constructor(
    @Inject(SLARepository)
    private readonly repo: SLARepository,
  ) {}

  @Get('definitions')
  @RequirePermission('inbox.read')
  async listDefinitions(@TenantId() tenantId: string) { return this.repo.listDefinitions(tenantId); }

  @Get('definitions/:id')
  @RequirePermission('inbox.read')
  async getDefinition(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.getDefinition(tenantId, id); }

  @Post('definitions')
  @RequirePermission('inbox.manage')
  async createDefinition(@TenantId() tenantId: string, @Body() definition: CreateDefinitionDto) { return this.repo.createDefinition(tenantId, definition); }

  @Put('definitions/:id')
  @RequirePermission('inbox.manage')
  async updateDefinition(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: UpdateDefinitionDto) { return this.repo.updateDefinition(tenantId, id, update); }

  @Delete('definitions/:id')
  @RequirePermission('inbox.manage')
  async deleteDefinition(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.deleteDefinition(tenantId, id); }

  @Get('breaches')
  @RequirePermission('inbox.read')
  async listBreaches(@TenantId() tenantId: string, @Query('ticketId') ticketId?: string) { return this.repo.listBreaches(tenantId, ticketId); }

  @Post('breaches')
  @RequirePermission('inbox.manage')
  async createBreach(@TenantId() tenantId: string, @Body() breach: CreateBreachDto) { return this.repo.createBreach(tenantId, breach as Omit<SLABreach, 'id' | 'tenantId' | 'createdAt'>); }

  @Put('breaches/:id')
  @RequirePermission('inbox.manage')
  async updateBreach(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: UpdateBreachDto) { return this.repo.updateBreach(tenantId, id, update); }
}
