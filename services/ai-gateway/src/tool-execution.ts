// ponytail: tool execution engine with allowlist & tenant policy.

import type { ToolPolicyDecision } from '@chai/domain';

/**
 * Tool definition.
 */
export interface ToolDefinition {
  description: string;
  name: string;
  parameters: Record<string, unknown>;
}

/**
 * Tool execution function.
 */
export type ToolExecutor = (params: Record<string, unknown>) => Promise<unknown>;

/**
 * Tenant tool policy — allowlist of permitted tools.
 */
export interface TenantToolPolicy {
  allowlist: string[];
  blockedTools: string[];
  tenantId: string;
}

/**
 * Tool execution result.
 */
export interface ToolExecutionResult {
  allowed: boolean;
  error?: string;
  reason?: string;
  result?: unknown;
  toolName: string;
}

/**
 * Tool registry — maps tool names to executors.
 */
export class ToolRegistry {
  private tools: Map<string, { definition: ToolDefinition; executor: ToolExecutor }> = new Map();

  register(definition: ToolDefinition, executor: ToolExecutor): void {
    this.tools.set(definition.name, { definition, executor });
  }

  get(toolName: string): { definition: ToolDefinition; executor: ToolExecutor } | null {
    return this.tools.get(toolName) ?? null;
  }

  list(): string[] {
    return [...this.tools.keys()];
  }

  has(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  clear(): void {
    this.tools.clear();
  }
}

/**
 * Tenant policy store — per-tenant allowlist/blocklist.
 */
export class TenantPolicyStore {
  private policies: Map<string, TenantToolPolicy> = new Map();

  set(policy: TenantToolPolicy): void {
    this.policies.set(policy.tenantId, policy);
  }

  get(tenantId: string): TenantToolPolicy {
    return (
      this.policies.get(tenantId) ?? {
        allowlist: [],
        blockedTools: [],
        tenantId,
      }
    );
  }

  /**
   * Check if a tool is allowed for a tenant.
   * If allowlist is non-empty, tool must be in it.
   * Tool must not be in blocklist.
   */
  isAllowed(tenantId: string, toolName: string): { allowed: boolean; reason?: string } {
    const policy = this.get(tenantId);

    if (policy.blockedTools.includes(toolName)) {
      return { allowed: false, reason: `Tool ${toolName} is blocked for tenant ${tenantId}` };
    }

    if (policy.allowlist.length > 0 && !policy.allowlist.includes(toolName)) {
      return { allowed: false, reason: `Tool ${toolName} not in tenant allowlist` };
    }

    return { allowed: true };
  }

  clear(): void {
    this.policies.clear();
  }
}

/**
 * Tool execution engine.
 *
 * Executing a tool requires a decision produced by the policy engine
 * (`@chai/domain` `evaluateToolPolicy`). The decision is a required argument, so
 * a caller cannot reach a side effect by forgetting to ask — which is exactly
 * how the policy engine ended up being an optional, advisory endpoint (R-11).
 */
export class ToolExecutionEngine {
  constructor(
    private registry: ToolRegistry,
    private policyStore: TenantPolicyStore
  ) {}

  /**
   * Execute a tool. `decision` must be an ALLOW from the policy engine for this
   * exact tool; anything else refuses without touching the executor.
   */
  async execute(
    tenantId: string,
    toolName: string,
    params: Record<string, unknown>,
    decision: ToolPolicyDecision
  ): Promise<ToolExecutionResult> {
    // 0. The policy decision is authoritative and must match this tool.
    if (decision.kind !== 'ALLOW') {
      return {
        allowed: false,
        reason: `Policy did not allow ${toolName}: ${decision.kind}`,
        toolName,
      };
    }
    if (decision.tool !== toolName) {
      return {
        allowed: false,
        reason: `Policy decision was issued for ${decision.tool}, not ${toolName}`,
        toolName,
      };
    }

    // 1. Check tenant policy
    const policyCheck = this.policyStore.isAllowed(tenantId, toolName);
    if (!policyCheck.allowed) {
      return {
        allowed: false,
        reason: policyCheck.reason,
        toolName,
      };
    }

    // 2. Check tool exists in registry
    const entry = this.registry.get(toolName);
    if (!entry) {
      return {
        allowed: false,
        error: `Tool ${toolName} not registered`,
        toolName,
      };
    }

    // 3. Execute tool. Its result is UNTRUSTED input for the next model turn,
    // so callers must pass it through the guardrails before feeding it back
    // (08_AI §9: "tool results are untrusted, validated").
    try {
      const result = await entry.executor(params);
      return {
        allowed: true,
        result,
        toolName,
      };
    } catch (err) {
      return {
        allowed: true,
        error: err instanceof Error ? err.message : String(err),
        toolName,
      };
    }
  }

  /**
   * Filter a list of tool proposals against tenant policy.
   */
  filterProposals(
    tenantId: string,
    proposals: Array<{ name: string }>
  ): Array<{ allowed: boolean; name: string; reason?: string }> {
    return proposals.map((p) => {
      const check = this.policyStore.isAllowed(tenantId, p.name);
      return { ...p, allowed: check.allowed, reason: check.reason };
    });
  }
}

/**
 * Create a default tool execution engine.
 */
export function createToolExecutionEngine(): ToolExecutionEngine {
  return new ToolExecutionEngine(new ToolRegistry(), new TenantPolicyStore());
}

/**
 * Create a default tool registry.
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}

/**
 * Create a default tenant policy store.
 */
export function createTenantPolicyStore(): TenantPolicyStore {
  return new TenantPolicyStore();
}
