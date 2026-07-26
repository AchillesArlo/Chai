import {
  evaluateToolPolicy,
  type ConversationMode as DomainConversationMode,
  type ToolPolicyDecision,
  type ToolRiskTier,
} from '@chai/domain';

export type ConversationMode = DomainConversationMode;

export type ActionDecision =
  | { kind: 'allow'; risk?: ToolRiskTier }
  | { kind: 'deny'; code: string; reason: string }
  | { kind: 'require_approval'; code: string; reason: string }
  | { kind: 'require_confirmation'; code: string; reason: string };

/**
 * API-facing wrapper over the canonical policy engine.
 *
 * The risk tiers and the AI-forbidden list live in `@chai/domain` so the API and
 * the AI gateway cannot drift: a tool that is CRITICAL in one place used to be
 * merely "approval required" in the other (R-11).
 */
export function evaluateActionPolicy(input: {
  approvedBy?: string;
  confirmed?: boolean;
  entitlements?: readonly string[];
  mode: ConversationMode;
  origin: 'ai' | 'human';
  tool: string;
}): ActionDecision {
  const decision = evaluateToolPolicy({
    ...(input.approvedBy ? { approvedBy: input.approvedBy } : {}),
    // Unknown tools are denied by the engine; low-risk reads need no ceremony,
    // so an absent confirmation flag only matters for MEDIUM and above.
    confirmed: input.confirmed ?? false,
    entitlements: input.entitlements ?? [],
    mode: input.mode,
    origin: input.origin,
    tool: input.tool,
  });
  return toActionDecision(decision);
}

function toActionDecision(decision: ToolPolicyDecision): ActionDecision {
  switch (decision.kind) {
    case 'ALLOW':
      return { kind: 'allow', risk: decision.risk };
    case 'DENY':
      return { code: decision.code, kind: 'deny', reason: decision.reason };
    case 'REQUIRE_APPROVAL':
      return {
        code: decision.code,
        kind: 'require_approval',
        reason: decision.reason,
      };
    case 'REQUIRE_CONFIRMATION':
      return {
        code: decision.code,
        kind: 'require_confirmation',
        reason: decision.reason,
      };
  }
}
