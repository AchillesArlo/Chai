import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

import type { ShipmentMilestone } from '@chai/connectors/mock-shipping';

import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequireEntitlement } from '../../guards/require-entitlement.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { LogisticsRepository } from './logistics.repository';

function tenantScope(request: FastifyRequest): string {
  const tenantId = request.tenantContext?.tenantId;
  if (!tenantId) throw new NotFoundException();
  return tenantId;
}

class LinkBody {
  @IsString()
  carrier!: string;

  @IsString()
  trackingNumber!: string;
}

class MilestoneBody {
  @IsOptional()
  @IsISO8601()
  at?: string;

  @IsIn([
    'LINKED',
    'PICKED_UP',
    'IN_TRANSIT',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'EXCEPTION',
    'STALE',
    'UNKNOWN',
  ])
  code!: ShipmentMilestone;

  @IsString()
  description!: string;

  /** Provider event id; when supplied, a redelivery is deduplicated. */
  @IsOptional()
  @IsString()
  providerEventId?: string;
}

@Controller('api/client/v1/logistics')
@RequireAudience('client-portal')
@RequireEntitlement('shipment_tracking')
export class LogisticsController {
  constructor(
    @Inject(LogisticsRepository)
    private readonly repository: LogisticsRepository,
  ) {}

  @Post('shipments')
  @RequirePermission('shipment.manage')
  @HttpCode(201)
  async link(@Body() body: LinkBody, @Req() request: FastifyRequest) {
    if (this.repository.isKillSwitchOn()) {
      throw new ServiceUnavailableException({ code: 'LOGISTICS_DISABLED' });
    }
    try {
      const shipment = await this.repository.link(tenantScope(request), body);
      return {
        carrier: shipment.carrier,
        status: shipment.status,
        trackingNumber: shipment.trackingNumber,
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'LOGISTICS_KILL_SWITCH') {
        throw new ServiceUnavailableException({ code: 'LOGISTICS_DISABLED' });
      }
      throw error;
    }
  }

  @Get('shipments')
  @RequirePermission('shipment.read')
  async list(@Req() request: FastifyRequest) {
    const shipments = await this.repository.listShipments(tenantScope(request));
    // Customer-facing summary: no tenantId, no raw event objects. The detail
    // route (shipments/:trackingNumber) still serves the full timeline.
    return shipments.map((shipment) => ({
      carrier: shipment.carrier,
      lastSyncedAt: shipment.lastSyncedAt.toISOString(),
      status: shipment.status,
      trackingNumber: shipment.trackingNumber,
    }));
  }

  @Get('shipments/:trackingNumber')
  @RequirePermission('shipment.read')
  async get(
    @Param('trackingNumber') trackingNumber: string,
    @Req() request: FastifyRequest,
  ) {
    const view = await this.repository.customerView(
      tenantScope(request),
      trackingNumber,
    );
    if (!view) throw new NotFoundException();
    return view;
  }

  /** Internal/test path to simulate carrier milestones (read-only vertical). */
  @Post('shipments/:trackingNumber/events')
  @RequirePermission('shipment.manage')
  @HttpCode(200)
  async appendEvent(
    @Param('trackingNumber') trackingNumber: string,
    @Body() body: MilestoneBody,
    @Req() request: FastifyRequest,
  ) {
    const shipment = await this.repository.appendEvent(
      tenantScope(request),
      trackingNumber,
      {
        at: body.at ? new Date(body.at) : new Date(),
        code: body.code,
        description: body.description,
        ...(body.providerEventId
          ? { providerEventId: body.providerEventId }
          : {}),
      },
    );
    if (!shipment) throw new NotFoundException();
    return {
      status: shipment.status,
      trackingNumber: shipment.trackingNumber,
    };
  }
}
