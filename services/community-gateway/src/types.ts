import type { InboundEvent } from '@chai/connector-sdk';

/**
 * Community Gateway event envelope (FASE 25, prerequisite 3).
 *
 * Every event the gateway produces carries `riskClass: 'COMMUNITY'` and a
 * non-production `slaClass`, so dashboards and burn-rate never blend this
 * unofficial channel with an SLA-backed official one.
 */
export const COMMUNITY_RISK_CLASS = 'COMMUNITY' as const;

/** Non-production: an unofficial WhatsApp Web session cannot be given an SLA. */
export const COMMUNITY_SLA_CLASS = 'STAGING' as const;

export interface CommunityGatewayEvent {
  channelAccount: string;
  event: InboundEvent;
  gatewaySessionId: string;
  riskClass: typeof COMMUNITY_RISK_CLASS;
  /** Monotonic per-gateway sequence to preserve inbound message ordering. */
  sequence: number;
  slaClass: typeof COMMUNITY_SLA_CLASS;
  tenantId: string;
}
