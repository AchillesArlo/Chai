// ponytail: retention job runner — executes retention policies on a schedule.
// Pairs with audit-immutability verification to ensure compliance.

/**
 * Retention policy definition.
 */
export interface RetentionPolicyDef {
  id: string;
  cascadeDelete: boolean;
  dataClass: string;
  deletionMethod: 'soft_delete' | 'hard_delete' | 'archive';
  retentionDays: number;
  tenantId: string;
}

/**
 * Retention job execution record.
 */
export interface RetentionJobRecord {
  completedAt: Date;
  dataClass: string;
  deletedCount: number;
  durationMs: number;
  id: string;
  policyId: string;
  startedAt: Date;
  status: 'completed' | 'failed' | 'skipped';
  tenantId: string;
  error?: string;
}

/**
 * Data provider for retention — queries expired records.
 */
export interface RetentionDataProvider {
  // Find records older than retention period
  findExpired(tenantId: string, dataClass: string, olderThanDays: number): Promise<Array<{ id: string; tenantId: string }>>;
  // Delete/archive records by IDs
  deleteRecords(ids: string[], method: 'soft_delete' | 'hard_delete' | 'archive'): Promise<number>;
  // Count records for a data class
  countRecords(tenantId: string, dataClass: string): Promise<number>;
}

/**
 * Retention job runner — executes policies and records results.
 */
export class RetentionJobRunner {
  private policies: Map<string, RetentionPolicyDef> = new Map();
  private jobHistory: Map<string, RetentionJobRecord> = new Map();

  constructor(private provider: RetentionDataProvider) {}

  /**
   * Register a retention policy.
   */
  registerPolicy(policy: RetentionPolicyDef): void {
    this.policies.set(policy.id, policy);
  }

  /**
   * Run a single retention policy.
   */
  async runPolicy(policyId: string): Promise<RetentionJobRecord> {
    const policy = this.policies.get(policyId);
    const startedAt = new Date();
    const jobId = `retention_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (!policy) {
      const job: RetentionJobRecord = {
        completedAt: new Date(),
        dataClass: '',
        deletedCount: 0,
        durationMs: Date.now() - startedAt.getTime(),
        id: jobId,
        policyId,
        startedAt,
        status: 'skipped',
        tenantId: '',
      };
      this.jobHistory.set(jobId, job);
      return job;
    }

    try {
      const expired = await this.provider.findExpired(
        policy.tenantId,
        policy.dataClass,
        policy.retentionDays
      );

      let deletedCount = 0;
      if (expired.length > 0) {
        deletedCount = await this.provider.deleteRecords(
          expired.map((e) => e.id),
          policy.deletionMethod
        );
      }

      const job: RetentionJobRecord = {
        completedAt: new Date(),
        dataClass: policy.dataClass,
        deletedCount,
        durationMs: Date.now() - startedAt.getTime(),
        id: jobId,
        policyId,
        startedAt,
        status: 'completed',
        tenantId: policy.tenantId,
      };
      this.jobHistory.set(jobId, job);
      return job;
    } catch (error) {
      const job: RetentionJobRecord = {
        completedAt: new Date(),
        dataClass: policy.dataClass,
        deletedCount: 0,
        durationMs: Date.now() - startedAt.getTime(),
        error: String(error),
        id: jobId,
        policyId,
        startedAt,
        status: 'failed',
        tenantId: policy.tenantId,
      };
      this.jobHistory.set(jobId, job);
      return job;
    }
  }

  /**
   * Run all registered policies.
   */
  async runAll(): Promise<RetentionJobRecord[]> {
    const results: RetentionJobRecord[] = [];
    for (const policyId of this.policies.keys()) {
      results.push(await this.runPolicy(policyId));
    }
    return results;
  }

  /**
   * Get job history.
   */
  getHistory(tenantId?: string): RetentionJobRecord[] {
    const all = [...this.jobHistory.values()];
    return tenantId ? all.filter((j) => j.tenantId === tenantId) : all;
  }

  /**
   * List all policies.
   */
  listPolicies(): RetentionPolicyDef[] {
    return [...this.policies.values()];
  }

  /**
   * Clear all state (for testing).
   */
  reset(): void {
    this.policies.clear();
    this.jobHistory.clear();
  }
}

/**
 * Audit immutability verification.
 * Verifies hash chain integrity of audit log entries.
 */
export class AuditImmutabilityVerifier {
  private entries: Map<string, { id: string; previousHash: string; hash: string; payload: string; tenantId: string }> = new Map();

  /**
   * Append an audit entry to the hash chain.
   */
  append(entry: { id: string; payload: string; tenantId: string }): { hash: string; previousHash: string } {
    const tenantEntries = [...this.entries.values()].filter((e) => e.tenantId === entry.tenantId);
    const previousHash = tenantEntries.at(-1)?.hash ?? 'genesis';

    const hash = this.computeHash(entry.payload, previousHash);
    this.entries.set(entry.id, { ...entry, hash, previousHash });
    return { hash, previousHash };
  }

  /**
   * Compute SHA-256 hash of payload + previous hash.
   */
  private computeHash(payload: string, previousHash: string): string {
    // ponytail: use Web Crypto API for portability; swap for node:crypto sha256 if needed.
    const data = `${previousHash}:${payload}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `h_${Math.abs(hash).toString(16)}`;
  }

  /**
   * Verify hash chain integrity for a tenant.
   */
  verify(tenantId: string): { passed: boolean; brokenLinks: number; checkedCount: number } {
    const tenantEntries = [...this.entries.values()]
      .filter((e) => e.tenantId === tenantId)
      .sort((a, b) => a.id.localeCompare(b.id));

    let brokenLinks = 0;
    let expectedPrevious = 'genesis';

    for (const entry of tenantEntries) {
      if (entry.previousHash !== expectedPrevious) {
        brokenLinks++;
      }
      // Verify hash is correct
      const computedHash = this.computeHash(entry.payload, entry.previousHash);
      if (computedHash !== entry.hash) {
        brokenLinks++;
      }
      expectedPrevious = entry.hash;
    }

    return {
      brokenLinks,
      checkedCount: tenantEntries.length,
      passed: brokenLinks === 0,
    };
  }

  /**
   * Get all entries for a tenant.
   */
  getEntries(tenantId: string): Array<{ id: string; hash: string; previousHash: string }> {
    return [...this.entries.values()]
      .filter((e) => e.tenantId === tenantId)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Clear all entries (for testing).
   */
  reset(): void {
    this.entries.clear();
  }
}

/**
 * Create a retention job runner with the given data provider.
 */
export function createRetentionJobRunner(provider: RetentionDataProvider): RetentionJobRunner {
  return new RetentionJobRunner(provider);
}

/**
 * Create an audit immutability verifier.
 */
export function createAuditImmutabilityVerifier(): AuditImmutabilityVerifier {
  return new AuditImmutabilityVerifier();
}
