import { TenantId } from '../../common/tenant-id.decorator';
import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { PaymentStateMachineRepository } from './payment-state-machine.repository';

const PAYMENT_REQUEST_STATUS = [
  'created',
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'expired',
] as const;

const PAYMENT_ATTEMPT_STATUS = [
  'initiated',
  'pending',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
  'unknown',
] as const;

const REFUND_STATUS = [
  'requested',
  'pending',
  'processing',
  'completed',
  'failed',
  'rejected',
] as const;

const DISPUTE_STATUS = [
  'opened',
  'under_review',
  'evidence_submitted',
  'won',
  'lost',
  'closed',
] as const;

class CreatePaymentRequestDto {
  // Money is an integer count of minor units (17_PAYMENT_AND_LOGISTICS_SPEC);
  // decimals or non-positive amounts are rejected at the boundary.
  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;

  /** Free-form provider metadata; not interpreted server-side. */
  @IsObject()
  metadata!: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  expiresAt!: string | null;

  @IsOptional()
  @IsString()
  orderId!: string | null;

  @IsOptional()
  @IsString()
  paymentMethod!: string | null;

  @IsIn(PAYMENT_REQUEST_STATUS)
  status!: (typeof PAYMENT_REQUEST_STATUS)[number];

  @IsString()
  tenantId!: string;
}

// R-10: once a request exists, amount and currency are immutable. They are
// deliberately omitted here so the global ValidationPipe (forbidNonWhitelisted)
// rejects any request that tries to mutate money after an attempt.
class UpdatePaymentRequestDto {
  @IsOptional()
  @IsISO8601()
  completedAt?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsIn(PAYMENT_REQUEST_STATUS)
  status?: (typeof PAYMENT_REQUEST_STATUS)[number];
}

class CreatePaymentAttemptDto {
  @IsInt()
  @Min(1)
  amount!: number;

  @IsInt()
  @Min(1)
  attemptNumber!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsOptional()
  @IsString()
  errorCode!: string | null;

  @IsOptional()
  @IsString()
  errorMessage!: string | null;

  @IsString()
  paymentRequestId!: string;

  @IsString()
  provider!: string;

  @IsOptional()
  @IsString()
  providerReference!: string | null;

  @IsOptional()
  @IsObject()
  providerResponse!: Record<string, unknown> | null;

  @IsIn(PAYMENT_ATTEMPT_STATUS)
  status!: (typeof PAYMENT_ATTEMPT_STATUS)[number];

  @IsString()
  tenantId!: string;
}

// R-10: amount and currency are fixed at attempt creation and never mutated.
class UpdatePaymentAttemptDto {
  @IsOptional()
  @IsISO8601()
  completedAt?: string;

  @IsOptional()
  @IsString()
  errorCode?: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsString()
  providerReference?: string;

  @IsOptional()
  @IsObject()
  providerResponse?: Record<string, unknown>;

  @IsOptional()
  @IsIn(PAYMENT_ATTEMPT_STATUS)
  status?: (typeof PAYMENT_ATTEMPT_STATUS)[number];
}

class CreateRefundDto {
  @IsInt()
  @Min(1)
  amount!: number;

  @IsObject()
  metadata!: Record<string, unknown>;

  @IsString()
  paymentRequestId!: string;

  @IsOptional()
  @IsString()
  provider!: string | null;

  @IsOptional()
  @IsString()
  providerReference!: string | null;

  @IsOptional()
  @IsString()
  reason!: string | null;

  @IsIn(REFUND_STATUS)
  status!: (typeof REFUND_STATUS)[number];

  @IsString()
  tenantId!: string;
}

// A refund's amount is immutable after creation; only lifecycle fields change.
class UpdateRefundDto {
  @IsOptional()
  @IsISO8601()
  completedAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  providerReference?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsIn(REFUND_STATUS)
  status?: (typeof REFUND_STATUS)[number];
}

class CreateDisputeDto {
  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  disputeId!: string;

  /** Provider-supplied evidence records; opaque to the state machine. */
  @IsArray()
  evidence!: unknown[];

