export interface CapabilitySets {
  connectorCapabilities: readonly string[];
  channelCapabilities: readonly string[];
  tenantEntitlements: readonly string[];
  policyAllowedCapabilities: readonly string[];
}

/**
 * REQ-09-003: Computes the effective capability intersection across four boundaries:
 * Connector ∩ Channel Account ∩ Tenant Entitlements ∩ Policy Allowlist.
 * If a capability is missing from ANY of these 4 sets, it is NOT available.
 */
export function calculateEffectiveCapabilities(sets: CapabilitySets): string[] {
  const connectorSet = new Set(sets.connectorCapabilities);
  const channelSet = new Set(sets.channelCapabilities);
  const entitlementSet = new Set(sets.tenantEntitlements);
  const policySet = new Set(sets.policyAllowedCapabilities);

  return Array.from(connectorSet).filter(
    (cap) => channelSet.has(cap) && entitlementSet.has(cap) && policySet.has(cap),
  );
}

/**
 * REQ-08-036: AI capability selection filter.
 * Ensures the AI agent capability selector never picks a tool/capability
 * outside the effective capability intersection.
 */
export function isCapabilityAllowedForAI(
  requestedCapability: string,
  effectiveIntersection: readonly string[],
): boolean {
  return effectiveIntersection.includes(requestedCapability);
}
