// ponytail: token & cost accounting per tenant. In-memory; swap for Postgres when persistence is needed.
import { randomUUID } from 'node:crypto';

/**
 * Usage record for a single completion.
 */
export interface UsageRecord {
  completionTokens: number;
  costUsd: number;
  model: string;
  promptTokens: number;
  recordedAt: Date;
  tenantId: string;
  traceId: string;
  totalTokens: number;
  usageId: string;
}

/**
 * Aggregated usage for a tenant over a period.
 */
export interface TenantUsageSummary {
  completionTokens: number;
  costUsd: number;
  promptTokens: number;
  tenantId: string;
  totalTokens: number;
  usageCount: number;
}

/**
 * Cost accounting store — tracks token usage and costs per tenant.
 */
export class CostAccountingStore {
  private records: Map<string, UsageRecord> = new Map();

  /**
   * Record a usage entry.
   */
  record(entry: Omit<UsageRecord, 'recordedAt' | 'usageId'>): UsageRecord {
    // randomUUID, not Math.random: usage ids underpin per-tenant cost
    // accounting, so a collision would silently merge two tenants' charges.
    const usageId = `usage_${Date.now()}_${randomUUID()}`;
    const record: UsageRecord = {
      ...entry,
      recordedAt: new Date(),
      usageId,
    };
    this.records.set(usageId, record);
    return record;
  }

  /**
   * Get all usage records for a tenant.
   */
  getRecords(tenantId: string): UsageRecord[] {
    return [...this.records.values()].filter((r) => r.tenantId === tenantId);
  }

  /**
   * Get aggregated usage summary for a tenant.
   */
  getSummary(tenantId: string): TenantUsageSummary {
    const records = this.getRecords(tenantId);
    return records.reduce(
      (summary, r) => ({
        completionTokens: summary.completionTokens + r.completionTokens,
        costUsd: Math.round((summary.costUsd + r.costUsd) * 1_000_000) / 1_000_000,
        promptTokens: summary.promptTokens + r.promptTokens,
        tenantId,
        totalTokens: summary.totalTokens + r.totalTokens,
        usageCount: summary.usageCount + 1,
      }),
      {
        completionTokens: 0,
        costUsd: 0,
        promptTokens: 0,
        tenantId,
        totalTokens: 0,
        usageCount: 0,
      }
    );
  }

  /**
   * Get aggregated usage for all tenants.
   */
  getAllSummaries(): TenantUsageSummary[] {
    const tenantIds = new Set([...this.records.values()].map((r) => r.tenantId));
    return [...tenantIds].map((id) => this.getSummary(id));
  }

  /**
   * Clear all records (for testing).
   */
  clear(): void {
    this.records.clear();
  }

  /**
   * Check if tenant has exceeded a monthly cost budget.
   */
  hasExceededBudget(tenantId: string, monthlyBudgetUsd: number): boolean {
    const summary = this.getSummary(tenantId);
    return summary.costUsd >= monthlyBudgetUsd;
  }
}

/**
 * Default singleton instance.
 */
let defaultStore: CostAccountingStore | null = null;

/**
 * Get or create the default cost accounting store.
 */
export function getCostAccountingStore(): CostAccountingStore {
  if (!defaultStore) {
    defaultStore = new CostAccountingStore();
  }
  return defaultStore;
}

/**
 * Reset the default store (for testing).
 */
export function resetCostAccountingStore(): void {
  defaultStore = null;
}

/**
 * Create a new cost accounting store instance.
 */
export function createCostAccountingStore(): CostAccountingStore {
  return new CostAccountingStore();
}
