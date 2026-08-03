import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { commitBusinessMutation, type ToolRiskTier } from '@chai/domain';
import { withTenantTransaction, type Database } from '@chai/database';

import { DATABASE } from '../../database/database.module';
import { API_SERVICE_PRINCIPAL_ID } from '../../database/api-ids';
import {
  ActionAppointmentPort,
  ActionKnowledgePort,
  ActionPaymentPort,
  ActionShipmentPort,
} from '../shared/action-tool.port';
import {
  ActionsRepository,
  type ActionRequestRecord,
  type ExecuteToolInput,
} from './actions.repository';
import { hasExecutor, TOOL_EXECUTORS } from './tool-executors';

interface ActionRequestRow {
  approved_by: string | null;
  completed_at: Date | null;
  created_at: Date;
  error: string | null;
  id: string;
  idempotency_key: string;
  origin: 'ai' | 'human';
  parameters: unknown;
  result: unknown;
  risk_tier: ToolRiskTier;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  tenant_id: string;
  tool: string;
}

function toRecord(row: ActionRequestRow): ActionRequestRecord {
  return {
    completedAt: row.completed_at,
    createdAt: row.created_at,
    error: row.error,
    id: row.id,
    idempotencyKey: row.idempotency_key,
    origin: row.origin,
    result: row.result,
    riskTier: row.risk_tier,
    status: row.status,
    tenantId: row.tenant_id,
    tool: row.tool,
  };
}

/**
 * Postgres-backed ActionsRepository. The row insert, the tool's own effect,
 * the audit entry, and the outbox event all land inside one transaction
 * (ADR-007) — a tool execution IS a business mutation, so it gets the same
 * guarantee `commitBusinessMutation` gives every other one.
 */
@Injectable()
export class PostgresActionsRepository extends ActionsRepository {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(ActionKnowledgePort) private readonly knowledge: ActionKnowledgePort,
    @Inject(ActionAppointmentPort) private readonly appointments: ActionAppointmentPort,
    @Inject(ActionShipmentPort) private readonly shipments: ActionShipmentPort,
    @Inject(ActionPaymentPort) private readonly payments: ActionPaymentPort,
  ) {
    super();
  }

  override async execute(input: ExecuteToolInput): Promise<ActionRequestRecord> {
    if (!hasExecutor(input.tool)) {
      // A catalog tool without a wired executor is a hard stop, not a
      // silent success: the policy engine allowing it does not mean the
      // platform can actually do it yet.
      throw new Error(`TOOL_NOT_IMPLEMENTED: ${input.tool}`);
    }

    return withTenantTransaction(
      this.database,
      { principalId: API_SERVICE_PRINCIPAL_ID, tenantId: input.tenantId },
      async (tx) => {
        // Idempotency: a repeat of the same key returns the prior outcome
        // (whatever it was) instead of re-running the tool. Executed inside
        // the same transaction as the row insert attempt so a concurrent
        // duplicate cannot both "win" the insert.
        const existing = await tx<ActionRequestRow[]>`
          SELECT * FROM chai.action_request
          WHERE tenant_id = ${input.tenantId} AND idempotency_key = ${input.idempotencyKey}
        `;
        if (existing[0]) {
          return toRecord(existing[0]);
        }

        const id = randomUUID();
        await tx`
          INSERT INTO chai.action_request
            (id, tenant_id, idempotency_key, tool, origin, risk_tier, approved_by, parameters, status)
          VALUES (
            ${id}, ${input.tenantId}, ${input.idempotencyKey}, ${input.tool},
            ${input.origin}, ${input.riskTier}, ${input.approvedBy ?? null},
            ${tx.json(input.parameters as Parameters<typeof tx.json>[0])}::jsonb, 'PENDING'
          )
        `;

        const executor = TOOL_EXECUTORS[input.tool];
        let outcome: { error: string | null; result: unknown; status: 'SUCCEEDED' | 'FAILED' };
        try {
          const result = await (executor as (typeof TOOL_EXECUTORS)[string])(
            input.tenantId,
            input.parameters,
            { appointments: this.appointments, knowledge: this.knowledge, payments: this.payments, shipments: this.shipments },
          );
          outcome = { error: null, result, status: 'SUCCEEDED' };
        } catch (error) {
          outcome = {
            error: error instanceof Error ? error.message : String(error),
            result: null,
            status: 'FAILED',
          };
        }

        const updated = await commitBusinessMutation(tx, {
          describe: (row) => ({
            audit: {
              action: `tool.${row.tool}.executed`,
              actorId: input.approvedBy ?? API_SERVICE_PRINCIPAL_ID,
              metadata: {
                origin: row.origin,
                riskTier: row.risk_tier,
                status: row.status,
                tool: row.tool,
              },
              resourceId: row.id,
              resourceType: 'action_request',
            },
            events: [
              {
                aggregateId: row.id,
                aggregateType: 'action_request',
                aggregateVersion: 1,
                eventType: `action.${row.status.toLowerCase()}`,
                partitionKey: row.tool,
                payload: {
                  error: row.error,
                  origin: row.origin,
                  status: row.status,
                  tool: row.tool,
                },
              },
            ],
          }),
          mutate: async () => {
            const rows = await tx<ActionRequestRow[]>`
              UPDATE chai.action_request
              SET status = ${outcome.status},
                  result = ${outcome.result === null ? null : tx.json(outcome.result as Parameters<typeof tx.json>[0])}::jsonb,
                  error = ${outcome.error},
                  completed_at = now()
              WHERE id = ${id}
              RETURNING *
            `;
            return rows[0] as ActionRequestRow;
          },
          tenantId: input.tenantId,
        });

        return toRecord(updated);
      },
    );
  }
}
