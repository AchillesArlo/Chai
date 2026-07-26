import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SLARepository } from './sla.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { SLADefinition, SLABreach } from './sla.repository';

@Controller('api/client/v1/sla')
@UseGuards(TenantGuard)
export class SLAController {
  constructor(private readonly repo: SLARepository) {}

  @Get('definitions')
  @RequirePermission('inbox.read')
  async listDefinitions(@TenantId() tenantId: string) { return this.repo.listDefinitions(tenantId); }

  @Get('definitions/:id')
  @RequirePermission('inbox.read')
  async getDefinition(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.getDefinition(tenantId, id); }

  @Post('definitions')
  @RequirePermission('inbox.manage')
  async createDefinition(@TenantId() tenantId: string, @Body() definition: Omit<SLADefinition, 'id' | 'createdAt' | 'updatedAt'>) { return this.repo.createDefinition(tenantId, definition); }

  @Put('definitions/:id')
  @RequirePermission('inbox.manage')
  async updateDefinition(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: Partial<SLADefinition>) { return this.repo.updateDefinition(tenantId, id, update); }

  @Delete('definitions/:id')
  @RequirePermission('inbox.manage')
  async deleteDefinition(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.deleteDefinition(tenantId, id); }

  @Get('breaches')
  @RequirePermission('inbox.read')
  async listBreaches(@TenantId() tenantId: string, @Query('ticketId') ticketId?: string) { return this.repo.listBreaches(tenantId, ticketId); }

  @Post('breaches')
  @RequirePermission('inbox.manage')
  async createBreach(@TenantId() tenantId: string, @Body() breach: Omit<SLABreach, 'id' | 'createdAt'>) { return this.repo.createBreach(tenantId, breach); }

  @Put('breaches/:id')
  @RequirePermission('inbox.manage')
  async updateBreach(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: Partial<SLABreach>) { return this.repo.updateBreach(tenantId, id, update); }
}
