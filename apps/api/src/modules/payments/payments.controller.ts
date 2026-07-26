import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { IsInt, IsString, Min } from 'class-validator';

import type { PaymentSession } from '@chai/connectors/mock-payment';

import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequireEntitlement } from '../../guards/require-entitlement.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { PaymentsRepository } from './payments.repository';

function tenantScope(request: FastifyRequest): string {
  const tenantId = request.tenantContext?.tenantId;
  if (!tenantId) throw new NotFoundException();
  return tenantId;
}

class CreateCheckoutBody {
  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  currency!: string;

  @IsString()
  idempotencyKey!: string;
}

@Controller('api')
export class PaymentsController {
  constructor(
    @Inject(PaymentsRepository)
    private readonly repository: PaymentsRepository,
  ) {}

  @Post('client/v1/payments/checkout')
  @RequireAudience('client-portal')
  @RequireEntitlement('payment_orchestration')
  @RequirePermission('payment.manage')
  @HttpCode(201)
  async createCheckout(
    @Body() body: CreateCheckoutBody,
    @Req() request: FastifyRequest,
  ): Promise<{
    amount: number;
    checkoutUrl: string;
    currency: string;
    expiresAt: string;
    externalId: string;
    status: string;
  }> {
    if (this.repository.isKillSwitchOn()) {
      throw new ServiceUnavailableException({ code: 'PAYMENT_DISABLED' });
    }
    try {
      const session = await this.repository.createCheckout(tenantScope(request), body);
      return serialize(session);
    } catch (error) {
      if (error instanceof Error && error.message === 'PAYMENT_KILL_SWITCH') {
        throw new ServiceUnavailableException({ code: 'PAYMENT_DISABLED' });
      }
      throw error;
    }
  }

  @Get('client/v1/payments')
  @RequireAudience('client-portal')
  @RequireEntitlement('payment_orchestration')
  @RequirePermission('payment.read')
  async listSessions(@Req() request: FastifyRequest): Promise<
    Array<{
      amount: number;
      checkoutUrl: string;
      currency: string;
      expiresAt: string;
      externalId: string;
      status: string;
    }>
  > {
    const sessions = await this.repository.listSessions(tenantScope(request));
    return sessions.map(serialize);
  }

  @Get('client/v1/payments/:externalId')
  @RequireAudience('client-portal')
  @RequireEntitlement('payment_orchestration')
  @RequirePermission('payment.read')
  async getSession(
    @Param('externalId') externalId: string,
    @Req() request: FastifyRequest,
  ): Promise<{
    amount: number;
    checkoutUrl: string;
    currency: string;
    expiresAt: string;
    externalId: string;
    status: string;
  }> {
    const session = await this.repository.getSession(tenantScope(request), externalId);
    if (!session) throw new NotFoundException();
    return serialize(session);
  }

  @Post('service/v1/payments/webhook')
  @HttpCode(200)
  async webhook(
    @Req() request: FastifyRequest,
    @Headers('x-payment-signature') signature?: string,
  ): Promise<{ accepted: boolean; status?: string }> {
    const raw = new TextEncoder().encode(JSON.stringify(request.body ?? {}));
    const result = await this.repository.applyWebhook(raw, signature);
    if (!result.verified || !result.event) {
      // An unverified or unresolvable payload must be rejected outright, never
      // acknowledged as accepted: a 200 here would let a forged webhook look
      // successful to whoever sent it (10_SECURITY §9).
      throw new BadRequestException({ code: 'WEBHOOK_REJECTED' });
    }
    return { accepted: true, status: result.event.status };
  }
}

function serialize(session: PaymentSession) {
  return {
    amount: session.amount,
    checkoutUrl: session.checkoutUrl,
    currency: session.currency,
    expiresAt: session.expiresAt.toISOString(),
    externalId: session.externalId,
    status: session.status,
  };
}
