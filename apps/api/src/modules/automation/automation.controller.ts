import {
  Body,
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import { IsISO8601, IsObject, IsOptional, IsString } from 'class-validator';
import type { FastifyRequest } from 'fastify';

import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { AutomationService } from './automation.service';

class ScheduleFollowUpBody {
  @IsString()
  conversationId!: string;

  @IsISO8601()
  dueAt!: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

function tenantScope(request: FastifyRequest): string {
  const tenantId = request.tenantContext?.tenantId;
  if (!tenantId) throw new NotFoundException();
  return tenantId;
}

@Controller('api/client/v1')
@RequireAudience('client-portal')
export class AutomationController {
  constructor(
    @Inject(AutomationService)
    private readonly automation: AutomationService,
  ) {}

  @Post('automation/follow-ups')
  @RequirePermission('automation.manage')
  @HttpCode(201)
  async scheduleFollowUp(
    @Body() body: ScheduleFollowUpBody,
    @Req() request: FastifyRequest,
  ) {
    return this.automation.scheduleFollowUp(
      tenantScope(request),
      body.conversationId,
      new Date(body.dueAt),
      body.payload ?? {},
    );
  }
}
