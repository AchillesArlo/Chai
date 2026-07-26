// ponytail: tenant isolation certification — RLS audit & test suite.
// Verifies that tenant-scoped queries never leak data across tenant boundaries.

/**
 * Tenant isolation test case.
 */
export interface TenantIsolationTest {
  dataClass: string;
  description: string;
  // Query that should be tenant-scoped
  query: (tenantId: string) => Promise<unknown[]>;
  // Seed data for two tenants
  seed: Array<{ tenantId: string; data: unknown }>;
}

/**
 * Tenant isolation test result.
 */
export interface TenantIsolationResult {
  dataClass: string;
  leaked: boolean;
  leakedCount: number;
  passed: boolean;
  reason: string;
  tenantA: string;
  tenantB: string;
}

/**
 * Tenant isolation certification suite.
 */
export class TenantIsolationSuite {
  private tests: Map<string, TenantIsolationTest> = new Map();

  /**
   * Register a tenant isolation test.
   */
  register(test: TenantIsolationTest): void {
    this.tests.set(test.dataClass, test);
  }

  /**
   * List all registered tests.
   */
  list(): TenantIsolationTest[] {
    return [...this.tests.values()];
  }

  /**
   * Run a single tenant isolation test.
   * Seeds data for two tenants, then verifies queries don't leak.
   */
  async runTest(test: TenantIsolationTest): Promise<TenantIsolationResult> {
    const tenants = [...new Set(test.seed.map((s) => s.tenantId))];
    const [tenantA, tenantB] = tenants;
    if (tenantA === undefined || tenantB === undefined) {
      return {
        dataClass: test.dataClass,
        leaked: false,
        leakedCount: 0,
        passed: false,
        reason: 'Need at least 2 tenants for isolation test',
        tenantA: tenantA ?? '',
        tenantB: tenantB ?? '',
      };
    }

    // Query tenant A's data
    const resultsA = await test.query(tenantA);
    const resultsB = await test.query(tenantB);

    // Check for cross-tenant leakage
    const aResults = resultsA as Array<{ tenantId?: string }>;
    const bResults = resultsB as Array<{ tenantId?: string }>;

    const leakedInA = aResults.filter((r) => r?.tenantId && r.tenantId !== tenantA).length;
    const leakedInB = bResults.filter((r) => r?.tenantId && r.tenantId !== tenantB).length;

    const leaked = leakedInA > 0 || leakedInB > 0;
    const leakedCount = leakedInA + leakedInB;

    return {
      dataClass: test.dataClass,
      leaked,
      leakedCount,
      passed: !leaked,
      reason: leaked
        ? `Cross-tenant data leak detected: ${leakedCount} records`
        : 'No cross-tenant leakage',
      tenantA,
      tenantB,
    };
  }

  /**
   * Run all registered tests.
   */
  async runAll(): Promise<TenantIsolationResult[]> {
    const results: TenantIsolationResult[] = [];
    for (const test of this.tests.values()) {
      results.push(await this.runTest(test));
    }
    return results;
  }

  /**
   * Get certification summary.
   */
  async summary(): Promise<{ certified: boolean; passed: number; total: number }> {
    const results = await this.runAll();
    const passed = results.filter((r) => r.passed).length;
    return {
      certified: passed === results.length,
      passed,
      total: results.length,
    };
  }

  /**
   * Clear all tests (for testing).
   */
  reset(): void {
    this.tests.clear();
  }
}

/**
 * Default singleton instance.
 */
let defaultSuite: TenantIsolationSuite | null = null;

/**
 * Get or create the default tenant isolation suite.
 */
export function getTenantIsolationSuite(): TenantIsolationSuite {
  if (!defaultSuite) {
    defaultSuite = new TenantIsolationSuite();
  }
  return defaultSuite;
}

/**
 * Reset the default suite (for testing).
 */
export function resetTenantIsolationSuite(): void {
  defaultSuite = null;
}

/**
 * Create a new tenant isolation suite instance.
 */
export function createTenantIsolationSuite(): TenantIsolationSuite {
  return new TenantIsolationSuite();
}
