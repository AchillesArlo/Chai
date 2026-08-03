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
import { IsOptional, IsString } from 'class-validator';

import type { PaymentSession } from '@chai/connectors/mock-payment';

import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequireEntitlement } from '../../guards/require-entitlement.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { PaymentOrderPort } from '../shared/action-tool.port';
import { PaymentsRepository } from './payments.repository';

function tenantScope(request: FastifyRequest): string {
  const tenantId = request.tenantContext?.tenantId;
  if (!tenantId) throw new NotFoundException();
  return tenantId;
}

class CreateCheckoutBody {
  // FASE 6 — REQ-17-021: amount TIDAK lagi dari input klien. Klien menyebut
  // invoiceId (preferred) atau orderId; controller resolve amount server-side
  // dari invoice/order. AI/klien tidak bisa mengarang harga.
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsString()
  idempotencyKey!: string;
}

@Controller('api')
export class PaymentsController {
  constructor(
    @Inject(PaymentsRepository)
    private readonly repository: PaymentsRepository,
    @Inject(PaymentOrderPort)
    private readonly orders: PaymentOrderPort,
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
    const tenantId = tenantScope(request);
    // FASE 6 — sumber amount tepercaya: resolve dari invoice/order, tolak
    // body tanpa keduanya.
    const { amount, currency, invoiceId, orderId } = await this.resolveCheckoutAmount(tenantId, body);
    try {
      const session = await this.repository.createCheckout(tenantId, {
        amount,
        currency,
        idempotencyKey: body.idempotencyKey,
        invoiceId,
        orderId,
      });
      return serialize(session);
    } catch (error) {
      if (error instanceof Error && error.message === 'PAYMENT_KILL_SWITCH') {
        throw new ServiceUnavailableException({ code: 'PAYMENT_DISABLED' });
      }
      throw error;
    }
  }

  // FASE 6 — REQ-17-021: satu-satunya jalur yang boleh menentukan amount.
  // Klien menyebut invoiceId (preferred, karena invoice sudah immutable
  // setelah issued) atau orderId; keduanya harus milik tenant yang
  // meminta. Tanpa referensi yang valid, checkout ditolak — tidak ada
  // fallback ke input klien.
  private async resolveCheckoutAmount(
    tenantId: string,
    body: CreateCheckoutBody,
  ): Promise<ResolvedCheckoutAmount> {
    if (body.invoiceId) {
      const invoice = await this.orders.getInvoiceAmount(tenantId, body.invoiceId);
      if (!invoice) throw new NotFoundException({ code: 'INVOICE_NOT_FOUND' });
      if (invoice.invoiceStatus !== 'issued') {
        throw new BadRequestException({ code: 'INVOICE_NOT_PAYABLE' });
      }
      return {
        amount: invoice.totalCents,
        currency: invoice.currency,
        invoiceId: invoice.invoiceId,
        orderId: invoice.orderId,
      };
    }
    if (body.orderId) {
      const order = await this.orders.getOrderAmount(tenantId, body.orderId);
      if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
      return {
        amount: order.totalCents,
        currency: order.currency,
        orderId: order.orderId,
      };
    }
    // No trusted reference given: reject rather than accept a client-chosen
    // amount. This is the invariant FASE 6 exists to enforce.
    throw new BadRequestException({ code: 'CHECKOUT_REFERENCE_REQUIRED' });
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

  @Post('service/v1/payments/webhook/:provider')
  @HttpCode(200)
  async webhook(
    @Param('provider') provider: string,
    @Req() request: FastifyRequest,
    @Headers('x-payment-signature') signature?: string,
  ): Promise<{ accepted: boolean; status?: string }> {
    const raw = new TextEncoder().encode(JSON.stringify(request.body ?? {}));
    const result = await this.repository.applyWebhook(provider, raw, signature);
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

interface ResolvedCheckoutAmount {
  amount: number;
  currency: string;
  invoiceId?: string;
  orderId?: string;
}
