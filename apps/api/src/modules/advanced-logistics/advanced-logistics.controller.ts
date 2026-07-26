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
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

import type {
  CarrierRate,
  ClaimCategory,
} from '@chai/domain';

import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequireEntitlement } from '../../guards/require-entitlement.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { AdvancedLogisticsRepository } from './advanced-logistics.repository';

function tenantScope(request: FastifyRequest): string {
  const tenantId = request.tenantContext?.tenantId;
  if (!tenantId) throw new NotFoundException();
  return tenantId;
}

class RateQuote {
  @IsString()
  carrier!: string;

  @IsString()
  currency!: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsString()
  serviceType!: string;

  @IsNumber()
  @Min(0)
  transitDays!: number;
}

class ShopRatesBody {
  @IsOptional()
  priceWeight?: number;

  @IsOptional()
  speedWeight?: number;

  rates!: RateQuote[];
}

class CreateReturnBody {
  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  originalShipmentId?: string;
}

class CreateClaimBody {
  @IsIn(['DAMAGED', 'LOST', 'WRONG_ITEM'])
  category!: ClaimCategory;

  @IsNumber()
  @Min(0)
  amountCents!: number;

  @IsOptional()
  @IsString()
  shipmentId?: string;
}

@Controller('api/client/v1/logistics')
@RequireAudience('client-portal')
@RequireEntitlement('shipment_tracking')
export class AdvancedLogisticsController {
  constructor(
    @Inject(AdvancedLogisticsRepository)
    private readonly repository: AdvancedLogisticsRepository,
  ) {}

  @Post('rates')
  @RequirePermission('shipment.read')
  @HttpCode(200)
  shopRates(@Body() body: ShopRatesBody) {
    const rates: CarrierRate[] = (body.rates ?? []).map((r) => ({
      carrier: r.carrier,
      currency: r.currency,
      price: r.price,
      serviceType: r.serviceType,
      transitDays: r.transitDays,
    }));
    return this.repository.shopRates(rates, {
      priceWeight: body.priceWeight,
      speedWeight: body.speedWeight,
    });
  }

  @Post('returns')
  @RequirePermission('shipment.manage')
  @HttpCode(201)
  createReturn(@Body() body: CreateReturnBody, @Req() request: FastifyRequest) {
    return this.repository.createReturn(tenantScope(request), {
      originalShipmentId: body.originalShipmentId ?? null,
      reason: body.reason,
    });
  }

  @Post('claims')
  @RequirePermission('shipment.manage')
  @HttpCode(201)
  fileClaim(@Body() body: CreateClaimBody, @Req() request: FastifyRequest) {
    return this.repository.createClaim(tenantScope(request), {
      amountCents: body.amountCents,
      category: body.category,
      shipmentId: body.shipmentId ?? null,
    });
  }

  @Get('eta/:shipmentId')
  @RequirePermission('shipment.read')
  async predictEta(
    @Param('shipmentId') shipmentId: string,
    @Req() request: FastifyRequest,
  ) {
    const existing = await this.repository.getEta(tenantScope(request), shipmentId);
    if (existing) return existing;
    const prediction = await this.repository.predictEta(tenantScope(request), {
      shipmentId,
    });
    return prediction;
  }

  @Get('returns/:returnId')
  @RequirePermission('shipment.read')
  async getReturn(
    @Param('returnId') returnId: string,
    @Req() request: FastifyRequest,
  ) {
    const returnRecord = await this.repository.getReturn(
      tenantScope(request),
      returnId,
    );
    if (!returnRecord) throw new NotFoundException('Return not found');
    return returnRecord;
  }

  @Post('returns/:returnId/approve')
  @RequirePermission('shipment.approve')
  async approveReturn(
    @Param('returnId') returnId: string,
    @Req() request: FastifyRequest,
  ) {
    return this.repository.approveReturn(tenantScope(request), returnId);
  }

  @Post('returns/:returnId/complete')
  @RequirePermission('shipment.manage')
  async completeReturn(
    @Param('returnId') returnId: string,
    @Req() request: FastifyRequest,
  ) {
    return this.repository.completeReturn(tenantScope(request), returnId);
  }

  @Get('claims/:claimId')
  @RequirePermission('shipment.read')
  async getClaim(
    @Param('claimId') claimId: string,
    @Req() request: FastifyRequest,
  ) {
    const claim = await this.repository.getClaim(tenantScope(request), claimId);
    if (!claim) throw new NotFoundException('Claim not found');
    return claim;
  }

  @Post('claims/:claimId/investigate')
  @RequirePermission('shipment.manage')
  async investigateClaim(
    @Param('claimId') claimId: string,
    @Req() request: FastifyRequest,
  ) {
    return this.repository.investigateClaim(tenantScope(request), claimId);
  }

  @Post('claims/:claimId/resolve')
  @RequirePermission('shipment.manage')
  async resolveClaim(
    @Param('claimId') claimId: string,
    @Body('resolution') resolution: string,
    @Req() request: FastifyRequest,
  ) {
    return this.repository.resolveClaim(tenantScope(request), claimId, resolution ?? 'RESOLVED');
  }
}
