/**
 * Tool executor registry: maps a catalog tool name (`@chai/domain`
 * TOOL_CATALOG) to the port call that actually produces its effect.
 *
 * This is the "step 9: execute handler/workflow" of the blueprint's Tool
 * Execution Contract (08_AI_AGENT_AND_KNOWLEDGE.md §15) — the piece that did
 * not exist anywhere in the codebase before this (REQ-08-008/REQ-08-021/
 * REQ-09-034): the policy engine could only ever answer "would this be
 * allowed", never actually run the tool.
 *
 * Deliberately covers only tools whose port operation already exists and is
 * unambiguous. A tool present in TOOL_CATALOG but absent here (e.g.
 * `appointment.reschedule`, which has no repository method yet) is refused
 * as NOT_IMPLEMENTED rather than silently treated as safe — an executor gap
 * is a hard stop, the same fail-closed posture as an unknown tool.
 *
 * Depends only on modules/shared ports, never on another module's
 * repository directly (02 §5) — see modules/shared/action-tool.port.ts.
 */
import { NotFoundException } from '@nestjs/common';
import { IsISO8601, IsOptional, IsString, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import type {
  ActionAppointmentPort,
  ActionKnowledgePort,
  ActionPaymentPort,
  ActionShipmentPort,
} from '../shared/action-tool.port';

export interface ToolExecutorContext {
  appointments: ActionAppointmentPort;
  knowledge: ActionKnowledgePort;
  payments: ActionPaymentPort;
  shipments: ActionShipmentPort;
}

export type ToolExecutor = (
  tenantId: string,
  parameters: Record<string, unknown>,
  ctx: ToolExecutorContext,
) => Promise<unknown>;

class KnowledgeSearchParams {
  @IsString()
  query!: string;

  @IsOptional()
  knowledgeBaseIds?: string[];
}

class PaymentGetStatusParams {
  @IsString()
  externalId!: string;
}

class ShipmentGetStatusParams {
  @IsString()
  trackingNumber!: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  orderReference?: string;
}

class AppointmentCreateParams {
  @IsString()
  contactId!: string;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  @IsString()
  resourceId!: string;

  @IsString()
  title!: string;

  @IsString()
  idempotencyKey!: string;
}

/**
 * Validates raw tool parameters against the tool's own DTO (step 2 of the
 * execution contract: schema validation, kept separate from step 5 policy).
 * Throws a plain Error with a stable message the caller maps to 400, never
 * lets an unvalidated shape reach a repository call.
 */
function parseParams<T extends object>(
  Dto: new () => T,
  raw: Record<string, unknown>,
): T {
  const instance = plainToInstance(Dto, raw);
  const errors = validateSync(instance, { whitelist: true });
  if (errors.length > 0) {
    throw new Error(
      `INVALID_TOOL_PARAMETERS: ${errors.map((e) => e.property).join(', ')}`,
    );
  }
  return instance;
}

export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  'knowledge.search': async (tenantId, parameters, ctx) => {
    const params = parseParams(KnowledgeSearchParams, parameters);
    return ctx.knowledge.search(tenantId, params.query, params.knowledgeBaseIds ?? []);
  },

  'payment.get_status': async (tenantId, parameters, ctx) => {
    const params = parseParams(PaymentGetStatusParams, parameters);
    const status = await ctx.payments.getStatus(tenantId, params.externalId);
    if (!status) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND' });
    }
    return status;
  },

  'shipment.get_status': async (tenantId, parameters, ctx) => {
    const params = parseParams(ShipmentGetStatusParams, parameters);
    const status = await ctx.shipments.getStatus(tenantId, params.trackingNumber, {
      contactId: params.contactId,
      orderReference: params.orderReference,
    });
    if (!status) {
      throw new NotFoundException({ code: 'SHIPMENT_NOT_FOUND' });
    }
    return status;
  },

  'appointment.create': async (tenantId, parameters, ctx) => {
    const params = parseParams(AppointmentCreateParams, parameters);
    const result = await ctx.appointments.create(tenantId, {
      contactId: params.contactId,
      endsAt: params.endsAt,
      idempotencyKey: params.idempotencyKey,
      resourceId: params.resourceId,
      startsAt: params.startsAt,
      title: params.title,
    });
    if (result.conflict) {
      throw new Error('SLOT_CONFLICT');
    }
    return result.appointment;
  },
};

/** True when a catalog tool actually has a wired executor. */
export function hasExecutor(tool: string): boolean {
  return tool in TOOL_EXECUTORS;
}
