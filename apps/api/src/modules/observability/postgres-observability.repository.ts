import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import {
  deriveBurnRate,
  ObservabilityRepository,
  type ErrorBudget,
  type Incident,
  type Runbook,
  type RunbookExecution,
  type ServiceLevelIndicator,
} from './observability.repository';

/** Bentuk baris chai.service_level_indicator — eksplisit, tanpa `any`. */
interface ServiceLevelIndicatorRow {
  created_at: Date;
  current_value: string | null;
  id: string;
  indicator_name: string;
  measurement_window: string;
  service_name: string;
  status: ServiceLevelIndicator['status'];
  target_value: string;
  tenant_id: string;
  updated_at: Date;
}

/** Bentuk baris chai.error_budget. `remaining_seconds` adalah GENERATED STORED. */
interface ErrorBudgetRow {
  burn_rate: string | null;
  consumed_seconds: string;
  created_at: Date;
  id: string;
  period_end: Date;
  period_start: Date;
  remaining_seconds: string;
  service_name: string;
  tenant_id: string;
  total_budget_seconds: string;
  updated_at: Date;
}

/** Bentuk baris chai.incident. `duration_seconds` adalah GENERATED STORED. */
interface IncidentRow {
  created_at: Date;
  created_by: string;
  description: string | null;
  duration_seconds: number | null;
  id: string;
  identified_at: Date | null;
  impact: string | null;
  resolution: string | null;
  resolved_at: Date | null;
  root_cause: string | null;
  severity: Incident['severity'];
  started_at: Date;
  status: Incident['status'];
  tenant_id: string;
  title: string;
  updated_at: Date;
}

/** Bentuk baris chai.runbook. `steps` adalah jsonb. */
interface RunbookRow {
  auto_execute: boolean;
  created_at: Date;
  description: string | null;
  execution_count: number;
  id: string;
  last_executed_at: Date | null;
  name: string;
  steps: unknown;
  success_count: number;
  tenant_id: string;
  trigger_condition: string;
  updated_at: Date;
}

/** Bentuk baris chai.runbook_execution. `duration_seconds` adalah GENERATED STORED. */
interface RunbookExecutionRow {
  completed_at: Date | null;
  created_at: Date;
  duration_seconds: number | null;
  error_message: string | null;
  executed_by: string | null;
  id: string;
  runbook_id: string;
  started_at: Date;
  status: RunbookExecution['status'];
  tenant_id: string;
}