  @IsString()
  paymentRequestId!: string;

  @IsOptional()
  @IsObject()
  providerResponse!: Record<string, unknown> | null;

  @IsString()
  reason!: string;

  @IsIn(DISPUTE_STATUS)
  status!: (typeof DISPUTE_STATUS)[number];

  @IsString()
  tenantId!: string;
}

// A dispute's amount is immutable after creation; only lifecycle fields change.
class UpdateDisputeDto {
  @IsOptional()
  @IsArray()
  evidence?: unknown[];

  @IsOptional()
  @IsObject()
  providerResponse?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsISO8601()
  resolvedAt?: string;

  @IsOptional()
  @IsIn(DISPUTE_STATUS)
  status?: (typeof DISPUTE_STATUS)[number];
}

@Controller('internal/v1/payment-requests')
@RequireAudience('service')
@RequirePermission('event.publish')
export class PaymentRequestController {
  constructor(private readonly repo: PaymentStateMachineRepository) {}

  @Post()
  async createPaymentRequest(@Body() body: CreatePaymentRequestDto) {
    return this.repo.createPaymentRequest(body);
  }

  @Get(':id')
  async getPaymentRequest(@Param('id') id: string) {
    return this.repo.getPaymentRequest(id);
  }

  @Get()
  async listPaymentRequests(@TenantId() tenantId: string, @Query('status') status?: string) {
    return this.repo.listPaymentRequests(tenantId, status);
  }

  @Post(':id')
  async updatePaymentRequest(@Param('id') id: string, @Body() body: UpdatePaymentRequestDto) {
    return this.repo.updatePaymentRequest(id, body);
  }
}

@Controller('payment-attempts')
@RequireAudience('service')
@RequirePermission('event.publish')
export class PaymentAttemptController {
  constructor(private readonly repo: PaymentStateMachineRepository) {}

  @Post()
  async createPaymentAttempt(@Body() body: CreatePaymentAttemptDto) {
    return this.repo.createPaymentAttempt(body);
  }

  @Get(':id')
  async getPaymentAttempt(@Param('id') id: string) {
    return this.repo.getPaymentAttempt(id);
  }

  @Get('request/:requestId')
  async listPaymentAttempts(@Param('requestId') requestId: string) {
    return this.repo.listPaymentAttempts(requestId);
  }

  @Post(':id')
  async updatePaymentAttempt(@Param('id') id: string, @Body() body: UpdatePaymentAttemptDto) {
    return this.repo.updatePaymentAttempt(id, body);
  }
}

@Controller('refunds')
@RequireAudience('service')
@RequirePermission('event.publish')
export class RefundController {
  constructor(private readonly repo: PaymentStateMachineRepository) {}

  @Post()
  async createRefund(@Body() body: CreateRefundDto) {
    return this.repo.createRefund(body);
  }

  @Get(':id')
  async getRefund(@Param('id') id: string) {
    return this.repo.getRefund(id);
  }

  @Get('request/:requestId')
  async listRefunds(@Param('requestId') requestId: string) {
    return this.repo.listRefunds(requestId);
  }

  @Post(':id')
  async updateRefund(@Param('id') id: string, @Body() body: UpdateRefundDto) {
    return this.repo.updateRefund(id, body);
  }
}

@Controller('disputes')
@RequireAudience('service')
@RequirePermission('event.publish')
export class DisputeController {
  constructor(private readonly repo: PaymentStateMachineRepository) {}

  @Post()
  async createDispute(@Body() body: CreateDisputeDto) {
    return this.repo.createDispute(body);
  }

  @Get(':id')
  async getDispute(@Param('id') id: string) {
    return this.repo.getDispute(id);
  }

  @Get('request/:requestId')
  async listDisputes(@Param('requestId') requestId: string) {
    return this.repo.listDisputes(requestId);
  }

  @Post(':id')
  async updateDispute(@Param('id') id: string, @Body() body: UpdateDisputeDto) {
    return this.repo.updateDispute(id, body);
  }
}
