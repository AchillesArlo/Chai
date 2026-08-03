import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { ToolRiskTier } from '@chai/domain';

import { hasExecutor, TOOL_EXECUTORS, type ToolExecutorContext } from './tool-executors';

export interface ActionRequestRecord {
  completedAt: Date | null;
  createdAt: Date;
  error: string | null;
  id: string;
  idempotencyKey: string;
  origin: 'ai' | 'human';
  result: unknown;
  riskTier: ToolRiskTier;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  tenantId: string;
  tool: string;
}

export interface ExecuteToolInput {
  approvedBy?: string;
  idempotencyKey: string;
  origin: 'ai' | 'human';
  parameters: Record<string, unknown>;
  riskTier: ToolRiskTier;
  tenantId: string;
  tool: string;
}

/**
 * Persists and executes an ActionRequest (blueprint 08_AI §15 steps 8–11):
 * create the idempotent request row, run the tool's executor, save the
 * result, and — since a tool execution IS a business mutation — commit its
 * audit entry and outbox event alongside it (ADR-007).
 *
 * Callers must have already produced an ALLOW decision from
 * `evaluateToolPolicy` before calling this: this class does not re-check
 * policy, it only trusts that a request without one never reaches it (the
 * controller is the one place that asks).
 */
export abstract class ActionsRepository {
  abstract execute(input: ExecuteToolInput): Promise<ActionRequestRecord>;
}

/**
 * In-memory backing for local/e2e without a runtime database — same
 * fallback pattern every other module uses (`createXRepository`). Does not
 * write an audit row or outbox event (there is no transactional store to
 * write them into), so this is not the invariant-bearing implementation;
 * it exists only so `/execute` is reachable without Postgres.
 */
@Injectable()
export class InMemoryActionsRepository extends ActionsRepository {
  private readonly byIdempotencyKey = new Map<string, ActionRequestRecord>();

  constructor(private readonly ctx: ToolExecutorContext) {
    super();
  }

  override async execute(input: ExecuteToolInput): Promise<ActionRequestRecord> {
    if (!hasExecutor(input.tool)) {
      throw new Error(`TOOL_NOT_IMPLEMENTED: ${input.tool}`);
    }
    const key = `${input.tenantId}:${input.idempotencyKey}`;
    const existing = this.byIdempotencyKey.get(key);
    if (existing) {
      return existing;
    }

    const id = randomUUID();
    const createdAt = new Date();
    const executor = TOOL_EXECUTORS[input.tool];
    let record: ActionRequestRecord;
    try {
      const result = await (executor as (typeof TOOL_EXECUTORS)[string])(
        input.tenantId,
        input.parameters,
        this.ctx,
      );
      record = {
        completedAt: new Date(),
        createdAt,
        error: null,
        id,
        idempotencyKey: input.idempotencyKey,
        origin: input.origin,
        result,
        riskTier: input.riskTier,
        status: 'SUCCEEDED',
        tenantId: input.tenantId,
        tool: input.tool,
      };
    } catch (error) {
      record = {
        completedAt: new Date(),
        createdAt,
        error: error instanceof Error ? error.message : String(error),
        id,
        idempotencyKey: input.idempotencyKey,
        origin: input.origin,
        result: null,
        riskTier: input.riskTier,
        status: 'FAILED',
        tenantId: input.tenantId,
        tool: input.tool,
      };
    }
    this.byIdempotencyKey.set(key, record);
    return record;
  }
}
