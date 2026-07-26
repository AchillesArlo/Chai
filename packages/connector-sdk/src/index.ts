export type ConnectorErrorCategory =
  | 'AUTH'
  | 'PERMISSION'
  | 'RATE_LIMIT'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TRANSIENT'
  | 'POLICY'
  | 'UNKNOWN_RESULT';

export type RiskClass = 'OFFICIAL' | 'META_DIRECT' | 'COMMUNITY' | 'SYNTHETIC';
export type SlaClass = 'PRODUCTION' | 'STAGING' | 'SYNTHETIC';

export interface CapabilityManifest {
  capabilities: Record<string, boolean>;
  connectorKey: string;
  limits: Record<string, number>;
  riskClass: RiskClass;
  slaClass: SlaClass;
  version: string;
}

export type InboundContentType = 'TEXT' | 'MEDIA' | 'TEMPLATE' | 'SYSTEM';

export interface InboundEvent {
  channelAccount: string;
  content: {
    contentType: InboundContentType;
    mediaRef?: string;
    text?: string;
  };
  direction: 'INBOUND';
  externalEventId: string;
  externalMessageId?: string;
  externalThread?: string;
  externalUserId: string;
  provider: string;
  providerTimestamp: Date;
  rawReference: string;
  tenantId: string;
}

export type OutboundContentType = 'TEXT' | 'MEDIA' | 'TEMPLATE';

export interface OutboundMessage {
  channelAccount: string;
  content: {
    contentType: OutboundContentType;
    mediaRef?: string;
    templateKey?: string;
    text?: string;
  };
  externalUserId: string;
  idempotencyKey: string;
  provider: string;
  replyToExternalMessage?: string;
  tenantId: string;
}

export interface ConnectorResult {
  category?: ConnectorErrorCategory;
  diagnosticRef?: string;
  errorCode?: string;
  externalId?: string;
  retryAfterMs?: number;
  retryable: boolean;
  success: boolean;
  usage?: Record<string, number>;
}

export type WebhookVerification = { verified: boolean; reason?: string };

export interface HealthCheck {
  healthy: boolean;
  reason?: string;
}

/**
 * Canonical contract every channel connector implements. Adapters normalize a
 * provider-specific surface into platform-canonical events and never import
 * repositories — they receive/return plain data so they stay testable in
 * isolation and across tenants.
 */
export interface ChannelAdapter {
  readonly connectorKey: string;
  discoverCapabilities(): Promise<CapabilityManifest>;
  healthCheck(): Promise<HealthCheck>;
  normalizeWebhook(input: {
    raw: Uint8Array;
    signature?: string;
    timestamp?: string;
  }): Promise<{ events: InboundEvent[]; verification: WebhookVerification }>;
  sendMessage(message: OutboundMessage): Promise<ConnectorResult>;
}

/** Calendar connector surface (Google/Microsoft later; mock today). */
export interface CalendarSlot {
  endsAt: Date;
  resourceId: string;
  startsAt: Date;
}

export interface CalendarAvailabilityRequest {
  resourceIds: string[];
  tenantId: string;
  windowEnd: Date;
  windowStart: Date;
}

export interface CalendarAdapter {
  acceptBooking(tenantId: string, slot: CalendarSlot): void;
  listAvailability(
    request: CalendarAvailabilityRequest,
  ): Promise<CalendarSlot[]>;
}
