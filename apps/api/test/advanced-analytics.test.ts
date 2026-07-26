import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryAdvancedAnalyticsRepository } from '../src/modules/advanced-analytics/advanced-analytics.repository';

describe('AdvancedAnalyticsRepository', () => {
  let repo: InMemoryAdvancedAnalyticsRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryAdvancedAnalyticsRepository();
  });

  describe('Dashboards', () => {
    it('should create and retrieve dashboard', async () => {
      const dashboard = await repo.createDashboard(tenantId, {
        tenantId,
        name: 'Sales Overview',
        description: 'Key sales metrics and trends',
        layout: [{ widgetId: 'w1', x: 0, y: 0, w: 6, h: 4 }],
        isDefault: true,
      });

      expect(dashboard.id).toBeDefined();
      expect(dashboard.name).toBe('Sales Overview');
      expect(dashboard.isDefault).toBe(true);

      const retrieved = await repo.getDashboard(tenantId, dashboard.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Sales Overview');
    });

    it('should update dashboard', async () => {
      const dashboard = await repo.createDashboard(tenantId, {
        tenantId,
        name: 'Dashboard 1',
        description: null,
        layout: [],
        isDefault: false,
      });

      const updated = await repo.updateDashboard(tenantId, dashboard.id, {
        name: 'Updated Dashboard',
        layout: [{ widgetId: 'w1', x: 0, y: 0, w: 12, h: 6 }],
      });

      expect(updated.name).toBe('Updated Dashboard');
      expect(updated.layout).toHaveLength(1);
    });

    it('should delete dashboard', async () => {
      const dashboard = await repo.createDashboard(tenantId, {
        tenantId,
        name: 'Temp Dashboard',
        description: null,
        layout: [],
        isDefault: false,
      });

      await repo.deleteDashboard(tenantId, dashboard.id);

      const retrieved = await repo.getDashboard(tenantId, dashboard.id);
      expect(retrieved).toBeNull();
    });

    it('should list dashboards for tenant', async () => {
      await repo.createDashboard(tenantId, {
        tenantId,
        name: 'Dashboard 1',
        description: null,
        layout: [],
        isDefault: false,
      });

      await repo.createDashboard(tenantId, {
        tenantId,
        name: 'Dashboard 2',
        description: null,
        layout: [],
        isDefault: false,
      });

      const dashboards = await repo.listDashboards(tenantId);
      expect(dashboards).toHaveLength(2);
    });
  });

  describe('Reports', () => {
    it('should create and retrieve report', async () => {
      const report = await repo.createReport(tenantId, {
        tenantId,
        name: 'Monthly Revenue',
        description: 'Revenue breakdown by month',
        queryConfig: { metric: 'revenue', groupBy: 'month' },
        scheduleCron: '0 0 1 * *',
      });

      expect(report.id).toBeDefined();
      expect(report.name).toBe('Monthly Revenue');
      expect(report.lastRunAt).toBeNull();

      const retrieved = await repo.getReport(tenantId, report.id);
      expect(retrieved).toBeDefined();
    });

    it('should update report', async () => {
      const report = await repo.createReport(tenantId, {
        tenantId,
        name: 'Report 1',
        description: null,
        queryConfig: {},
        scheduleCron: null,
      });

      const updated = await repo.updateReport(tenantId, report.id, {
        name: 'Updated Report',
        lastRunAt: '2026-01-15T10:00:00Z',
      });

      expect(updated.name).toBe('Updated Report');
      expect(updated.lastRunAt).toBe('2026-01-15T10:00:00Z');
    });

    it('should delete report', async () => {
      const report = await repo.createReport(tenantId, {
        tenantId,
        name: 'Temp Report',
        description: null,
        queryConfig: {},
        scheduleCron: null,
      });

      await repo.deleteReport(tenantId, report.id);

      const retrieved = await repo.getReport(tenantId, report.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Report Executions', () => {
    it('should create and update report execution', async () => {
      const report = await repo.createReport(tenantId, {
        tenantId,
        name: 'Test Report',
        description: null,
        queryConfig: {},
        scheduleCron: null,
      });

      const execution = await repo.createReportExecution(tenantId, {
        reportId: report.id,
        tenantId,
        status: 'running',
        resultSummary: null,
        startedAt: '2026-01-15T10:00:00Z',
        completedAt: null,
      });

      expect(execution.id).toBeDefined();
      expect(execution.status).toBe('running');
      expect(execution.durationMs).toBeNull();

      const updated = await repo.updateReportExecution(tenantId, execution.id, {
        status: 'completed',
        resultSummary: { rows: 150, duration: '2.5s' },
        completedAt: '2026-01-15T10:00:05Z',
      });

      expect(updated.status).toBe('completed');
      expect(updated.resultSummary).toBeDefined();
      expect(updated.durationMs).toBeGreaterThan(0);
    });

    it('should list executions by report', async () => {
      const report = await repo.createReport(tenantId, {
        tenantId,
        name: 'Report',
        description: null,
        queryConfig: {},
        scheduleCron: null,
      });

      await repo.createReportExecution(tenantId, {
        reportId: report.id,
        tenantId,
        status: 'completed',
        resultSummary: null,
        startedAt: '2026-01-14T10:00:00Z',
        completedAt: '2026-01-14T10:00:05Z',
      });

      await repo.createReportExecution(tenantId, {
        reportId: report.id,
        tenantId,
        status: 'completed',
        resultSummary: null,
        startedAt: '2026-01-15T10:00:00Z',
        completedAt: '2026-01-15T10:00:05Z',
      });

      const executions = await repo.listReportExecutions(tenantId, report.id);
      expect(executions).toHaveLength(2);
    });
  });

  describe('Predictive Models', () => {
    it('should create and retrieve model', async () => {
      const model = await repo.createModel(tenantId, {
        tenantId,
        modelType: 'churn_prediction',
        name: 'Customer Churn v1',
        version: '1.0.0',
        accuracy: 0.85,
        trainedAt: '2026-01-10T00:00:00Z',
        modelConfig: { algorithm: 'xgboost', features: ['usage', 'tenure'] },
        isActive: true,
      });

      expect(model.id).toBeDefined();
      expect(model.modelType).toBe('churn_prediction');
      expect(model.accuracy).toBe(0.85);

      const retrieved = await repo.getModel(tenantId, model.id);
      expect(retrieved).toBeDefined();
    });

    it('should update model', async () => {
      const model = await repo.createModel(tenantId, {
        tenantId,
        modelType: 'revenue_forecast',
        name: 'Revenue Forecast',
        version: '1.0.0',
        accuracy: null,
        trainedAt: null,
        modelConfig: {},
        isActive: false,
      });

      const updated = await repo.updateModel(tenantId, model.id, {
        accuracy: 0.92,
        trainedAt: '2026-01-15T00:00:00Z',
        isActive: true,
      });

      expect(updated.accuracy).toBe(0.92);
      expect(updated.isActive).toBe(true);
    });

    it('should list models by type', async () => {
      await repo.createModel(tenantId, {
        tenantId,
        modelType: 'churn_prediction',
        name: 'Churn Model',
        version: '1.0.0',
        accuracy: 0.85,
        trainedAt: null,
        modelConfig: {},
        isActive: true,
      });

      await repo.createModel(tenantId, {
        tenantId,
        modelType: 'revenue_forecast',
        name: 'Revenue Model',
        version: '1.0.0',
        accuracy: 0.90,
        trainedAt: null,
        modelConfig: {},
        isActive: true,
      });

      const churnModels = await repo.listModels(tenantId, 'churn_prediction');
      expect(churnModels).toHaveLength(1);
      expect(churnModels[0]?.modelType).toBe('churn_prediction');

      const allModels = await repo.listModels(tenantId);
      expect(allModels).toHaveLength(2);
    });
  });

  describe('Predictions', () => {
    it('should create and list predictions', async () => {
      const model = await repo.createModel(tenantId, {
        tenantId,
        modelType: 'churn_prediction',
        name: 'Churn Model',
        version: '1.0.0',
        accuracy: 0.85,
        trainedAt: null,
        modelConfig: {},
        isActive: true,
      });

      await repo.createPrediction(tenantId, {
        modelId: model.id,
        tenantId,
        entityType: 'customer',
        entityId: 'cust-123',
        predictionValue: { churnRisk: 'high', probability: 0.78 },
        confidence: 0.85,
      });

      await repo.createPrediction(tenantId, {
        modelId: model.id,
        tenantId,
        entityType: 'customer',
        entityId: 'cust-456',
        predictionValue: { churnRisk: 'low', probability: 0.15 },
        confidence: 0.92,
      });

      const predictions = await repo.listPredictions(tenantId, model.id);
      expect(predictions).toHaveLength(2);

      const customerPredictions = await repo.listPredictions(tenantId, model.id, 'customer');
      expect(customerPredictions).toHaveLength(2);
    });
  });

  describe('Cohorts', () => {
    it('should create and retrieve cohort', async () => {
      const cohort = await repo.createCohort(tenantId, {
        tenantId,
        name: 'High-Value Customers',
        description: 'Customers with LTV > $1000',
        criteria: { ltv: { $gt: 1000 } },
      });

      expect(cohort.id).toBeDefined();
      expect(cohort.name).toBe('High-Value Customers');
      expect(cohort.memberCount).toBe(0);

      const retrieved = await repo.getCohort(tenantId, cohort.id);
      expect(retrieved).toBeDefined();
    });

    it('should update cohort', async () => {
      const cohort = await repo.createCohort(tenantId, {
        tenantId,
        name: 'Cohort 1',
        description: null,
        criteria: {},
      });

      const updated = await repo.updateCohort(tenantId, cohort.id, {
        name: 'Updated Cohort',
        memberCount: 150,
      });

      expect(updated.name).toBe('Updated Cohort');
      expect(updated.memberCount).toBe(150);
    });

    it('should delete cohort', async () => {
      const cohort = await repo.createCohort(tenantId, {
        tenantId,
        name: 'Temp Cohort',
        description: null,
        criteria: {},
      });

      await repo.deleteCohort(tenantId, cohort.id);

      const retrieved = await repo.getCohort(tenantId, cohort.id);
      expect(retrieved).toBeNull();
    });

    it('should list cohorts for tenant', async () => {
      await repo.createCohort(tenantId, {
        tenantId,
        name: 'Cohort 1',
        description: null,
        criteria: {},
      });

      await repo.createCohort(tenantId, {
        tenantId,
        name: 'Cohort 2',
        description: null,
        criteria: {},
      });

      const cohorts = await repo.listCohorts(tenantId);
      expect(cohorts).toHaveLength(2);
    });
  });
});
