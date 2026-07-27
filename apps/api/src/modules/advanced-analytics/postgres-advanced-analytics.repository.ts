import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import {
  AdvancedAnalyticsRepository,
  type AnalyticsDashboard,
  type AnalyticsReport,
  type CohortDefinition,
  type PredictionResult,
  type PredictiveModel,
  type ReportExecution,
} from './advanced-analytics.repository';

/** Bentuk baris chai.analytics_dashboard. `layout` adalah jsonb. */
interface AnalyticsDashboardRow {
  created_at: Date;
  description: string | null;
  id: string;
  is_default: boolean;
  layout: unknown;
  name: string;
  tenant_id: string;
  updated_at: Date;
}

/** Bentuk baris chai.analytics_report. `query_config` adalah jsonb. */
interface AnalyticsReportRow {
  created_at: Date;
  description: string | null;
  id: string;
  last_run_at: Date | null;
  name: string;
  query_config: unknown;
  schedule_cron: string | null;
  tenant_id: string;
  updated_at: Date;
}

/**
 * Bentuk baris chai.analytics_report_execution. `result_summary` adalah jsonb
 * nullable, `duration_ms` adalah GENERATED STORED.
 */
interface ReportExecutionRow {
  completed_at: Date | null;
  created_at: Date;
  duration_ms: number | null;
  id: string;
  report_id: string;
  result_summary: unknown | null;
  started_at: Date;
  status: ReportExecution['status'];
  tenant_id: string;
}

/** Bentuk baris chai.predictive_model. `model_config` adalah jsonb. */
interface PredictiveModelRow {
  accuracy: string | null;
  created_at: Date;
  id: string;
  is_active: boolean;
  model_config: unknown;
  model_type: PredictiveModel['modelType'];
  name: string;
  tenant_id: string;
  trained_at: Date | null;
  updated_at: Date;
  version: string;
}

/** Bentuk baris chai.prediction_result. `prediction_value` adalah jsonb. */
interface PredictionResultRow {
  confidence: string | null;
  entity_id: string;
  entity_type: string;
  id: string;
  model_id: string;
  predicted_at: Date;
  prediction_value: unknown;
  tenant_id: string;
}

/** Bentuk baris chai.cohort_definition. `criteria` adalah jsonb. */
interface CohortDefinitionRow {
  created_at: Date;
  criteria: unknown;
  description: string | null;
  id: string;
  member_count: number;
  name: string;
  tenant_id: string;
  updated_at: Date;
}

