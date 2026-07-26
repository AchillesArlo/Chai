import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryObservabilityRepository } from '../src/modules/observability/observability.repository';

describe('ObservabilityRepository', () => {
  let repo: InMemoryObservabilityRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryObservabilityRepository();
  });

  describe('SLI', () => {
    it('should create and retrieve SLI', async () => {
      const sli = await repo.upsertSli(tenantId, {
        tenantId,
        serviceName: 'api',
        indicatorName: 'availability',
        targetValue: 0.999,
        currentValue: 0.9995,
        measurementWindow: '30d',
        status: 'healthy',
      });

      expect(sli.id).toBeDefined();
      expect(sli.tenantId).toBe(tenantId);
      expect(sli.serviceName).toBe('api');

      const retrieved = await repo.getSli(tenantId, 'api', 'availability');
      expect(retrieved).toBeDefined();
      expect(retrieved?.currentValue).toBe(0.9995);
    });

    it('should update existing SLI', async () => {
      await repo.upsertSli(tenantId, {
        tenantId,
        serviceName: 'api',
        indicatorName: 'availability',
        targetValue: 0.999,
        currentValue: 0.9995,
        measurementWindow: '30d',
        status: 'healthy',
      });

      const updated = await repo.upsertSli(tenantId, {
        tenantId,
        serviceName: 'api',
        indicatorName: 'availability',
        targetValue: 0.999,
        currentValue: 0.9985,
        measurementWindow: '30d',
        status: 'warning',
      });

      expect(updated.currentValue).toBe(0.9985);
      expect(updated.status).toBe('warning');
    });

    it('should list all SLIs for tenant', async () => {
      await repo.upsertSli(tenantId, {
        tenantId,
        serviceName: 'api',
        indicatorName: 'availability',
        targetValue: 0.999,
        currentValue: 0.9995,
        measurementWindow: '30d',
        status: 'healthy',
      });

      await repo.upsertSli(tenantId, {
        tenantId,
        serviceName: 'api',
        indicatorName: 'latency',
        targetValue: 200,
        currentValue: 150,
        measurementWindow: '30d',
        status: 'healthy',
      });

      const slis = await repo.listSli(tenantId);
      expect(slis).toHaveLength(2);
    });
  });

  describe('Error Budget', () => {
    it('should create error budget', async () => {
      const budget = await repo.createErrorBudget(tenantId, {
        tenantId,
        serviceName: 'api',
        periodStart: '2026-01-01T00:00:00Z',
        periodEnd: '2026-01-31T23:59:59Z',
        totalBudgetSeconds: 2592000,
        consumedSeconds: 0,
        burnRate: null,
      });

      expect(budget.id).toBeDefined();
      expect(budget.remainingSeconds).toBe(2592000);
    });

    it('should update error budget consumption', async () => {
      const budget = await repo.createErrorBudget(tenantId, {
        tenantId,
        serviceName: 'api',
        periodStart: '2026-01-01T00:00:00Z',
        periodEnd: '2026-01-31T23:59:59Z',
        totalBudgetSeconds: 2592000,
        consumedSeconds: 0,
        burnRate: null,
      });

      const updated = await repo.updateErrorBudget(tenantId, budget.id, {
        consumedSeconds: 100000,
        // A caller cannot assert a burn rate: the period is long over, so the
        // derived rate follows consumption, not this number (R-19).
        burnRate: 1.5,
      });

      expect(updated.consumedSeconds).toBe(100000);
      expect(updated.remainingSeconds).toBe(2492000);
      expect(updated.burnRate).not.toBe(1.5);
      // 100000s of a 2592000s budget spent over a fully elapsed period.
      expect(updated.burnRate).toBeCloseTo(100000 / 2592000, 6);
    });

    it('derives a 2x burn rate when half the budget goes in half the period', async () => {
      const start = new Date('2026-01-01T00:00:00Z');
      const end = new Date('2026-01-31T00:00:00Z');
      const halfway = new Date('2026-01-16T00:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(halfway);
      try {
        const budget = await repo.createErrorBudget(tenantId, {
          tenantId,
          serviceName: 'api',
          periodStart: start.toISOString(),
          periodEnd: end.toISOString(),
          totalBudgetSeconds: 1000,
          consumedSeconds: 1000,
          burnRate: null,
        });
        // Whole budget consumed at the halfway point = burning twice as fast as
        // sustainable.
        expect(budget.burnRate).toBeCloseTo(2, 6);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Incident', () => {
    it('should create incident', async () => {
      const incident = await repo.createIncident(tenantId, {
        tenantId,
        severity: 'P2',
        status: 'investigating',
        title: 'API latency spike',
        description: 'P99 latency increased to 500ms',
        impact: null,
        rootCause: null,
        resolution: null,
        startedAt: '2026-01-15T10:00:00Z',
        identifiedAt: null,
        resolvedAt: null,
        createdBy: 'user-1',
      });

      expect(incident.id).toBeDefined();
      expect(incident.severity).toBe('P2');
      expect(incident.status).toBe('investigating');
    });

    it('should update incident status', async () => {
      const incident = await repo.createIncident(tenantId, {
        tenantId,
        severity: 'P2',
        status: 'investigating',
        title: 'API latency spike',
        description: null,
        impact: null,
        rootCause: null,
        resolution: null,
        startedAt: '2026-01-15T10:00:00Z',
        identifiedAt: null,
        resolvedAt: null,
        createdBy: 'user-1',
      });

      const updated = await repo.updateIncident(tenantId, incident.id, {
        status: 'resolved',
        rootCause: 'Database connection pool exhaustion',
        resolution: 'Increased pool size and added connection timeout',
        resolvedAt: '2026-01-15T11:30:00Z',
      });

      expect(updated.status).toBe('resolved');
      expect(updated.rootCause).toBe('Database connection pool exhaustion');
      expect(updated.durationSeconds).toBeGreaterThan(0);
    });

    it('should list incidents by status', async () => {
      await repo.createIncident(tenantId, {
        tenantId,
        severity: 'P2',
        status: 'investigating',
        title: 'Incident 1',
        description: null,
        impact: null,
        rootCause: null,
        resolution: null,
        startedAt: '2026-01-15T10:00:00Z',
        identifiedAt: null,
        resolvedAt: null,
        createdBy: 'user-1',
      });

      await repo.createIncident(tenantId, {
        tenantId,
        severity: 'P3',
        status: 'resolved',
        title: 'Incident 2',
        description: null,
        impact: null,
        rootCause: null,
        resolution: null,
        startedAt: '2026-01-14T10:00:00Z',
        identifiedAt: null,
        resolvedAt: '2026-01-14T11:00:00Z',
        createdBy: 'user-1',
      });

      const investigating = await repo.listIncidents(tenantId, 'investigating');
      expect(investigating).toHaveLength(1);

      const all = await repo.listIncidents(tenantId);
      expect(all).toHaveLength(2);
    });
  });

  describe('Runbook', () => {
    it('should create runbook', async () => {
      const runbook = await repo.createRunbook(tenantId, {
        tenantId,
        name: 'Restart API pods',
        description: 'Automated restart of API pods when memory usage is high',
        triggerCondition: 'memory_usage > 80%',
        steps: [
          { action: 'scale', target: 'api-deployment', replicas: 3 },
          { action: 'wait', duration: 30 },
          { action: 'verify', check: 'health_check' },
        ],
        autoExecute: true,
      });

      expect(runbook.id).toBeDefined();
      expect(runbook.name).toBe('Restart API pods');
      expect(runbook.executionCount).toBe(0);
      expect(runbook.successCount).toBe(0);
    });

    it('should create and update runbook execution', async () => {
      const runbook = await repo.createRunbook(tenantId, {
        tenantId,
        name: 'Test runbook',
        description: null,
        triggerCondition: 'test',
        steps: [],
        autoExecute: false,
      });

      const execution = await repo.createRunbookExecution(tenantId, {
        runbookId: runbook.id,
        tenantId,
        status: 'running',
        startedAt: '2026-01-15T10:00:00Z',
        completedAt: null,
        executedBy: 'user-1',
        errorMessage: null,
      });

      expect(execution.id).toBeDefined();
      expect(execution.status).toBe('running');

      const updated = await repo.updateRunbookExecution(tenantId, execution.id, {
        status: 'success',
        completedAt: '2026-01-15T10:05:00Z',
      });

      expect(updated.status).toBe('success');
      expect(updated.durationSeconds).toBe(300);
    });
  });
});
