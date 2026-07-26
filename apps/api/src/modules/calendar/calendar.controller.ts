import {
  Body,
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { IsArray, IsISO8601, IsString } from 'class-validator';

import type { CalendarAdapter, CalendarSlot } from '@chai/connector-sdk';

import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';

function tenantScope(request: FastifyRequest): string {
  const tenantId = request.tenantContext?.tenantId;
  if (!tenantId) throw new NotFoundException();
  return tenantId;
}

class AvailabilityBody {
  @IsArray()
  @IsString({ each: true })
  resourceIds!: string[];

  @IsISO8601()
  windowEnd!: string;

  @IsISO8601()
  windowStart!: string;
}

export const CALENDAR_ADAPTER = Symbol('CALENDAR_ADAPTER');

@Controller('api/client/v1/calendar')
@RequireAudience('client-portal')
export class CalendarController {
  constructor(
    @Inject(CALENDAR_ADAPTER)
    private readonly calendar: CalendarAdapter,
  ) {}

  @Post('availability')
  @RequirePermission('booking.read')
  @HttpCode(200)
  async availability(
    @Body() body: AvailabilityBody,
    @Req() request: FastifyRequest,
  ): Promise<Array<{ endsAt: string; resourceId: string; startsAt: string }>> {
    const tenantId = tenantScope(request);
    const slots: CalendarSlot[] = await this.calendar.listAvailability({
      resourceIds: body.resourceIds,
      tenantId,
      windowEnd: new Date(body.windowEnd),
      windowStart: new Date(body.windowStart),
    });
    return slots.map((slot) => ({
      endsAt: slot.endsAt.toISOString(),
      resourceId: slot.resourceId,
      startsAt: slot.startsAt.toISOString(),
    }));
  }
}
