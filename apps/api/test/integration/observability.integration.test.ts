import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_CLIENT_OWNER_ID, API_TENANT_B_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresObservabilityRepository } from '../../src/modules/observability/postgres-observability.repository';

describe('API Postgres observability repository (Fase 4.1)', () => {
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

  it('persists an SLI, an error budget, an incident, a runbook and its execution across a new instance', async () => {
    const writer = new PostgresObservabilityRepository(runtime);

    const sli = await writer.upsertSli(API_TENANT_ID, {
      currentValue: 0.9991,
      indicatorName: 'availability',
      measurementWindow: '30d',
      serviceName: 'api',
      status: 'healthy',
      targetValue: 0.999,
      tenantId: API_TENANT_ID,
    });

    const budget = await writer.createErrorBudget(API_TENANT_ID, {
      consumedSeconds: 120,
      periodEnd: new Date(Date.now() + 86_400_000).toISOString(),
      periodStart: new Date(Date.now() - 86_400_000).toISOString(),
      serviceName: 'api',
      tenantId: API_TENANT_ID,
      totalBudgetSeconds: 3600,
      burnRate: null,
    });
    // remaining_seconds is a GENERATED STORED column, derived by Postgres.
    expect(budget.remainingSeconds).toBe(3600 - 120);

    const incident = await writer.createIncident(API_TENANT_ID, {
      createdBy: API_CLIENT_OWNER_ID,
      description: 'elevated error rate',
      identifiedAt: null,
      impact: 'partial outage',
      resolution: null,
      resolvedAt: null,
      rootCause: null,
      severity: 'P2',
      startedAt: new Date().toISOString(),
      status: 'investigating',
      tenantId: API_TENANT_ID,
      title: 'API 5xx spike',
    });
    expect(incident.durationSeconds).toBeNull();

    const runbook = await writer.createRunbook(API_TENANT_ID, {
      autoExecute: false,
      description: 'restart the affected pods',
      name: 'restart-api',
      steps: [{ action: 'restart', target: 'api' }],
      tenantId: API_TENANT_ID,
      triggerCondition: 'error_rate > 0.05',
    });
    expect(runbook.steps).toEqual([{ action: 'restart', target: 'api' }]);

    const execution = await writer.createRunbookExecution(API_TENANT_ID, {
      completedAt: null,
      errorMessage: null,
      executedBy: API_CLIENT_OWNER_ID,
      runbookId: runbook.id,
      startedAt: new Date().toISOString(),
      status: 'running',
      tenantId: API_TENANT_ID,
    });

    // Round-trip through a brand-new repository instance — proves the data
    // lives in Postgres, not in the writer's process memory.
    const reader = new PostgresObservabilityRepository(runtime);

    const fetchedSli = await reader.getSli(API_TENANT_ID, 'api', 'availability');
    expect(fetchedSli?.id).toBe(sli.id);

    const budgets = await reader.listErrorBudgets(API_TENANT_ID);
    expect(budgets.some((row) => row.id === budget.id)).toBe(true);

    const fetchedIncident = await reader.getIncident(API_TENANT_ID, incident.id);
    expect(fetchedIncident?.title).toBe('API 5xx spike');

    const resolvedIncident = await reader.updateIncident(API_TENANT_ID, incident.id, {
      resolvedAt: new Date().toISOString(),
      status: 'resolved',
    });
    expect(resolvedIncident.durationSeconds).not.toBeNull();

    const fetchedRunbook = await reader.getRunbook(API_TENANT_ID, runbook.id);
    expect(fetchedRunbook?.steps).toEqual([{ action: 'restart', target: 'api' }]);

    const executions = await reader.listRunbookExecutions(API_TENANT_ID, runbook.id);
    expect(executions.some((row) => row.id === execution.id)).toBe(true);

    const completedExecution = await reader.updateRunbookExecution(
      API_TENANT_ID,
      execution.id,
      { completedAt: new Date().toISOString(), status: 'success' },
    );
    expect(completedExecution.durationSeconds).not.toBeNull();
  });

  it('isolates SLIs and incidents by tenant under RLS', async () => {
    const repo = new PostgresObservabilityRepository(runtime);
    const mine = await repo.upsertSli(API_TENANT_ID, {
      currentValue: 1,
      indicatorName: 'tenant-only-indicator',
      measurementWindow: '7d',
      serviceName: 'realtime',
      status: 'healthy',
      targetValue: 1,
      tenantId: API_TENANT_ID,
    });

    const crossTenantList = await repo.listSli(API_TENANT_B_ID);
    expect(crossTenantList.some((row) => row.id === mine.id)).toBe(false);
    expect(
      await repo.getSli(API_TENANT_B_ID, 'realtime', 'tenant-only-indicator'),
    ).toBeNull();

    const incident = await repo.createIncident(API_TENANT_ID, {
      createdBy: API_CLIENT_OWNER_ID,
      description: null,
      identifiedAt: null,
      impact: null,
      resolution: null,
      resolvedAt: null,
      rootCause: null,
      severity: 'P4',
      startedAt: new Date().toISOString(),
      status: 'investigating',
      tenantId: API_TENANT_ID,
      title: 'tenant isolation probe',
    });
    expect(await repo.getIncident(API_TENANT_B_ID, incident.id)).toBeNull();
  });
});
