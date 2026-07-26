import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface ServiceLevelIndicator {
  id: string;
  tenantId: string;
  serviceName: string;
  indicatorName: string;
  targetValue: number;
  currentValue: number | null;
  measurementWindow: string;
  status: 'healthy' | 'warning' | 'breached';
  createdAt: string;
  updatedAt: string;
}

export interface ErrorBudget {
  id: string;
  tenantId: string;
  serviceName: string;
  periodStart: string;
  periodEnd: string;
  totalBudgetSeconds: number;
  consumedSeconds: number;
  remainingSeconds: number;
  /** Derived from consumption against elapsed period — never accepted from the caller. */
  burnRate: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Derives the burn rate of a budget window.
 *
 * A burn rate is consumption relative to the pace that would exactly exhaust the
 * budget over the period: consumedFraction / elapsedFraction. It used to be a
 * nullable field the caller supplied, which meant an alert could say "burn rate
 * 1.5" without any objective behind it (R-19).
 */
export function deriveBurnRate(
  budget: Pick<
    ErrorBudget,
    'consumedSeconds' | 'periodEnd' | 'periodStart' | 'totalBudgetSeconds'
  >,
  now = new Date(),
): number | null {
  const start = Date.parse(budget.periodStart);
  const end = Date.parse(budget.periodEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }
  if (budget.totalBudgetSeconds <= 0) {
    return null;
  }

  const elapsed = Math.min(now.getTime(), end) - start;
  if (elapsed <= 0) {
    // The period has not started, so no pace can be measured yet. Returning 0
    // here would read as "healthy" on a dashboard.
    return null;
  }

  const elapsedFraction = elapsed / (end - start);
  const consumedFraction = budget.consumedSeconds / budget.totalBudgetSeconds;
  return consumedFraction / elapsedFraction;
}

export interface Incident {
  id: string;
  tenantId: string;
  severity: 'P1' | 'P2' | 'P3' | 'P4';
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved' | 'postmortem';
  title: string;
  description: string | null;
  impact: string | null;
  rootCause: string | null;
  resolution: string | null;
  startedAt: string;
  identifiedAt: string | null;
  resolvedAt: string | null;
  durationSeconds: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Runbook {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  triggerCondition: string;
  steps: unknown[]; // free-form JSONB (schema-less)
  autoExecute: boolean;
  lastExecutedAt: string | null;
  executionCount: number;
  successCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RunbookExecution {
  id: string;
  runbookId: string;
  tenantId: string;
  status: 'running' | 'success' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  executedBy: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export abstract class ObservabilityRepository {
  abstract listSli(tenantId: string): Promise<ServiceLevelIndicator[]>;
  abstract getSli(tenantId: string, serviceName: string, indicatorName: string): Promise<ServiceLevelIndicator | null>;
  abstract upsertSli(tenantId: string, sli: Omit<ServiceLevelIndicator, 'id' | 'createdAt' | 'updatedAt'>): Promise<ServiceLevelIndicator>;
  
  abstract listErrorBudgets(tenantId: string): Promise<ErrorBudget[]>;
  abstract createErrorBudget(tenantId: string, budget: Omit<ErrorBudget, 'id' | 'createdAt' | 'updatedAt' | 'remainingSeconds'>): Promise<ErrorBudget>;
  abstract updateErrorBudget(tenantId: string, id: string, update: Partial<ErrorBudget>): Promise<ErrorBudget>;
  
  abstract listIncidents(tenantId: string, status?: string): Promise<Incident[]>;
  abstract getIncident(tenantId: string, id: string): Promise<Incident | null>;
  abstract createIncident(tenantId: string, incident: Omit<Incident, 'id' | 'createdAt' | 'updatedAt' | 'durationSeconds'>): Promise<Incident>;
  abstract updateIncident(tenantId: string, id: string, update: Partial<Incident>): Promise<Incident>;
  
  abstract listRunbooks(tenantId: string): Promise<Runbook[]>;
  abstract getRunbook(tenantId: string, id: string): Promise<Runbook | null>;
  abstract createRunbook(tenantId: string, runbook: Omit<Runbook, 'id' | 'createdAt' | 'updatedAt' | 'lastExecutedAt' | 'executionCount' | 'successCount'>): Promise<Runbook>;
  abstract updateRunbook(tenantId: string, id: string, update: Partial<Runbook>): Promise<Runbook>;
  
  abstract listRunbookExecutions(tenantId: string, runbookId?: string): Promise<RunbookExecution[]>;
  abstract createRunbookExecution(tenantId: string, execution: Omit<RunbookExecution, 'id' | 'createdAt' | 'durationSeconds'>): Promise<RunbookExecution>;
  abstract updateRunbookExecution(tenantId: string, id: string, update: Partial<RunbookExecution>): Promise<RunbookExecution>;
}

@Injectable()
export class InMemoryObservabilityRepository extends ObservabilityRepository {
  private sliStore = new Map<string, ServiceLevelIndicator>();
  private errorBudgetStore = new Map<string, ErrorBudget>();
  private incidentStore = new Map<string, Incident>();
  private runbookStore = new Map<string, Runbook>();
  private executionStore = new Map<string, RunbookExecution>();

  async listSli(tenantId: string): Promise<ServiceLevelIndicator[]> {
    return Array.from(this.sliStore.values()).filter(s => s.tenantId === tenantId);
  }

  async getSli(tenantId: string, serviceName: string, indicatorName: string): Promise<ServiceLevelIndicator | null> {
    return Array.from(this.sliStore.values()).find(
      s => s.tenantId === tenantId && s.serviceName === serviceName && s.indicatorName === indicatorName
    ) || null;
  }

  async upsertSli(tenantId: string, sli: Omit<ServiceLevelIndicator, 'id' | 'createdAt' | 'updatedAt'>): Promise<ServiceLevelIndicator> {
    const existing = await this.getSli(tenantId, sli.serviceName, sli.indicatorName);
    const now = new Date().toISOString();
    
    if (existing) {
      const updated = { ...existing, ...sli, updatedAt: now };
      this.sliStore.set(existing.id, updated);
      return updated;
    }
    
    const created = { ...sli, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.sliStore.set(created.id, created);
    return created;
  }

  async listErrorBudgets(tenantId: string): Promise<ErrorBudget[]> {
    return Array.from(this.errorBudgetStore.values()).filter(b => b.tenantId === tenantId);
  }

  async createErrorBudget(tenantId: string, budget: Omit<ErrorBudget, 'id' | 'createdAt' | 'updatedAt' | 'remainingSeconds'>): Promise<ErrorBudget> {
    const now = new Date().toISOString();
    const created = {
      ...budget,
      tenantId,
      id: randomUUID(),
      remainingSeconds: budget.totalBudgetSeconds - budget.consumedSeconds,
      // Derived, so a caller cannot assert a burn rate its consumption does not support.
      burnRate: deriveBurnRate(budget),
      createdAt: now,
      updatedAt: now,
    };
    this.errorBudgetStore.set(created.id, created);
    return created;
  }

  async updateErrorBudget(tenantId: string, id: string, update: Partial<ErrorBudget>): Promise<ErrorBudget> {
    const existing = this.errorBudgetStore.get(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new Error('Error budget not found');
    }

    const merged = {
      ...existing,
      ...update,
      remainingSeconds: (update.totalBudgetSeconds ?? existing.totalBudgetSeconds) - (update.consumedSeconds ?? existing.consumedSeconds),
      updatedAt: new Date().toISOString(),
    };
    const updated = { ...merged, burnRate: deriveBurnRate(merged) };
    this.errorBudgetStore.set(id, updated);
    return updated;
  }

  async listIncidents(tenantId: string, status?: string): Promise<Incident[]> {
    return Array.from(this.incidentStore.values()).filter(
      i => i.tenantId === tenantId && (!status || i.status === status)
    );
  }

  async getIncident(tenantId: string, id: string): Promise<Incident | null> {
    const incident = this.incidentStore.get(id);
    return incident && incident.tenantId === tenantId ? incident : null;
  }

  async createIncident(tenantId: string, incident: Omit<Incident, 'id' | 'createdAt' | 'updatedAt' | 'durationSeconds'>): Promise<Incident> {
    const now = new Date().toISOString();
    const created = { ...incident, tenantId, id: randomUUID(), createdAt: now, updatedAt: now, durationSeconds: null };
    this.incidentStore.set(created.id, created);
    return created;
  }

  async updateIncident(tenantId: string, id: string, update: Partial<Incident>): Promise<Incident> {
    const existing = this.incidentStore.get(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new Error('Incident not found');
    }
    
    const now = new Date().toISOString();
    const startedAt = new Date(existing.startedAt);
    const resolvedAt = update.resolvedAt ? new Date(update.resolvedAt) : existing.resolvedAt ? new Date(existing.resolvedAt) : new Date();
    const durationSeconds = Math.floor((resolvedAt.getTime() - startedAt.getTime()) / 1000);
    
    const updated = {
      ...existing,
      ...update,
      durationSeconds,
      updatedAt: now,
    };
    this.incidentStore.set(id, updated);
    return updated;
  }

  async listRunbooks(tenantId: string): Promise<Runbook[]> {
    return Array.from(this.runbookStore.values()).filter(r => r.tenantId === tenantId);
  }

  async getRunbook(tenantId: string, id: string): Promise<Runbook | null> {
    const runbook = this.runbookStore.get(id);
    return runbook && runbook.tenantId === tenantId ? runbook : null;
  }

  async createRunbook(tenantId: string, runbook: Omit<Runbook, 'id' | 'createdAt' | 'updatedAt' | 'lastExecutedAt' | 'executionCount' | 'successCount'>): Promise<Runbook> {
    const now = new Date().toISOString();
    const created = {
      ...runbook,
      tenantId,
      id: randomUUID(),
      lastExecutedAt: null,
      executionCount: 0,
      successCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.runbookStore.set(created.id, created);
    return created;
  }

  async updateRunbook(tenantId: string, id: string, update: Partial<Runbook>): Promise<Runbook> {
    const existing = this.runbookStore.get(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new Error('Runbook not found');
    }
    
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.runbookStore.set(id, updated);
    return updated;
  }

  async listRunbookExecutions(tenantId: string, runbookId?: string): Promise<RunbookExecution[]> {
    return Array.from(this.executionStore.values()).filter(
      e => e.tenantId === tenantId && (!runbookId || e.runbookId === runbookId)
    );
  }

  async createRunbookExecution(tenantId: string, execution: Omit<RunbookExecution, 'id' | 'createdAt' | 'durationSeconds'>): Promise<RunbookExecution> {
    const now = new Date().toISOString();
    const created = { ...execution, tenantId, id: randomUUID(), createdAt: now, durationSeconds: null };
    this.executionStore.set(created.id, created);
    return created;
  }

  async updateRunbookExecution(tenantId: string, id: string, update: Partial<RunbookExecution>): Promise<RunbookExecution> {
    const existing = this.executionStore.get(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new Error('Runbook execution not found');
    }
    
    const startedAt = new Date(existing.startedAt);
    const completedAt = update.completedAt ? new Date(update.completedAt) : existing.completedAt ? new Date(existing.completedAt) : new Date();
    const durationSeconds = Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000);
    
    const updated = { ...existing, ...update, durationSeconds };
    this.executionStore.set(id, updated);
    return updated;
  }
}
