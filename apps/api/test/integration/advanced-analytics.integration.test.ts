import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_TENANT_B_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresAdvancedAnalyticsRepository } from '../../src/modules/advanced-analytics/postgres-advanced-analytics.repository';

describe('API Postgres advanced-analytics repository (Fase 4.3)', () => {
  const adminUrl = inject('adminDatabaseUrl') as string;
  const runtimeUrl = inject('runtimeDatabaseUrl') as string;
  let admin: ReturnType<typeof createDatabase>;
  let runtime: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    admin = createDatabase(adminUrl);
    runtime = createDatabase(runtimeUrl);
    await seedApiRuntime(admin);
  });

  afterAll(async () => {
    await runtime.end();
    await admin.end();
  });

  it('persists a dashboard, a report and its execution, a model, a prediction and a cohort across a new instance', async () => {
    const writer = new PostgresAdvancedAnalyticsRepository(runtime);

    const dashboard = await writer.createDashboard(API_TENANT_ID, {
      description: 'default view',
      isDefault: true,
      layout: [{ widget: 'revenue', x: 0, y: 0 }],
      name: 'Overview',
      tenantId: API_TENANT_ID,
    });

    const report = await writer.createReport(API_TENANT_ID, {
      description: 'weekly revenue rollup',
      name: 'Weekly Revenue',
      queryConfig: { metric: 'revenue', window: '7d' },
      scheduleCron: '0 0 * * MON',
      tenantId: API_TENANT_ID,
    });
    expect(report.lastRunAt).toBeNull();

    const execution = await writer.createReportExecution(API_TENANT_ID, {
      completedAt: null,
      reportId: report.id,
      resultSummary: null,
      startedAt: new Date().toISOString(),
      status: 'running',
      tenantId: API_TENANT_ID,
    });
    expect(execution.durationMs).toBeNull();

    const model = await writer.createModel(API_TENANT_ID, {
      accuracy: null,
      isActive: false,
      modelConfig: { features: ['recency', 'frequency'] },
      modelType: 'churn_prediction',
      name: 'churn-v1',
      tenantId: API_TENANT_ID,
      trainedAt: null,
      version: '1.0.0',
    });

    const prediction = await writer.createPrediction(API_TENANT_ID, {
      confidence: 0.87,
      entityId: 'contact-123',
      entityType: 'contact',
      modelId: model.id,
      predictionValue: { churnRisk: 'high' },
      tenantId: API_TENANT_ID,
    });

    const cohort = await writer.createCohort(API_TENANT_ID, {
      criteria: { plan: 'enterprise' },
      description: 'enterprise plan customers',
      name: 'Enterprise Cohort',
      tenantId: API_TENANT_ID,
    });
    expect(cohort.memberCount).toBe(0);

    // Round-trip through a brand-new repository instance — proves the data
    // lives in Postgres, not in the writer's process memory.
    const reader = new PostgresAdvancedAnalyticsRepository(runtime);

    const fetchedDashboard = await reader.getDashboard(API_TENANT_ID, dashboard.id);
    expect(fetchedDashboard?.layout).toEqual([{ widget: 'revenue', x: 0, y: 0 }]);

    const fetchedReport = await reader.getReport(API_TENANT_ID, report.id);
    expect(fetchedReport?.queryConfig).toEqual({ metric: 'revenue', window: '7d' });

    const executions = await reader.listReportExecutions(API_TENANT_ID, report.id);
    expect(executions.some((row) => row.id === execution.id)).toBe(true);

    const completedExecution = await reader.updateReportExecution(
      API_TENANT_ID,
      execution.id,
      { completedAt: new Date().toISOString(), status: 'completed' },
    );
    expect(completedExecution.durationMs).not.toBeNull();

    const fetchedModel = await reader.getModel(API_TENANT_ID, model.id);
    expect(fetchedModel?.modelConfig).toEqual({ features: ['recency', 'frequency'] });

    const predictions = await reader.listPredictions(API_TENANT_ID, model.id);
    expect(predictions.some((row) => row.id === prediction.id)).toBe(true);

    const fetchedCohort = await reader.getCohort(API_TENANT_ID, cohort.id);
    expect(fetchedCohort?.criteria).toEqual({ plan: 'enterprise' });

    // deleteDashboard / deleteReport / deleteCohort exercise the DELETE grant.
    // The execution row FKs to the report, so it is deleted first.
    await writer.deleteDashboard(API_TENANT_ID, dashboard.id);
    expect(await reader.getDashboard(API_TENANT_ID, dashboard.id)).toBeNull();
    await admin`DELETE FROM chai.analytics_report_execution WHERE id = ${execution.id}`;
    await writer.deleteReport(API_TENANT_ID, report.id);
    expect(await reader.getReport(API_TENANT_ID, report.id)).toBeNull();
    await writer.deleteCohort(API_TENANT_ID, cohort.id);
    expect(await reader.getCohort(API_TENANT_ID, cohort.id)).toBeNull();
  });

  it('isolates dashboards and cohorts by tenant under RLS', async () => {
    const repo = new PostgresAdvancedAnalyticsRepository(runtime);
    const dashboard = await repo.createDashboard(API_TENANT_ID, {
      description: null,
      isDefault: false,
      layout: [],
      name: 'tenant-only-dashboard',
      tenantId: API_TENANT_ID,
    });

    const crossTenantDashboards = await repo.listDashboards(API_TENANT_B_ID);
    expect(crossTenantDashboards.some((row) => row.id === dashboard.id)).toBe(false);
    expect(await repo.getDashboard(API_TENANT_B_ID, dashboard.id)).toBeNull();

    const cohort = await repo.createCohort(API_TENANT_ID, {
      criteria: {},
      description: null,
      name: 'tenant-only-cohort',
      tenantId: API_TENANT_ID,
    });
    expect(await repo.getCohort(API_TENANT_B_ID, cohort.id)).toBeNull();
  });
});
