/**
 * Canonical tool catalog and policy engine (ADR-011, 08_AI §14, 17_PAYMENT §10).
 *
 * "AI proposes, policy executes": a tool must never run because a model asked
 * nicely. Every side effect passes through {@link evaluateToolPolicy}, which is
 * the only place that decides, and the executor refuses to run without a
 * decision it produced.
 *
 * The catalog is the single source of truth for risk tiers. It previously lived
 * in two places — an API-side high-risk set and a gateway-side allowlist — which
 * is how `ExecuteRefund` ended up merely "requiring approval" in one path and
 * being unknown to the other.
 */

export type ToolRiskTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ConversationMode = 'AI_ACTIVE' | 'HUMAN_ACTIVE' | 'PAUSED';

export type ToolOrigin = 'ai' | 'human';

export interface ToolSpec {
  /**
   * False when an AI-originated call may never execute this tool, no matter what
   * approval accompanies it. A human must drive it from the console.
   */
  aiExecutable: boolean;
  /** Capability that must be enabled for the tenant, when the tool is gated. */
  requiredEntitlement?: string;
  risk: ToolRiskTier;
}

/**
 * Risk tiers follow 17_PAYMENT §10 and 08_AI §14.
 *
 * `ExecuteRefund` is CRITICAL and not AI-executable: it moves money back and is
 * the canonical example of an action a model must never be able to take.
 */
export const TOOL_CATALOG: Record<string, ToolSpec> = {
  // Read-only knowledge and lookups.
  'knowledge.search': { aiExecutable: true, risk: 'LOW' },
  'product.search': { aiExecutable: true, risk: 'LOW' },
  'inventory.get': { aiExecutable: true, risk: 'LOW' },
  'calendar.check_availability': { aiExecutable: true, risk: 'LOW' },
  'conversation.handover': { aiExecutable: true, risk: 'LOW' },
  'payment.get_status': {
    aiExecutable: true,
    requiredEntitlement: 'payment_orchestration',
    risk: 'LOW',
  },
  'shipment.get_status': {
    aiExecutable: true,
    requiredEntitlement: 'shipment_tracking',
    risk: 'LOW',
  },
  'shipment.get_timeline': {
    aiExecutable: true,
    requiredEntitlement: 'shipment_tracking',
    risk: 'LOW',
  },

  // Medium: confirm with the customer or the agent before acting.
  'order.get': { aiExecutable: true, risk: 'MEDIUM' },
  'appointment.create': { aiExecutable: true, risk: 'MEDIUM' },
  'appointment.reschedule': { aiExecutable: true, risk: 'MEDIUM' },
  'appointment.cancel': { aiExecutable: true, risk: 'MEDIUM' },
  'payment.create_link': {
    aiExecutable: true,
    requiredEntitlement: 'payment_orchestration',
    risk: 'MEDIUM',
  },
  'shipment.get_proof_of_delivery': {
    aiExecutable: true,
    requiredEntitlement: 'shipment_tracking',
    risk: 'MEDIUM',
  },
  'followup.send': { aiExecutable: true, risk: 'MEDIUM' },

  // High: a human approves before the effect happens.
  'payment.cancel_request': {
    aiExecutable: true,
    requiredEntitlement: 'payment_orchestration',
    risk: 'HIGH',
  },
  'payment.request_refund': {
    aiExecutable: true,
    requiredEntitlement: 'payment_refunds',
    risk: 'HIGH',
  },
  'payment.charge': { aiExecutable: true, risk: 'HIGH' },
  'invoice.send': { aiExecutable: true, risk: 'HIGH' },
  'inventory.reserve': { aiExecutable: true, risk: 'HIGH' },
  'inventory.update': { aiExecutable: true, risk: 'HIGH' },
  'shipment.create': {
    aiExecutable: true,
    requiredEntitlement: 'shipment_create_label',
    risk: 'HIGH',
  },
  'shipment.schedule_pickup': {
    aiExecutable: true,
    requiredEntitlement: 'shipment_pickup',
    risk: 'HIGH',
  },
  'shipment.cancel': {
    aiExecutable: true,
    requiredEntitlement: 'shipment_create_label',
    risk: 'HIGH',
  },
  'shipment.create_return': {
    aiExecutable: true,
    requiredEntitlement: 'shipment_returns',
    risk: 'HIGH',
  },

  // Critical: never AI-executable.
  'payment.execute_refund': {
    aiExecutable: false,
    requiredEntitlement: 'payment_refunds',
    risk: 'CRITICAL',
  },
  'payment.payout': { aiExecutable: false, risk: 'CRITICAL' },
  'payment.split': { aiExecutable: false, risk: 'CRITICAL' },
  'order.cancel': { aiExecutable: false, risk: 'CRITICAL' },
  'account.delete': { aiExecutable: false, risk: 'CRITICAL' },
  'logistics.cancel': { aiExecutable: false, risk: 'CRITICAL' },
};

