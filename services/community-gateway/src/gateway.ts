import type { ConnectorResult, OutboundMessage } from '@chai/connector-sdk';
import type { CommunityWhatsAppAdapter } from '@chai/connectors/community-whatsapp';
import type { KillSwitchRuntime } from '@chai/connectors/kill-switch';

import {
  COMMUNITY_RISK_CLASS,
  COMMUNITY_SLA_CLASS,
  type CommunityGatewayEvent,
} from './types';

/**
 * Community Gateway (FASE 25).
 *
 * An ISOLATED translator with NO business logic: it turns a WhatsApp Web
 * session's webhooks into canonical, risk-stamped internal events and submits
 * outbound messages, all behind an entitlement gate, an owner-only activation
 * audit, a per-tenant kill switch, self-quarantine, and a conservative rate
 * guard. It never shares a delivery path with the official Meta channel.
 */

/** Prerequisite 1: a dedicated capability, default OFF, read by EntitlementService. */
export const COMMUNITY_CHANNEL_CAPABILITY = 'community_channel';

/** Prerequisite 5: the community kill-switch provider, separate from `channel`. */
const COMMUNITY_KILL_SWITCH_PROVIDER = 'community-channel' as const;

export class FeatureNotEnabledError extends Error {
  readonly capability = COMMUNITY_CHANNEL_CAPABILITY;
  readonly code = 'FEATURE_NOT_ENABLED';
  constructor() {
    super(`Capability ${COMMUNITY_CHANNEL_CAPABILITY} is not enabled for this tenant.`);
    this.name = 'FeatureNotEnabledError';
  }
}

/** Throws FEATURE_NOT_ENABLED unless the tenant holds the community capability. */
export function assertCommunityEntitled(enabledCapabilities: readonly string[]): void {
  if (!enabledCapabilities.includes(COMMUNITY_CHANNEL_CAPABILITY)) {
    throw new FeatureNotEnabledError();
  }
}

// ── Prerequisite 2: owner-only activation, audited on the cross-tenant path ──

export interface CommunityActivationRequest {
  actorId: string;
  reason: string;
  role: string;
  tenantId: string;
}

export interface CommunityActivationAudit {
  action: 'community_channel.activate';
  actorId: string;
  at: Date;
  /** Same shape the audit middleware records for owner cross-tenant access (FASE 15). */
  isCrossTenant: true;
  reason: string;
  riskClass: typeof COMMUNITY_RISK_CLASS;
  tenantId: string;
}

export class ActivationDeniedError extends Error {
  readonly code = 'ACTIVATION_DENIED';
  constructor(reason: string) {
    super(reason);
    this.name = 'ActivationDeniedError';
  }
}

/**
 * Only a PLATFORM_OWNER, with an explicit tenant context and a stored reason,
 * may activate the community channel. Returns an audit record shaped like the
 * cross-tenant access audit (isCrossTenant + reason) so the API can feed it to
 * the same audit sink (apps/api audit.middleware).
 */
export function authorizeCommunityActivation(
  request: CommunityActivationRequest,
): CommunityActivationAudit {
  if (request.role !== 'PLATFORM_OWNER') {
    throw new ActivationDeniedError('Only PLATFORM_OWNER may activate the community channel.');
  }
  if (request.tenantId.trim().length === 0) {
    throw new ActivationDeniedError('An explicit tenant context is required.');
  }
  if (request.reason.trim().length === 0) {
    throw new ActivationDeniedError('A stored reason is required, as for cross-tenant access.');
  }
  return {
    action: 'community_channel.activate',
    actorId: request.actorId,
    at: new Date(),
    isCrossTenant: true,
    reason: request.reason,
    riskClass: COMMUNITY_RISK_CLASS,
    tenantId: request.tenantId,
  };
}

export interface CommunityGatewayOptions {
  adapter: CommunityWhatsAppAdapter;
  channelAccount: string;
  enabledCapabilities: readonly string[];
  killSwitch: KillSwitchRuntime;
  minSendIntervalMs?: number;
  now?: () => number;
  publish: (event: CommunityGatewayEvent) => void;
  sessionId?: string;
  tenantId: string;
}

export class CommunityGateway {
  private readonly adapter: CommunityWhatsAppAdapter;
  private readonly channelAccount: string;
  private readonly killSwitch: KillSwitchRuntime;
  private readonly minSendIntervalMs: number;
  private readonly now: () => number;
  private readonly publish: (event: CommunityGatewayEvent) => void;
  private readonly sessionId: string;
  private readonly tenantId: string;
  private sequence = 0;
  private lastSendAt = Number.NEGATIVE_INFINITY;
  private quarantined = false;
  private quarantineReason: string | null = null;

  constructor(options: CommunityGatewayOptions) {
    // Prerequisite 1: refuse to even construct without the capability.
    assertCommunityEntitled(options.enabledCapabilities);
    this.adapter = options.adapter;
    this.channelAccount = options.channelAccount;
    this.killSwitch = options.killSwitch;
    this.minSendIntervalMs = options.minSendIntervalMs ?? 1_000;
    this.now = options.now ?? ((): number => Date.now());
    this.publish = options.publish;
    this.sessionId = options.sessionId ?? `community-${options.tenantId}`;
    this.tenantId = options.tenantId;
  }

  /** Stopped when the per-tenant kill switch is tripped or the gateway self-quarantined. */
  isStopped(): boolean {
    return (
      this.quarantined ||
      this.killSwitch.isTripped(COMMUNITY_KILL_SWITCH_PROVIDER, this.tenantId)
    );
  }

  quarantine(reason: string): void {
    this.quarantined = true;
    this.quarantineReason = reason;
  }

  getQuarantineReason(): string | null {
    return this.quarantineReason;
  }

  /** Normalize a raw WAHA webhook into risk-stamped envelopes and publish them in order. */
  async ingest(raw: Uint8Array): Promise<CommunityGatewayEvent[]> {
    if (this.isStopped()) return [];
    const { events } = await this.adapter.normalizeWebhook({ raw });
    const envelopes: CommunityGatewayEvent[] = [];
    for (const event of events) {
      this.sequence += 1;
      const envelope: CommunityGatewayEvent = {
        channelAccount: this.channelAccount,
        event,
        gatewaySessionId: this.sessionId,
        riskClass: COMMUNITY_RISK_CLASS,
        sequence: this.sequence,
        slaClass: COMMUNITY_SLA_CLASS,
        tenantId: this.tenantId,
      };
      this.publish(envelope);
      envelopes.push(envelope);
    }
    return envelopes;
  }

  /** Submit an outbound message behind the kill switch, quarantine, and rate guard. */
  async send(message: OutboundMessage): Promise<ConnectorResult> {
    if (this.isStopped()) {
      return {
        category: 'POLICY',
        errorCode: 'COMMUNITY_CHANNEL_STOPPED',
        retryable: false,
        success: false,
      };
    }
    // Conservative rate guard: a fragile unofficial number is throttled hard.
    const at = this.now();
    const elapsed = at - this.lastSendAt;
    if (elapsed < this.minSendIntervalMs) {
      return {
        category: 'RATE_LIMIT',
        retryAfterMs: this.minSendIntervalMs - elapsed,
        retryable: true,
        success: false,
      };
    }
    this.lastSendAt = at;
    return this.adapter.sendMessage(message);
  }
}
