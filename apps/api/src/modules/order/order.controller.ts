import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

import { TenantId } from '../../common/tenant-id.decorator';
import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import {
  type CreateOrderInput,
  type OrderRepository,
  type ServiceItem,
} from './order.repository';

class CreateServiceItemDto {
  @IsString()
  sku!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsInt()
  @Min(0)
  unitPriceCents!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  status?: 'active' | 'archived';
}

class CreateOrderItemDto {
  @IsString()
  serviceItemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

class CreateOrderDto {
  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  externalOrderId?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  channelId?: string;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  agentId?: string;

  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}

class CreateInvoiceDto {
  @IsOptional()
  @IsString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  externalInvoiceNumber?: string;
}

@Controller('api/client/v1/orders')
@RequireAudience('client-portal')
export class OrderController {
  constructor(
    @Inject('OrderRepository') private readonly repo: OrderRepository,
  ) {}

  // ── Katalog (service_item) ───────────────────────────────────────────────

  @Get('catalog')
  @RequirePermission('commerce.read')
  async listCatalog(@TenantId() tenantId: string): Promise<ServiceItem[]> {
    return this.repo.listServiceItems(tenantId);
  }

  @Post('catalog')
  @RequirePermission('commerce.manage')
  async createCatalogItem(
    @TenantId() tenantId: string,
    @Body() body: CreateServiceItemDto,
  ): Promise<ServiceItem> {
    return this.repo.createServiceItem(tenantId, {
      sku: body.sku,
      name: body.name,
      description: body.description ?? null,
      unitPriceCents: body.unitPriceCents,
      currency: body.currency ?? 'IDR',
      status: body.status,
    });
  }

  // ── Order ─────────────────────────────────────────────────────────────────

  @Post()
  @RequirePermission('commerce.manage')
  async createOrder(
    @TenantId() tenantId: string,
    @Body() body: CreateOrderDto,
  ): Promise<{ id: string; totalCents: number; currency: string; status: string }> {
    const order = await this.repo.createOrder(tenantId, body as CreateOrderInput);
    return {
      id: order.id,
      totalCents: order.totalCents,
      currency: order.currency,
      status: order.status,
    };
  }

  @Get(':id')
  @RequirePermission('commerce.read')
  async getOrder(@TenantId() tenantId: string, @Param('id') id: string) {
    const order = await this.repo.getOrder(tenantId, id);
    if (!order) return null;
    return order;
  }

  @Post(':id/invoices')
  @RequirePermission('commerce.manage')
  async createInvoice(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: CreateInvoiceDto,
  ) {
    return this.repo.createInvoice(tenantId, id, {
      dueAt: body.dueAt,
      externalInvoiceNumber: body.externalInvoiceNumber,
    });
  }
}
