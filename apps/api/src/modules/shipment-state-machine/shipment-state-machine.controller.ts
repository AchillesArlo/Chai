import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { ShipmentStateMachineRepository } from './shipment-state-machine.repository';

const SHIPMENT_STATUS = [
  'created',
  'label_created',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'failed',
  'returned',
  'cancelled',
] as const;

class CreateShipmentDto {
  @IsString()
  carrier!: string;

  /** Free-form structured address; shape is carrier-specific. */
  @IsObject()
  destinationAddress!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  dimensions!: Record<string, unknown> | null;

  @IsOptional()
  @IsISO8601()
  estimatedDelivery!: string | null;

  @IsObject()
  metadata!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  orderId!: string | null;

  @IsObject()
  originAddress!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  serviceLevel!: string | null;

  @IsIn(SHIPMENT_STATUS)
  status!: (typeof SHIPMENT_STATUS)[number];

  @IsString()
  tenantId!: string;

  @IsOptional()
  @IsString()
  trackingNumber!: string | null;

  @IsOptional()
  @IsNumber()
  weightKg!: number | null;
}

class UpdateShipmentDto {
  @IsOptional()
  @IsISO8601()
  deliveredAt?: string;

  @IsOptional()
  @IsObject()
  dimensions?: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  estimatedDelivery?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  pickedUpAt?: string;

  @IsOptional()
  @IsString()
  serviceLevel?: string;

  @IsOptional()
  @IsIn(SHIPMENT_STATUS)
  status?: (typeof SHIPMENT_STATUS)[number];

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsNumber()
  weightKg?: number;
}

class CreateShipmentEventDto {
  @IsOptional()
  @IsString()
  description!: string | null;

  @IsString()
  eventType!: string;

  /** Structured geo/location payload from the carrier; opaque here. */
  @IsOptional()
  @IsObject()
  location!: Record<string, unknown> | null;

  @IsObject()
  metadata!: Record<string, unknown>;

  @IsISO8601()
  occurredAt!: string;

  @IsOptional()
  @IsString()
  providerEventId!: string | null;

  @IsString()
  shipmentId!: string;

  @IsString()
  status!: string;

  @IsString()
  tenantId!: string;
}

class CreateShipmentPackageDto {
  /** Package contents manifest; shape is caller-defined. */
  @IsOptional()
  @IsObject()
  contents!: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  dimensions!: Record<string, unknown> | null;

  @IsInt()
  @Min(1)
  packageNumber!: number;

  @IsString()
  shipmentId!: string;

  @IsString()
  status!: string;

  @IsString()
  tenantId!: string;

  @IsOptional()
  @IsNumber()
  weightKg!: number | null;
}

class UpdateShipmentPackageDto {
  @IsOptional()
  @IsObject()
  contents?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  dimensions?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  weightKg?: number;
}

@Controller('internal/v1/shipment-state')
@RequireAudience('service')
@RequirePermission('event.publish')
export class ShipmentController {
  constructor(private readonly repo: ShipmentStateMachineRepository) {}

  @Post()
  async createShipment(@Body() body: CreateShipmentDto) {
    return this.repo.createShipment(body);
  }

  @Get(':id')
  async getShipment(@Param('id') id: string) {
    return this.repo.getShipment(id);
  }

  @Get()
  async listShipments(@TenantId() tenantId: string, @Query('status') status?: string) {
    return this.repo.listShipments(tenantId, status);
  }

  @Post(':id')
  async updateShipment(@Param('id') id: string, @Body() body: UpdateShipmentDto) {
    return this.repo.updateShipment(id, body);
  }
}

@Controller('shipment-events')
@RequireAudience('service')
@RequirePermission('event.publish')
export class ShipmentEventController {
  constructor(private readonly repo: ShipmentStateMachineRepository) {}

  @Post()
  async createShipmentEvent(@Body() body: CreateShipmentEventDto) {
    return this.repo.createShipmentEvent(body);
  }

  @Get(':id')
  async getShipmentEvent(@Param('id') id: string) {
    return this.repo.getShipmentEvent(id);
  }

  @Get('shipment/:shipmentId')
  async listShipmentEvents(@Param('shipmentId') shipmentId: string) {
    return this.repo.listShipmentEvents(shipmentId);
  }
}

@Controller('shipment-packages')
@RequireAudience('service')
@RequirePermission('event.publish')
export class ShipmentPackageController {
  constructor(private readonly repo: ShipmentStateMachineRepository) {}

  @Post()
  async createShipmentPackage(@Body() body: CreateShipmentPackageDto) {
    return this.repo.createShipmentPackage(body);
  }

  @Get(':id')
  async getShipmentPackage(@Param('id') id: string) {
    return this.repo.getShipmentPackage(id);
  }

  @Get('shipment/:shipmentId')
  async listShipmentPackages(@Param('shipmentId') shipmentId: string) {
    return this.repo.listShipmentPackages(shipmentId);
  }

  @Post(':id')
  async updateShipmentPackage(@Param('id') id: string, @Body() body: UpdateShipmentPackageDto) {
    return this.repo.updateShipmentPackage(id, body);
  }
}
