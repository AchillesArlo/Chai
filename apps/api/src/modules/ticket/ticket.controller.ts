import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { TicketRepository } from './ticket.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';
import type { Ticket, TicketComment } from './ticket.repository';

@Controller('api/client/v1/tickets')
@UseGuards(TenantGuard)
export class TicketController {
  constructor(private readonly repo: TicketRepository) {}

  @Get()
  @RequirePermission('inbox.read')
  async list(@TenantId() tenantId: string) { return this.repo.listTickets(tenantId); }

  @Get(':id')
  @RequirePermission('inbox.read')
  async get(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.getTicket(tenantId, id); }

  @Post()
  @RequirePermission('inbox.manage')
  async create(@TenantId() tenantId: string, @Body() ticket: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt' | 'firstResponseAt' | 'resolvedAt' | 'closedAt'>) { return this.repo.createTicket(tenantId, ticket); }

  @Put(':id')
  @RequirePermission('inbox.manage')
  async update(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: Partial<Ticket>) { return this.repo.updateTicket(tenantId, id, update); }

  @Get(':id/comments')
  @RequirePermission('inbox.read')
  async listComments(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.listComments(tenantId, id); }

  @Post(':id/comments')
  @RequirePermission('inbox.manage')
  async createComment(@TenantId() tenantId: string, @Param('id') ticketId: string, @Body() comment: Omit<TicketComment, 'id' | 'createdAt' | 'updatedAt'>) { return this.repo.createComment(tenantId, { ...comment, ticketId }); }
}