@Injectable()
export class PostgresAdvancedAnalyticsRepository extends AdvancedAnalyticsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listDashboards(tenantId: string): Promise<AnalyticsDashboard[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<AnalyticsDashboardRow[]>`
        SELECT * FROM chai.analytics_dashboard
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapDashboard(row));
    });
  }

  override async getDashboard(
    tenantId: string,
    id: string,
  ): Promise<AnalyticsDashboard | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<AnalyticsDashboardRow[]>`
        SELECT * FROM chai.analytics_dashboard
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapDashboard(rows[0]) : null;
    });
  }

  override async createDashboard(
    tenantId: string,
    dashboard: Omit<AnalyticsDashboard, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AnalyticsDashboard> {
    const id = randomUUID();
    const layout = JSON.stringify(dashboard.layout);
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<AnalyticsDashboardRow[]>`
        INSERT INTO chai.analytics_dashboard (
          id, tenant_id, name, description, layout, is_default
        ) VALUES (
          ${id}, ${tenantId}, ${dashboard.name}, ${dashboard.description},
          ${layout}::jsonb, ${dashboard.isDefault}
        )
        RETURNING *
      `;
      return mapDashboard(requireRow(rows));
    });
  }

  override async updateDashboard(
    tenantId: string,
    id: string,
    update: Partial<AnalyticsDashboard>,
  ): Promise<AnalyticsDashboard> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadDashboard(tx, tenantId, id);
      if (!existing) throw new Error('Dashboard not found');
      const merged = { ...existing, ...update };
      const layout = JSON.stringify(merged.layout);
      const rows = await tx<AnalyticsDashboardRow[]>`
        UPDATE chai.analytics_dashboard SET
          name = ${merged.name},
          description = ${merged.description},
          layout = ${layout}::jsonb,
          is_default = ${merged.isDefault},
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapDashboard(requireRow(rows));
    });
  }

  override async deleteDashboard(tenantId: string, id: string): Promise<void> {
    await this.tx(tenantId, async (tx) => {
      const result = await tx`
        DELETE FROM chai.analytics_dashboard
        WHERE tenant_id = ${tenantId} AND id = ${id}
      `;
      if (result.count === 0) throw new Error('Dashboard not found');
    });
  }

  override async listReports(tenantId: string): Promise<AnalyticsReport[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<AnalyticsReportRow[]>`
        SELECT * FROM chai.analytics_report
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapReport(row));
    });
  }

  override async getReport(
    tenantId: string,
    id: string,
  ): Promise<AnalyticsReport | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<AnalyticsReportRow[]>`
        SELECT * FROM chai.analytics_report
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapReport(rows[0]) : null;
    });
  }

  override async createReport(
    tenantId: string,
    report: Omit<AnalyticsReport, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt'>,
  ): Promise<AnalyticsReport> {
    const id = randomUUID();
    const queryConfig = JSON.stringify(report.queryConfig);
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<AnalyticsReportRow[]>`
        INSERT INTO chai.analytics_report (
          id, tenant_id, name, description, query_config, schedule_cron
        ) VALUES (
          ${id}, ${tenantId}, ${report.name}, ${report.description},
          ${queryConfig}::jsonb, ${report.scheduleCron}
        )
        RETURNING *
      `;
      return mapReport(requireRow(rows));
    });
  }

  override async updateReport(
    tenantId: string,
    id: string,
    update: Partial<AnalyticsReport>,
  ): Promise<AnalyticsReport> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadReport(tx, tenantId, id);
      if (!existing) throw new Error('Report not found');
      const merged = { ...existing, ...update };
      const queryConfig = JSON.stringify(merged.queryConfig);
      const rows = await tx<AnalyticsReportRow[]>`
        UPDATE chai.analytics_report SET
          name = ${merged.name},
          description = ${merged.description},
          query_config = ${queryConfig}::jsonb,
          schedule_cron = ${merged.scheduleCron},
          last_run_at = ${merged.lastRunAt}::timestamptz,
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapReport(requireRow(rows));
    });
  }

  override async deleteReport(tenantId: string, id: string): Promise<void> {
    await this.tx(tenantId, async (tx) => {
      const result = await tx`
        DELETE FROM chai.analytics_report
        WHERE tenant_id = ${tenantId} AND id = ${id}
      `;
      if (result.count === 0) throw new Error('Report not found');
    });
  }

  override async listReportExecutions(
    tenantId: string,
    reportId?: string,
  ): Promise<ReportExecution[]> {
    const filter = reportId ?? null;
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ReportExecutionRow[]>`
        SELECT * FROM chai.analytics_report_execution
        WHERE tenant_id = ${tenantId}
          AND (${filter}::uuid IS NULL OR report_id = ${filter}::uuid)
        ORDER BY started_at DESC
      `;
      return rows.map((row) => mapExecution(row));
    });
  }

  override async createReportExecution(
    tenantId: string,
    execution: Omit<ReportExecution, 'id' | 'createdAt' | 'durationMs'>,
  ): Promise<ReportExecution> {
    const id = randomUUID();
    const resultSummary =
      execution.resultSummary === null ? null : JSON.stringify(execution.resultSummary);
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ReportExecutionRow[]>`
        INSERT INTO chai.analytics_report_execution (
          id, report_id, tenant_id, status, result_summary, started_at, completed_at
        ) VALUES (
          ${id}, ${execution.reportId}, ${tenantId}, ${execution.status},
          ${resultSummary}::jsonb, ${execution.startedAt}::timestamptz,
          ${execution.completedAt}::timestamptz
        )
        RETURNING *
      `;
      return mapExecution(requireRow(rows));
    });
  }

  override async updateReportExecution(
    tenantId: string,
    id: string,
    update: Partial<ReportExecution>,
  ): Promise<ReportExecution> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadExecution(tx, tenantId, id);
      if (!existing) throw new Error('Execution not found');
      const merged = { ...existing, ...update };
      const resultSummary =
        merged.resultSummary === null ? null : JSON.stringify(merged.resultSummary);
      const rows = await tx<ReportExecutionRow[]>`
        UPDATE chai.analytics_report_execution SET
          status = ${merged.status},
          result_summary = ${resultSummary}::jsonb,
          completed_at = ${merged.completedAt}::timestamptz
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapExecution(requireRow(rows));
    });
  }

  override async listModels(
    tenantId: string,
    modelType?: string,
  ): Promise<PredictiveModel[]> {
    const filter = modelType ?? null;
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<PredictiveModelRow[]>`
        SELECT * FROM chai.predictive_model
        WHERE tenant_id = ${tenantId}
          AND (${filter}::text IS NULL OR model_type = ${filter}::text)
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapModel(row));
    });
  }

  override async getModel(
    tenantId: string,
    id: string,
  ): Promise<PredictiveModel | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<PredictiveModelRow[]>`
        SELECT * FROM chai.predictive_model
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapModel(rows[0]) : null;
    });
  }

  override async createModel(
    tenantId: string,
    model: Omit<PredictiveModel, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<PredictiveModel> {
    const id = randomUUID();
    const modelConfig = JSON.stringify(model.modelConfig);
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<PredictiveModelRow[]>`
        INSERT INTO chai.predictive_model (
          id, tenant_id, model_type, name, version, accuracy, trained_at,
          model_config, is_active
        ) VALUES (
          ${id}, ${tenantId}, ${model.modelType}, ${model.name}, ${model.version},
          ${model.accuracy}, ${model.trainedAt}::timestamptz, ${modelConfig}::jsonb,
          ${model.isActive}
        )
        RETURNING *
      `;
      return mapModel(requireRow(rows));
    });
  }

  override async updateModel(
    tenantId: string,
    id: string,
    update: Partial<PredictiveModel>,
  ): Promise<PredictiveModel> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadModel(tx, tenantId, id);
      if (!existing) throw new Error('Model not found');
      const merged = { ...existing, ...update };
      const modelConfig = JSON.stringify(merged.modelConfig);
      const rows = await tx<PredictiveModelRow[]>`
        UPDATE chai.predictive_model SET
          model_type = ${merged.modelType},
          name = ${merged.name},
          version = ${merged.version},
          accuracy = ${merged.accuracy},
          trained_at = ${merged.trainedAt}::timestamptz,
          model_config = ${modelConfig}::jsonb,
          is_active = ${merged.isActive},
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapModel(requireRow(rows));
    });
  }

  override async listPredictions(
    tenantId: string,
    modelId?: string,
    entityType?: string,
  ): Promise<PredictionResult[]> {
    const modelFilter = modelId ?? null;
    const entityTypeFilter = entityType ?? null;
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<PredictionResultRow[]>`
        SELECT * FROM chai.prediction_result
        WHERE tenant_id = ${tenantId}
          AND (${modelFilter}::uuid IS NULL OR model_id = ${modelFilter}::uuid)
          AND (${entityTypeFilter}::text IS NULL OR entity_type = ${entityTypeFilter}::text)
        ORDER BY predicted_at DESC
      `;
      return rows.map((row) => mapPrediction(row));
    });
  }

  override async createPrediction(
    tenantId: string,
    prediction: Omit<PredictionResult, 'id' | 'predictedAt'>,
  ): Promise<PredictionResult> {
    const id = randomUUID();
    const predictionValue = JSON.stringify(prediction.predictionValue);
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<PredictionResultRow[]>`
        INSERT INTO chai.prediction_result (
          id, model_id, tenant_id, entity_type, entity_id, prediction_value, confidence
        ) VALUES (
          ${id}, ${prediction.modelId}, ${tenantId}, ${prediction.entityType},
          ${prediction.entityId}, ${predictionValue}::jsonb, ${prediction.confidence}
        )
        RETURNING *
      `;
      return mapPrediction(requireRow(rows));
    });
  }

  override async listCohorts(tenantId: string): Promise<CohortDefinition[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<CohortDefinitionRow[]>`
        SELECT * FROM chai.cohort_definition
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapCohort(row));
    });
  }

  override async getCohort(
    tenantId: string,
    id: string,
  ): Promise<CohortDefinition | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<CohortDefinitionRow[]>`
        SELECT * FROM chai.cohort_definition
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapCohort(rows[0]) : null;
    });
  }

  override async createCohort(
    tenantId: string,
    cohort: Omit<CohortDefinition, 'id' | 'createdAt' | 'updatedAt' | 'memberCount'>,
  ): Promise<CohortDefinition> {
    const id = randomUUID();
    const criteria = JSON.stringify(cohort.criteria);
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<CohortDefinitionRow[]>`
        INSERT INTO chai.cohort_definition (
          id, tenant_id, name, description, criteria
        ) VALUES (
          ${id}, ${tenantId}, ${cohort.name}, ${cohort.description}, ${criteria}::jsonb
        )
        RETURNING *
      `;
      return mapCohort(requireRow(rows));
    });
  }

  override async updateCohort(
    tenantId: string,
    id: string,
    update: Partial<CohortDefinition>,
  ): Promise<CohortDefinition> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadCohort(tx, tenantId, id);
      if (!existing) throw new Error('Cohort not found');
      const merged = { ...existing, ...update };
      const criteria = JSON.stringify(merged.criteria);
      const rows = await tx<CohortDefinitionRow[]>`
        UPDATE chai.cohort_definition SET
          name = ${merged.name},
          description = ${merged.description},
          criteria = ${criteria}::jsonb,
          member_count = ${merged.memberCount},
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapCohort(requireRow(rows));
    });
  }

  override async deleteCohort(tenantId: string, id: string): Promise<void> {
    await this.tx(tenantId, async (tx) => {
      const result = await tx`
        DELETE FROM chai.cohort_definition
        WHERE tenant_id = ${tenantId} AND id = ${id}
      `;
      if (result.count === 0) throw new Error('Cohort not found');
    });
  }

  private async loadDashboard(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<AnalyticsDashboard | null> {
    const rows = await tx<AnalyticsDashboardRow[]>`
      SELECT * FROM chai.analytics_dashboard
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapDashboard(rows[0]) : null;
  }

  private async loadReport(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<AnalyticsReport | null> {
    const rows = await tx<AnalyticsReportRow[]>`
      SELECT * FROM chai.analytics_report
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapReport(rows[0]) : null;
  }

  private async loadExecution(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<ReportExecution | null> {
    const rows = await tx<ReportExecutionRow[]>`
      SELECT * FROM chai.analytics_report_execution
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapExecution(rows[0]) : null;
  }

  private async loadModel(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<PredictiveModel | null> {
    const rows = await tx<PredictiveModelRow[]>`
      SELECT * FROM chai.predictive_model
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapModel(rows[0]) : null;
  }

  private async loadCohort(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<CohortDefinition | null> {
    const rows = await tx<CohortDefinitionRow[]>`
      SELECT * FROM chai.cohort_definition
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapCohort(rows[0]) : null;
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

function mapDashboard(row: AnalyticsDashboardRow): AnalyticsDashboard {
  return {
    createdAt: row.created_at.toISOString(),
    description: row.description,
    id: row.id,
    isDefault: row.is_default,
    layout: parseJson<unknown[]>(row.layout),
    name: row.name,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapReport(row: AnalyticsReportRow): AnalyticsReport {
  return {
    createdAt: row.created_at.toISOString(),
    description: row.description,
    id: row.id,
    lastRunAt: row.last_run_at ? row.last_run_at.toISOString() : null,
    name: row.name,
    queryConfig: parseJson<Record<string, unknown>>(row.query_config),
    scheduleCron: row.schedule_cron,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapExecution(row: ReportExecutionRow): ReportExecution {
  return {
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    durationMs: row.duration_ms,
    id: row.id,
    reportId: row.report_id,
    resultSummary:
      row.result_summary === null
        ? null
        : parseJson<Record<string, unknown>>(row.result_summary),
    startedAt: row.started_at.toISOString(),
    status: row.status,
    tenantId: row.tenant_id,
  };
}

function mapModel(row: PredictiveModelRow): PredictiveModel {
  return {
    accuracy: row.accuracy === null ? null : Number(row.accuracy),
    createdAt: row.created_at.toISOString(),
    id: row.id,
    isActive: row.is_active,
    modelConfig: parseJson<Record<string, unknown>>(row.model_config),
    modelType: row.model_type,
    name: row.name,
    tenantId: row.tenant_id,
    trainedAt: row.trained_at ? row.trained_at.toISOString() : null,
    updatedAt: row.updated_at.toISOString(),
    version: row.version,
  };
}

function mapPrediction(row: PredictionResultRow): PredictionResult {
  return {
    confidence: row.confidence === null ? null : Number(row.confidence),
    entityId: row.entity_id,
    entityType: row.entity_type,
    id: row.id,
    modelId: row.model_id,
    predictedAt: row.predicted_at.toISOString(),
    predictionValue: parseJson<Record<string, unknown>>(row.prediction_value),
    tenantId: row.tenant_id,
  };
}

function mapCohort(row: CohortDefinitionRow): CohortDefinition {
  return {
    createdAt: row.created_at.toISOString(),
    criteria: parseJson<Record<string, unknown>>(row.criteria),
    description: row.description,
    id: row.id,
    memberCount: row.member_count,
    name: row.name,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
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
