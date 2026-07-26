import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { IsInt, IsISO8601, IsString, Min } from 'class-validator';

import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import {
  type AppointmentRecord,
  type LeadRecord,
  LeadsRepository,
} from './leads.repository';

function tenantScope(request: FastifyRequest): string {
  const tenantId = request.tenantContext?.tenantId;
  if (!tenantId) throw new NotFoundException();
  return tenantId;
}

class QualifyBody {
  @IsInt()
  @Min(0)
  score!: number;
}

class BookBody {
  @IsString()
  contactId!: string;

  @IsISO8601()
  endsAt!: string;

  @IsString()
  idempotencyKey!: string;

  @IsString()
  resourceId!: string;

  @IsISO8601()
  startsAt!: string;

  @IsString()
  title!: string;
}

@Controller('api/client/v1')
@RequireAudience('client-portal')
export class LeadsController {
  constructor(@Inject(LeadsRepository) private readonly repository: LeadsRepository) {}

  @Get('leads')
  @RequirePermission('lead.read')
  async listLeads(@Req() request: FastifyRequest): Promise<LeadRecord[]> {
    return this.repository.listLeads(tenantScope(request));
  }

  @Get('appointments')
  @RequirePermission('booking.read')
  async listAppointments(
    @Req() request: FastifyRequest,
  ): Promise<AppointmentRecord[]> {
    return this.repository.listAppointments(tenantScope(request));
  }

  @Patch('leads/:id/qualify')
  @RequirePermission('lead.manage')
  async qualify(
    @Param('id') id: string,
    @Body() body: QualifyBody,
    @Req() request: FastifyRequest,
  ): Promise<LeadRecord> {
    const lead = await this.repository.qualifyLead(tenantScope(request), id, body.score);
    if (!lead) throw new NotFoundException();
    return lead;
  }

  @Post('appointments')
  @RequirePermission('booking.manage')
  @HttpCode(201)
  async book(
    @Body() body: BookBody,
    @Req() request: FastifyRequest,
  ): Promise<AppointmentRecord> {
    const result = await this.repository.bookAppointment(tenantScope(request), body);
    if (result.conflict) {
      throw new ConflictException({ code: 'SLOT_CONFLICT' });
    }
    return result.appointment;
  }
}
