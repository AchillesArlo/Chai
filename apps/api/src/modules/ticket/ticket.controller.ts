import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Put, Body, Inject, Param, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { TicketRepository } from './ticket.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';

class CreateTicketDto {
  @IsOptional()
  @IsString()
  contactId!: string | null;

  @IsOptional()
  @IsString()
  conversationId!: string | null;

  @IsString()
  subject!: string;

  @IsOptional()
  @IsString()
  description!: string | null;

  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority!: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

  @IsIn(['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'])
  status!: 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED' | 'CLOSED';

  @IsOptional()
  @IsString()
  assignedTo!: string | null;

  @IsOptional()
  @IsString()
  category!: string | null;

  @IsArray()
  @IsString({ each: true })
  tags!: string[];

  @IsOptional()
  @IsString()
  slaDefinitionId!: string | null;
}

class UpdateTicketDto {
  @IsOptional()
  @IsString()
  contactId?: string | null;

  @IsOptional()
  @IsString()
  conversationId?: string | null;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'])
  status?: 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED' | 'CLOSED';

  @IsOptional()
  @IsString()
  assignedTo?: string | null;

  @IsOptional()
  @IsString()
  category?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  slaDefinitionId?: string | null;

  @IsOptional()
  @IsString()
  firstResponseAt?: string | null;

  @IsOptional()
  @IsString()
  resolvedAt?: string | null;

  @IsOptional()
  @IsString()
  closedAt?: string | null;
}

class CreateTicketCommentDto {
  @IsString()
  authorId!: string;

  @IsBoolean()
  isInternal!: boolean;

  @IsString()
  body!: string;
}

@Controller('api/client/v1/tickets')
@UseGuards(TenantGuard)
export class TicketController {
  constructor(
    @Inject(TicketRepository)
    private readonly repo: TicketRepository,
  ) {}

  @Get()
  @RequirePermission('inbox.read')
  async list(@TenantId() tenantId: string) { return this.repo.listTickets(tenantId); }

  @Get(':id')
  @RequirePermission('inbox.read')
  async get(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.getTicket(tenantId, id); }

  @Post()
  @RequirePermission('inbox.manage')
  async create(@TenantId() tenantId: string, @Body() ticket: CreateTicketDto) { return this.repo.createTicket(tenantId, ticket); }

  @Put(':id')
  @RequirePermission('inbox.manage')
  async update(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: UpdateTicketDto) { return this.repo.updateTicket(tenantId, id, update); }

  @Get(':id/comments')
  @RequirePermission('inbox.read')
  async listComments(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.listComments(tenantId, id); }

  @Post(':id/comments')
  @RequirePermission('inbox.manage')
  async createComment(@TenantId() tenantId: string, @Param('id') ticketId: string, @Body() comment: CreateTicketCommentDto) { return this.repo.createComment(tenantId, { ...comment, ticketId }); }
}
