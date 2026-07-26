import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { EntitlementService } from '../entitlements/entitlement.service';
import {
  evaluateActionPolicy,
  type ActionDecision,
  type ConversationMode,
} from './action-policy';

function tenantScope(request: FastifyRequest): string {
  const tenantId = request.tenantContext?.tenantId;
  if (!tenantId) throw new NotFoundException();
  return tenantId;
}

class EvaluateBody {
  @IsOptional()
  @IsString()
  approvedBy?: string;

  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;

  @IsIn(['AI_ACTIVE', 'HUMAN_ACTIVE', 'PAUSED'])
  mode!: ConversationMode;

  @IsIn(['ai', 'human'])
  origin!: 'ai' | 'human';

  @IsObject()
  parameters!: Record<string, unknown>;

  @IsString()
  tool!: string;
}

@Controller('api/client/v1/actions')
@RequireAudience('client-portal')
export class ActionsController {
  constructor(
    @Inject(EntitlementService)
    private readonly entitlements: EntitlementService,
  ) {}

  @Post('evaluate')
  @RequirePermission('conversation.respond')
  @HttpCode(200)
  async evaluate(
    @Body() body: EvaluateBody,
    @Req() request: FastifyRequest,
  ): Promise<ActionDecision & { tenantId: string }> {
    const tenantId = tenantScope(request);
    // Entitlements come from the server, never from the caller: a tenant cannot
    // talk its way into a capability it did not buy (GAP-012).
    const decision = evaluateActionPolicy({
      ...(body.approvedBy ? { approvedBy: body.approvedBy } : {}),
      confirmed: body.confirmed ?? false,
      entitlements: await this.entitlements.list(tenantId),
      mode: body.mode,
      origin: body.origin,
      tool: body.tool,
    });

    if (decision.kind === 'deny') {
      throw new ForbiddenException({
        code: decision.code,
        message: decision.reason,
      });
    }

    return { ...decision, tenantId };
  }
}
