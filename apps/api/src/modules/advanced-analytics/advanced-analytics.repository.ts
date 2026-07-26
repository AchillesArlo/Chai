import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface AnalyticsDashboard {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  layout: unknown[]; // free-form JSONB (schema-less)
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsReport {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  queryConfig: Record<string, unknown>;
  scheduleCron: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportExecution {
  id: string;
  reportId: string;
  tenantId: string;
  status: 'running' | 'completed' | 'failed';
  resultSummary: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface PredictiveModel {
  id: string;
  tenantId: string;
  modelType: 'churn_prediction' | 'revenue_forecast' | 'engagement_score';
  name: string;
  version: string;
  accuracy: number | null;
  trainedAt: string | null;
  modelConfig: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PredictionResult {
  id: string;
  modelId: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  predictionValue: Record<string, unknown>;
  confidence: number | null;
  predictedAt: string;
}

export interface CohortDefinition {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  criteria: Record<string, unknown>;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export abstract class AdvancedAnalyticsRepository {
  abstract listDashboards(tenantId: string): Promise<AnalyticsDashboard[]>;
  abstract getDashboard(tenantId: string, id: string): Promise<AnalyticsDashboard | null>;
  abstract createDashboard(tenantId: string, dashboard: Omit<AnalyticsDashboard, 'id' | 'createdAt' | 'updatedAt'>): Promise<AnalyticsDashboard>;
  abstract updateDashboard(tenantId: string, id: string, update: Partial<AnalyticsDashboard>): Promise<AnalyticsDashboard>;
  abstract deleteDashboard(tenantId: string, id: string): Promise<void>;

  abstract listReports(tenantId: string): Promise<AnalyticsReport[]>;
  abstract getReport(tenantId: string, id: string): Promise<AnalyticsReport | null>;
  abstract createReport(tenantId: string, report: Omit<AnalyticsReport, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt'>): Promise<AnalyticsReport>;
  abstract updateReport(tenantId: string, id: string, update: Partial<AnalyticsReport>): Promise<AnalyticsReport>;
  abstract deleteReport(tenantId: string, id: string): Promise<void>;

  abstract listReportExecutions(tenantId: string, reportId?: string): Promise<ReportExecution[]>;
  abstract createReportExecution(tenantId: string, execution: Omit<ReportExecution, 'id' | 'createdAt' | 'durationMs'>): Promise<ReportExecution>;
  abstract updateReportExecution(tenantId: string, id: string, update: Partial<ReportExecution>): Promise<ReportExecution>;

  abstract listModels(tenantId: string, modelType?: string): Promise<PredictiveModel[]>;
  abstract getModel(tenantId: string, id: string): Promise<PredictiveModel | null>;
  abstract createModel(tenantId: string, model: Omit<PredictiveModel, 'id' | 'createdAt' | 'updatedAt'>): Promise<PredictiveModel>;
  abstract updateModel(tenantId: string, id: string, update: Partial<PredictiveModel>): Promise<PredictiveModel>;

  abstract listPredictions(tenantId: string, modelId?: string, entityType?: string): Promise<PredictionResult[]>;
  abstract createPrediction(tenantId: string, prediction: Omit<PredictionResult, 'id' | 'predictedAt'>): Promise<PredictionResult>;

  abstract listCohorts(tenantId: string): Promise<CohortDefinition[]>;
  abstract getCohort(tenantId: string, id: string): Promise<CohortDefinition | null>;
  abstract createCohort(tenantId: string, cohort: Omit<CohortDefinition, 'id' | 'createdAt' | 'updatedAt' | 'memberCount'>): Promise<CohortDefinition>;
  abstract updateCohort(tenantId: string, id: string, update: Partial<CohortDefinition>): Promise<CohortDefinition>;
  abstract deleteCohort(tenantId: string, id: string): Promise<void>;
}

@Injectable()
export class InMemoryAdvancedAnalyticsRepository extends AdvancedAnalyticsRepository {
  private dashboards = new Map<string, AnalyticsDashboard>();
  private reports = new Map<string, AnalyticsReport>();
  private executions = new Map<string, ReportExecution>();
  private models = new Map<string, PredictiveModel>();
  private predictions = new Map<string, PredictionResult>();
  private cohorts = new Map<string, CohortDefinition>();

  // Dashboards
  async listDashboards(tenantId: string): Promise<AnalyticsDashboard[]> {
    return Array.from(this.dashboards.values()).filter(d => d.tenantId === tenantId);
  }

  async getDashboard(tenantId: string, id: string): Promise<AnalyticsDashboard | null> {
    const d = this.dashboards.get(id);
    return d && d.tenantId === tenantId ? d : null;
  }

  async createDashboard(tenantId: string, dashboard: Omit<AnalyticsDashboard, 'id' | 'createdAt' | 'updatedAt'>): Promise<AnalyticsDashboard> {
    const now = new Date().toISOString();
    const created = { ...dashboard, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.dashboards.set(created.id, created);
    return created;
  }

  async updateDashboard(tenantId: string, id: string, update: Partial<AnalyticsDashboard>): Promise<AnalyticsDashboard> {
    const existing = this.dashboards.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Dashboard not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.dashboards.set(id, updated);
    return updated;
  }

  async deleteDashboard(tenantId: string, id: string): Promise<void> {
    const existing = this.dashboards.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Dashboard not found');
    this.dashboards.delete(id);
  }

  // Reports
  async listReports(tenantId: string): Promise<AnalyticsReport[]> {
    return Array.from(this.reports.values()).filter(r => r.tenantId === tenantId);
  }

  async getReport(tenantId: string, id: string): Promise<AnalyticsReport | null> {
    const r = this.reports.get(id);
    return r && r.tenantId === tenantId ? r : null;
  }

  async createReport(tenantId: string, report: Omit<AnalyticsReport, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt'>): Promise<AnalyticsReport> {
    const now = new Date().toISOString();
    const created = { ...report, tenantId, id: randomUUID(), lastRunAt: null, createdAt: now, updatedAt: now };
    this.reports.set(created.id, created);
    return created;
  }

  async updateReport(tenantId: string, id: string, update: Partial<AnalyticsReport>): Promise<AnalyticsReport> {
    const existing = this.reports.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Report not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.reports.set(id, updated);
    return updated;
  }

  async deleteReport(tenantId: string, id: string): Promise<void> {
    const existing = this.reports.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Report not found');
    this.reports.delete(id);
  }

  // Report Executions
  async listReportExecutions(tenantId: string, reportId?: string): Promise<ReportExecution[]> {
    return Array.from(this.executions.values()).filter(
      e => e.tenantId === tenantId && (!reportId || e.reportId === reportId)
    );
  }

  async createReportExecution(tenantId: string, execution: Omit<ReportExecution, 'id' | 'createdAt' | 'durationMs'>): Promise<ReportExecution> {
    const now = new Date().toISOString();
    const created = { ...execution, tenantId, id: randomUUID(), createdAt: now, durationMs: null };
    this.executions.set(created.id, created);
    return created;
  }

  async updateReportExecution(tenantId: string, id: string, update: Partial<ReportExecution>): Promise<ReportExecution> {
    const existing = this.executions.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Execution not found');
    const startedAt = new Date(existing.startedAt);
    const completedAt = update.completedAt ? new Date(update.completedAt) : existing.completedAt ? new Date(existing.completedAt) : new Date();
    const durationMs = Math.floor((completedAt.getTime() - startedAt.getTime()));
    const updated = { ...existing, ...update, durationMs };
    this.executions.set(id, updated);
    return updated;
  }

  // Models
  async listModels(tenantId: string, modelType?: string): Promise<PredictiveModel[]> {
    return Array.from(this.models.values()).filter(
      m => m.tenantId === tenantId && (!modelType || m.modelType === modelType)
    );
  }

  async getModel(tenantId: string, id: string): Promise<PredictiveModel | null> {
    const m = this.models.get(id);
    return m && m.tenantId === tenantId ? m : null;
  }

  async createModel(tenantId: string, model: Omit<PredictiveModel, 'id' | 'createdAt' | 'updatedAt'>): Promise<PredictiveModel> {
    const now = new Date().toISOString();
    const created = { ...model, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.models.set(created.id, created);
    return created;
  }

  async updateModel(tenantId: string, id: string, update: Partial<PredictiveModel>): Promise<PredictiveModel> {
    const existing = this.models.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Model not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.models.set(id, updated);
    return updated;
  }

  // Predictions
  async listPredictions(tenantId: string, modelId?: string, entityType?: string): Promise<PredictionResult[]> {
    return Array.from(this.predictions.values()).filter(
      p => p.tenantId === tenantId && (!modelId || p.modelId === modelId) && (!entityType || p.entityType === entityType)
    );
  }

  async createPrediction(tenantId: string, prediction: Omit<PredictionResult, 'id' | 'predictedAt'>): Promise<PredictionResult> {
    const created = { ...prediction, tenantId, id: randomUUID(), predictedAt: new Date().toISOString() };
    this.predictions.set(created.id, created);
    return created;
  }

  // Cohorts
  async listCohorts(tenantId: string): Promise<CohortDefinition[]> {
    return Array.from(this.cohorts.values()).filter(c => c.tenantId === tenantId);
  }

  async getCohort(tenantId: string, id: string): Promise<CohortDefinition | null> {
    const c = this.cohorts.get(id);
    return c && c.tenantId === tenantId ? c : null;
  }

  async createCohort(tenantId: string, cohort: Omit<CohortDefinition, 'id' | 'createdAt' | 'updatedAt' | 'memberCount'>): Promise<CohortDefinition> {
    const now = new Date().toISOString();
    const created = { ...cohort, tenantId, id: randomUUID(), memberCount: 0, createdAt: now, updatedAt: now };
    this.cohorts.set(created.id, created);
    return created;
  }

  async updateCohort(tenantId: string, id: string, update: Partial<CohortDefinition>): Promise<CohortDefinition> {
    const existing = this.cohorts.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Cohort not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.cohorts.set(id, updated);
    return updated;
  }

  async deleteCohort(tenantId: string, id: string): Promise<void> {
    const existing = this.cohorts.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Cohort not found');
    this.cohorts.delete(id);
  }
}
