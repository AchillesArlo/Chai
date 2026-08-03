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

import { IsInt, IsString, Min } from 'class-validator';

import { RequireAudience } from '../../auth/require-audience.decorator';
import {
  assertCapabilityEnabled,
  assertRecentAuthentication,
} from '../../guards/high-risk';
import { RequireEntitlement } from '../../guards/require-entitlement.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import {
  AdvancedPaymentsRepository,
} from './advanced-payments.repository';

function tenantScope(request: FastifyRequest): string {
  const tenantId = request.tenantContext?.tenantId;
  if (!tenantId) throw new NotFoundException();
  return tenantId;
}

class CreateSubscriptionBody {
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsString()
  billingCycle!: 'MONTHLY' | 'YEARLY';

  @IsString()
  currency!: string;

  @IsString()
  customerId!: string;

  @IsString()
  idempotencyKey!: string;

  @IsString()
  planId!: string;

  @IsString()
  providerRef?: string;
}

class ProcessRefundBody {
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsString()
  idempotencyKey!: string;

  @IsString()
  reason!: string;

  @IsString()
  providerRef?: string;
}

class ResolveReconciliationBody {
  @IsString()
  notes!: string;
}

@Controller('api')
export class AdvancedPaymentsController {
  constructor(
    @Inject(AdvancedPaymentsRepository)
    private readonly repository: AdvancedPaymentsRepository,
  ) {}

  @Post('client/v1/subscriptions')
  @RequireAudience('client-portal')
  @RequireEntitlement('payment_orchestration')
  @RequirePermission('payment.manage')
  @HttpCode(201)
  async createSubscription(
    @Body() body: CreateSubscriptionBody,
    @Req() request: FastifyRequest,
  ) {
    assertCapabilityEnabled('payment_recurring');
    assertRecentAuthentication(request);
    return this.repository.createSubscription(tenantScope(request), {
      amountCents: body.amountCents,
      billingCycle: body.billingCycle,
      currency: body.currency,
      customerId: body.customerId,
      idempotencyKey: body.idempotencyKey,
      planId: body.planId,
      providerRef: body.providerRef,
    });
  }

  @Get('client/v1/subscriptions')
  @RequireAudience('client-portal')
  @RequireEntitlement('payment_orchestration')
  @RequirePermission('payment.read')
  async listSubscriptions(
    @Req() request: FastifyRequest,
  ) {
    const customerId =
      typeof request.query === 'object' &&
      request.query !== null &&
      'customerId' in request.query &&
      typeof (request.query as { customerId: unknown }).customerId === 'string'
        ? (request.query as { customerId: string }).customerId
        : undefined;
    return this.repository.listSubscriptions(tenantScope(request), customerId);
  }

  @Post('client/v1/payments/:id/refunds')
  @RequireAudience('client-portal')
  @RequireEntitlement('payment_orchestration')
  @RequirePermission('payment.approve')
  @HttpCode(201)
  async processRefund(
    @Param('id') paymentId: string,
    @Body() body: ProcessRefundBody,
    @Req() request: FastifyRequest,
  ) {
    assertCapabilityEnabled('payment_refunds');
    assertRecentAuthentication(request);
    return this.repository.processRefund(tenantScope(request), {
      amountCents: body.amountCents,
      idempotencyKey: body.idempotencyKey,
      paymentId,
      providerRef: body.providerRef,
      reason: body.reason,
    });
  }

  @Get('client/v1/payments/settlements')
  @RequireAudience('client-portal')
  @RequireEntitlement('payment_orchestration')
  @RequirePermission('payment.read')
  async listSettlements(@Req() request: FastifyRequest) {
    return this.repository.listSettlements(tenantScope(request));
  }

  @Get('client/v1/payments/reconciliations')
  @RequireAudience('client-portal')
  @RequireEntitlement('payment_orchestration')
  @RequirePermission('payment.read')
  async listReconciliations(@Req() request: FastifyRequest) {
    return this.repository.listReconciliations(tenantScope(request));
  }

  @Post('client/v1/payments/reconciliations/:id/resolve')
  @RequireAudience('client-portal')
  @RequireEntitlement('payment_orchestration')
  @RequirePermission('payment.manage')
  @HttpCode(200)
  async resolveReconciliation(
    @Param('id') id: string,
    @Body() body: ResolveReconciliationBody,
    @Req() request: FastifyRequest,
  ) {
    assertRecentAuthentication(request);
    return this.repository.resolveReconciliation(tenantScope(request), id, body.notes);
  }
}