@Injectable()
export class PostgresObservabilityRepository extends ObservabilityRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listSli(tenantId: string): Promise<ServiceLevelIndicator[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ServiceLevelIndicatorRow[]>`
        SELECT * FROM chai.service_level_indicator
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapSli(row));
    });
  }

  override async getSli(
    tenantId: string,
    serviceName: string,
    indicatorName: string,
  ): Promise<ServiceLevelIndicator | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ServiceLevelIndicatorRow[]>`
        SELECT * FROM chai.service_level_indicator
        WHERE tenant_id = ${tenantId}
          AND service_name = ${serviceName}
          AND indicator_name = ${indicatorName}
        LIMIT 1
      `;
      return rows[0] ? mapSli(rows[0]) : null;
    });
  }

  override async upsertSli(
    tenantId: string,
    sli: Omit<ServiceLevelIndicator, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ServiceLevelIndicator> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ServiceLevelIndicatorRow[]>`
        INSERT INTO chai.service_level_indicator (
          id, tenant_id, service_name, indicator_name, target_value,
          current_value, measurement_window, status
        ) VALUES (
          ${id}, ${tenantId}, ${sli.serviceName}, ${sli.indicatorName},
          ${sli.targetValue}, ${sli.currentValue}, ${sli.measurementWindow},
          ${sli.status}
        )
        ON CONFLICT (tenant_id, service_name, indicator_name) DO UPDATE SET
          target_value = EXCLUDED.target_value,
          current_value = EXCLUDED.current_value,
          measurement_window = EXCLUDED.measurement_window,
          status = EXCLUDED.status,
          updated_at = now()
        RETURNING *
      `;
      return mapSli(requireRow(rows));
    });
  }

  override async listErrorBudgets(tenantId: string): Promise<ErrorBudget[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ErrorBudgetRow[]>`
        SELECT * FROM chai.error_budget
        WHERE tenant_id = ${tenantId}
        ORDER BY period_start DESC
      `;
      return rows.map((row) => mapErrorBudget(row));
    });
  }

  override async createErrorBudget(
    tenantId: string,
    budget: Omit<ErrorBudget, 'id' | 'createdAt' | 'updatedAt' | 'remainingSeconds'>,
  ): Promise<ErrorBudget> {
    const id = randomUUID();
    const burnRate = deriveBurnRate(budget);
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ErrorBudgetRow[]>`
        INSERT INTO chai.error_budget (
          id, tenant_id, service_name, period_start, period_end,
          total_budget_seconds, consumed_seconds, burn_rate
        ) VALUES (
          ${id}, ${tenantId}, ${budget.serviceName},
          ${budget.periodStart}::timestamptz, ${budget.periodEnd}::timestamptz,
          ${budget.totalBudgetSeconds}, ${budget.consumedSeconds}, ${burnRate}
        )
        RETURNING *
      `;
      return mapErrorBudget(requireRow(rows));
    });
  }

  override async updateErrorBudget(
    tenantId: string,
    id: string,
    update: Partial<ErrorBudget>,
  ): Promise<ErrorBudget> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadErrorBudget(tx, tenantId, id);
      if (!existing) throw new Error('Error budget not found');
      const merged = { ...existing, ...update };
      const burnRate = deriveBurnRate(merged);
      const rows = await tx<ErrorBudgetRow[]>`
        UPDATE chai.error_budget SET
          service_name = ${merged.serviceName},
          period_start = ${merged.periodStart}::timestamptz,
          period_end = ${merged.periodEnd}::timestamptz,
          total_budget_seconds = ${merged.totalBudgetSeconds},
          consumed_seconds = ${merged.consumedSeconds},
          burn_rate = ${burnRate},
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapErrorBudget(requireRow(rows));
    });
  }

  override async listIncidents(
    tenantId: string,
    status?: string,
  ): Promise<Incident[]> {
    const filter = status ?? null;
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<IncidentRow[]>`
        SELECT * FROM chai.incident
        WHERE tenant_id = ${tenantId}
          AND (${filter}::text IS NULL OR status = ${filter}::text)
        ORDER BY started_at DESC
      `;
      return rows.map((row) => mapIncident(row));
    });
  }

  override async getIncident(
    tenantId: string,
    id: string,
  ): Promise<Incident | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<IncidentRow[]>`
        SELECT * FROM chai.incident
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapIncident(rows[0]) : null;
    });
  }

  override async createIncident(
    tenantId: string,
    incident: Omit<Incident, 'id' | 'createdAt' | 'updatedAt' | 'durationSeconds'>,
  ): Promise<Incident> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<IncidentRow[]>`
        INSERT INTO chai.incident (
          id, tenant_id, severity, status, title, description, impact,
          root_cause, resolution, started_at, identified_at, resolved_at,
          created_by
        ) VALUES (
          ${id}, ${tenantId}, ${incident.severity}, ${incident.status},
          ${incident.title}, ${incident.description}, ${incident.impact},
          ${incident.rootCause}, ${incident.resolution},
          ${incident.startedAt}::timestamptz,
          ${incident.identifiedAt}::timestamptz,
          ${incident.resolvedAt}::timestamptz, ${incident.createdBy}
        )
        RETURNING *
      `;
      return mapIncident(requireRow(rows));
    });
  }

  override async updateIncident(
    tenantId: string,
    id: string,
    update: Partial<Incident>,
  ): Promise<Incident> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadIncident(tx, tenantId, id);
      if (!existing) throw new Error('Incident not found');
      const merged = { ...existing, ...update };
      const rows = await tx<IncidentRow[]>`
        UPDATE chai.incident SET
          severity = ${merged.severity},
          status = ${merged.status},
          title = ${merged.title},
          description = ${merged.description},
          impact = ${merged.impact},
          root_cause = ${merged.rootCause},
          resolution = ${merged.resolution},
          started_at = ${merged.startedAt}::timestamptz,
          identified_at = ${merged.identifiedAt}::timestamptz,
          resolved_at = ${merged.resolvedAt}::timestamptz,
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapIncident(requireRow(rows));
    });
  }

  override async listRunbooks(tenantId: string): Promise<Runbook[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<RunbookRow[]>`
        SELECT * FROM chai.runbook
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapRunbook(row));
    });
  }

  override async getRunbook(
    tenantId: string,
    id: string,
  ): Promise<Runbook | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<RunbookRow[]>`
        SELECT * FROM chai.runbook
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapRunbook(rows[0]) : null;
    });
  }

  override async createRunbook(
    tenantId: string,
    runbook: Omit<
      Runbook,
      'id' | 'createdAt' | 'updatedAt' | 'lastExecutedAt' | 'executionCount' | 'successCount'
    >,
  ): Promise<Runbook> {
    const id = randomUUID();
    const steps = JSON.stringify(runbook.steps);
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<RunbookRow[]>`
        INSERT INTO chai.runbook (
          id, tenant_id, name, description, trigger_condition, steps, auto_execute
        ) VALUES (
          ${id}, ${tenantId}, ${runbook.name}, ${runbook.description},
          ${runbook.triggerCondition}, ${steps}::jsonb, ${runbook.autoExecute}
        )
        RETURNING *
      `;
      return mapRunbook(requireRow(rows));
    });
  }

  override async updateRunbook(
    tenantId: string,
    id: string,
    update: Partial<Runbook>,
  ): Promise<Runbook> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadRunbook(tx, tenantId, id);
      if (!existing) throw new Error('Runbook not found');
      const merged = { ...existing, ...update };
      const steps = JSON.stringify(merged.steps);
      const rows = await tx<RunbookRow[]>`
        UPDATE chai.runbook SET
          name = ${merged.name},
          description = ${merged.description},
          trigger_condition = ${merged.triggerCondition},
          steps = ${steps}::jsonb,
          auto_execute = ${merged.autoExecute},
          last_executed_at = ${merged.lastExecutedAt}::timestamptz,
          execution_count = ${merged.executionCount},
          success_count = ${merged.successCount},
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapRunbook(requireRow(rows));
    });
  }

  override async listRunbookExecutions(
    tenantId: string,
    runbookId?: string,
  ): Promise<RunbookExecution[]> {
    const filter = runbookId ?? null;
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<RunbookExecutionRow[]>`
        SELECT * FROM chai.runbook_execution
        WHERE tenant_id = ${tenantId}
          AND (${filter}::uuid IS NULL OR runbook_id = ${filter}::uuid)
        ORDER BY started_at DESC
      `;
      return rows.map((row) => mapRunbookExecution(row));
    });
  }

  override async createRunbookExecution(
    tenantId: string,
    execution: Omit<RunbookExecution, 'id' | 'createdAt' | 'durationSeconds'>,
  ): Promise<RunbookExecution> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<RunbookExecutionRow[]>`
        INSERT INTO chai.runbook_execution (
          id, runbook_id, tenant_id, status, started_at, completed_at,
          executed_by, error_message
        ) VALUES (
          ${id}, ${execution.runbookId}, ${tenantId}, ${execution.status},
          ${execution.startedAt}::timestamptz, ${execution.completedAt}::timestamptz,
          ${execution.executedBy}, ${execution.errorMessage}
        )
        RETURNING *
      `;
      return mapRunbookExecution(requireRow(rows));
    });
  }

  override async updateRunbookExecution(
    tenantId: string,
    id: string,
    update: Partial<RunbookExecution>,
  ): Promise<RunbookExecution> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadRunbookExecution(tx, tenantId, id);
      if (!existing) throw new Error('Runbook execution not found');
      const merged = { ...existing, ...update };
      const rows = await tx<RunbookExecutionRow[]>`
        UPDATE chai.runbook_execution SET
          status = ${merged.status},
          completed_at = ${merged.completedAt}::timestamptz,
          executed_by = ${merged.executedBy},
          error_message = ${merged.errorMessage}
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapRunbookExecution(requireRow(rows));
    });
  }

  private async loadErrorBudget(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<ErrorBudget | null> {
    const rows = await tx<ErrorBudgetRow[]>`
      SELECT * FROM chai.error_budget
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapErrorBudget(rows[0]) : null;
  }

  private async loadIncident(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<Incident | null> {
    const rows = await tx<IncidentRow[]>`
      SELECT * FROM chai.incident
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapIncident(rows[0]) : null;
  }

  private async loadRunbook(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<Runbook | null> {
    const rows = await tx<RunbookRow[]>`
      SELECT * FROM chai.runbook
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapRunbook(rows[0]) : null;
  }

  private async loadRunbookExecution(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<RunbookExecution | null> {
    const rows = await tx<RunbookExecutionRow[]>`
      SELECT * FROM chai.runbook_execution
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapRunbookExecution(rows[0]) : null;
  }

  private tx<T>(
    tenantId: string,
    work: (tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      work,
    );
  }
}

function mapSli(row: ServiceLevelIndicatorRow): ServiceLevelIndicator {
  return {
    createdAt: row.created_at.toISOString(),
    currentValue: row.current_value === null ? null : Number(row.current_value),
    id: row.id,
    indicatorName: row.indicator_name,
    measurementWindow: row.measurement_window,
    serviceName: row.service_name,
    status: row.status,
    targetValue: Number(row.target_value),
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapErrorBudget(row: ErrorBudgetRow): ErrorBudget {
  return {
    burnRate: row.burn_rate === null ? null : Number(row.burn_rate),
    consumedSeconds: Number(row.consumed_seconds),
    createdAt: row.created_at.toISOString(),
    id: row.id,
    periodEnd: row.period_end.toISOString(),
    periodStart: row.period_start.toISOString(),
    remainingSeconds: Number(row.remaining_seconds),
    serviceName: row.service_name,
    tenantId: row.tenant_id,
    totalBudgetSeconds: Number(row.total_budget_seconds),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapIncident(row: IncidentRow): Incident {
  return {
    createdAt: row.created_at.toISOString(),
    createdBy: row.created_by,
    description: row.description,
    durationSeconds: row.duration_seconds,
    id: row.id,
    identifiedAt: row.identified_at ? row.identified_at.toISOString() : null,
    impact: row.impact,
    resolution: row.resolution,
    resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
    rootCause: row.root_cause,
    severity: row.severity,
    startedAt: row.started_at.toISOString(),
    status: row.status,
    tenantId: row.tenant_id,
    title: row.title,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapRunbook(row: RunbookRow): Runbook {
  return {
    autoExecute: row.auto_execute,
    createdAt: row.created_at.toISOString(),
    description: row.description,
    executionCount: row.execution_count,
    id: row.id,
    lastExecutedAt: row.last_executed_at ? row.last_executed_at.toISOString() : null,
    name: row.name,
    steps: parseJson<unknown[]>(row.steps),
    successCount: row.success_count,
    tenantId: row.tenant_id,
    triggerCondition: row.trigger_condition,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapRunbookExecution(row: RunbookExecutionRow): RunbookExecution {
  return {
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    durationSeconds: row.duration_seconds,
    errorMessage: row.error_message,
    executedBy: row.executed_by,
    id: row.id,
    runbookId: row.runbook_id,
    startedAt: row.started_at.toISOString(),
    status: row.status,
    tenantId: row.tenant_id,
  };
}

/** Driver ini mengembalikan jsonb sebagai string; objek dilewatkan apa adanya. */
function parseJson<T>(value: unknown): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
}

/** Baris pertama hasil RETURNING, tanpa non-null assertion. */
function requireRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) {
    throw new Error('expected a returned row');
  }
  return row;
}
