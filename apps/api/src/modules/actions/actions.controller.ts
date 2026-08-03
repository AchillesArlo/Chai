import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

import { evaluateToolPolicy, evaluateAIGuardrails } from '@chai/domain';
import { getKillSwitchRuntime, type KillSwitchProvider } from '@chai/connectors/kill-switch';

import { RequireAudience } from '../../auth/require-audience.decorator';
import { RequirePermission } from '../../guards/require-permission.decorator';
import { EntitlementService } from '../entitlements/entitlement.service';
import {
  evaluateActionPolicy,
  type ActionDecision,
  type ConversationMode,
} from './action-policy';
import { ActionsRepository, type ActionRequestRecord } from './actions.repository';

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

class ExecuteBody extends EvaluateBody {
  @IsString()
  idempotencyKey!: string;
}

/**
 * Which connector kill switch a tool's side effect runs through. A tool
 * without an entry here has no connector-level kill switch of its own
 * (e.g. knowledge search never calls an external provider).
 */
const KILL_SWITCH_PROVIDER_BY_TOOL_PREFIX: Record<string, KillSwitchProvider> = {
  appointment: 'calendar',
  calendar: 'calendar',
  payment: 'payment',
  shipment: 'logistics',
};

export function killSwitchProviderFor(tool: string): KillSwitchProvider | null {
  const prefix = tool.split('.')[0] ?? '';
  return KILL_SWITCH_PROVIDER_BY_TOOL_PREFIX[prefix] ?? null;
}

@Controller('api/client/v1/actions')
@RequireAudience('client-portal')
export class ActionsController {
  constructor(
    @Inject(EntitlementService)
    private readonly entitlements: EntitlementService,
    @Inject(ActionsRepository)
    private readonly actions: ActionsRepository,
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

  /**
   * The only place a tool actually runs. Unlike `/evaluate` (preview only),
   * this executes the tool's real side effect — but only after the SAME
   * policy engine that backs `/evaluate` returns ALLOW for this exact call
   * (blueprint 08_AI §15 steps 5–9; REQ-08-008/REQ-08-021/REQ-09-034). A tool
   * unknown to the catalog, or without a wired executor, is refused, never
   * treated as safe.
   */
  @Post('execute')
  @RequirePermission('conversation.respond')
  @HttpCode(200)
  async execute(
    @Body() body: ExecuteBody,
    @Req() request: FastifyRequest,
  ): Promise<ActionRequestRecord> {
    const tenantId = tenantScope(request);
    const entitlements = await this.entitlements.list(tenantId);

    const decision = evaluateToolPolicy({
      ...(body.approvedBy ? { approvedBy: body.approvedBy } : {}),
      confirmed: body.confirmed ?? false,
      entitlements,
      mode: body.mode,
      origin: body.origin,
      tool: body.tool,
    });

    if (decision.kind !== 'ALLOW') {
      throw new ForbiddenException({
        code: decision.code,
        message: decision.reason,
      });
    }

    // REQ-08-030 & REQ-10-018: AI guardrails (turn tool limits, loop detection, SSRF URL allowlists)
    if (body.origin === 'ai') {
      const guardCheck = evaluateAIGuardrails(body.tool, body.parameters);
      if (!guardCheck.allowed) {
        throw new ForbiddenException({
          code: guardCheck.code ?? 'GUARDRAIL_DENIED',
          message: guardCheck.reason,
        });
      }
    }

    // Connector-level kill switch: a tripped switch stops a tool's side
    // effect even though the policy engine allowed it — policy answers "is
    // this action permitted", the kill switch answers "is this connector
    // safe to call right now", and both must say yes.
    const provider = killSwitchProviderFor(body.tool);
    if (provider && getKillSwitchRuntime().isTripped(provider, tenantId)) {
      throw new ServiceUnavailableException({ code: 'CONNECTOR_DISABLED', provider });
    }

    try {
      return await this.actions.execute({
        approvedBy: body.approvedBy,
        idempotencyKey: body.idempotencyKey,
        origin: body.origin,
        parameters: body.parameters,
        riskTier: decision.risk,
        tenantId,
        tool: body.tool,
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('TOOL_NOT_IMPLEMENTED')) {
        throw new BadRequestException({ code: 'TOOL_NOT_IMPLEMENTED', tool: body.tool });
      }
      if (error instanceof Error && error.message === 'SLOT_CONFLICT') {
        throw new ConflictException({ code: 'SLOT_CONFLICT' });
      }
      throw error;
    }
  }
}