export type ToolPolicyDecision =
  | { kind: 'ALLOW'; risk: ToolRiskTier; tool: string }
  | { code: string; kind: 'DENY'; reason: string; tool: string }
  | { code: string; kind: 'REQUIRE_CONFIRMATION'; reason: string; tool: string }
  | { code: string; kind: 'REQUIRE_APPROVAL'; reason: string; tool: string };

export interface ToolPolicyInput {
  /** Human approval already captured for this specific action. */
  approvedBy?: string;
  /** Customer or agent confirmation captured for a medium-risk action. */
  confirmed?: boolean;
  /** Capabilities enabled for the tenant. */
  entitlements?: readonly string[];
  mode: ConversationMode;
  origin: ToolOrigin;
  tool: string;
}

/**
 * The only place a tool execution is authorised.
 *
 * Order matters: identity/mode first, then whether AI may touch this tool at
 * all, then entitlement, then the approval ladder. Anything unrecognised is
 * denied — an unknown tool is not a low-risk tool.
 */
export function evaluateToolPolicy(
  input: ToolPolicyInput,
): ToolPolicyDecision {
  const spec = TOOL_CATALOG[input.tool];
  if (!spec) {
    return {
      code: 'UNKNOWN_TOOL',
      kind: 'DENY',
      reason: `Tool ${input.tool} is not in the catalog`,
      tool: input.tool,
    };
  }

  if (input.origin === 'ai' && input.mode === 'HUMAN_ACTIVE') {
    return {
      code: 'AI_OUTBOUND_BLOCKED',
      kind: 'DENY',
      reason: 'HUMAN_ACTIVE blocks AI-originated tool execution',
      tool: input.tool,
    };
  }
  if (input.origin === 'ai' && input.mode === 'PAUSED') {
    return {
      code: 'CONVERSATION_PAUSED',
      kind: 'DENY',
      reason: 'Paused conversations reject AI tool execution',
      tool: input.tool,
    };
  }

  if (input.origin === 'ai' && !spec.aiExecutable) {
    return {
      code: 'AI_EXECUTION_FORBIDDEN',
      kind: 'DENY',
      reason: `Tool ${input.tool} is ${spec.risk} and may never be executed by AI`,
      tool: input.tool,
    };
  }

  if (
    spec.requiredEntitlement &&
    !(input.entitlements ?? []).includes(spec.requiredEntitlement)
  ) {
    return {
      code: 'FEATURE_NOT_ENABLED',
      kind: 'DENY',
      reason: `Tool ${input.tool} requires capability ${spec.requiredEntitlement}`,
      tool: input.tool,
    };
  }

  if (spec.risk === 'CRITICAL' || spec.risk === 'HIGH') {
    if (!input.approvedBy) {
      return {
        code: 'APPROVAL_REQUIRED',
        kind: 'REQUIRE_APPROVAL',
        reason: `Tool ${input.tool} requires human approval`,
        tool: input.tool,
      };
    }
    return { kind: 'ALLOW', risk: spec.risk, tool: input.tool };
  }

  if (spec.risk === 'MEDIUM' && !input.confirmed) {
    return {
      code: 'CONFIRMATION_REQUIRED',
      kind: 'REQUIRE_CONFIRMATION',
      reason: `Tool ${input.tool} requires explicit confirmation`,
      tool: input.tool,
    };
  }

  return { kind: 'ALLOW', risk: spec.risk, tool: input.tool };
}

/** Risk tier for a tool, or null when the tool is not in the catalog. */
export function toolRiskTier(tool: string): ToolRiskTier | null {
  return TOOL_CATALOG[tool]?.risk ?? null;
}

/** Tools an AI may never execute, whatever approval is presented. */
export function aiForbiddenTools(): string[] {
  return Object.entries(TOOL_CATALOG)
    .filter(([, spec]) => !spec.aiExecutable)
    .map(([tool]) => tool);
}
