import { randomUUID } from 'node:crypto';

import type {
  CapabilityManifest,
  ChannelAdapter,
  ConnectorResult,
  HealthCheck,
  InboundEvent,
  OutboundMessage,
} from '@chai/connector-sdk';

/**
 * Community WhatsApp (WAHA) connector — REQ-09-012, FASE 25.
 *
 * This is the UNOFFICIAL WhatsApp Web path. It carries `riskClass: 'COMMUNITY'`
 * and a non-production `slaClass`, and it is deliberately a plain adapter with
 * NO business logic: it translates a WhatsApp Web session's webhooks into
 * canonical inbound events and submits outbound text/media. It never touches the
 * database, the outbox, or the official Meta delivery path — those guarantees
 * must not be diluted by a channel whose number can be blocked at any time
 * (see docs/plans/2026-07-26-community-gateway-roadmap.md).
 */

/** The provider key; distinct from `whatsapp-meta` so metrics never blend. */
export const COMMUNITY_WHATSAPP_PROVIDER = 'community-whatsapp';

export type CommunitySendOutcome = 'sent' | 'timeout' | 'failed';

export interface CommunitySendResult {
  externalId?: string;
  outcome: CommunitySendOutcome;
}

/**
 * Transport seam for the actual WhatsApp Web session (WAHA/Baileys, out of
 * scope here). Injected so the adapter stays unit-testable without a real,
 * bannable phone number.
 */
export interface CommunityTransport {
  send(message: OutboundMessage): Promise<CommunitySendResult>;
  status?(idempotencyKey: string): Promise<'DELIVERED' | 'FAILED' | 'UNKNOWN'>;
}

export interface CommunityWhatsAppAdapterOptions {
  channelAccount: string;
  tenantId: string;
  transport?: CommunityTransport;
}

/** Community adapter surface: the canonical channel contract plus reconcile. */
export interface CommunityWhatsAppAdapter extends ChannelAdapter {
  /** Resolve a previously-submitted send whose result was UNKNOWN. */
  reconcile(idempotencyKey: string): Promise<'DELIVERED' | 'FAILED' | 'UNKNOWN'>;
}

interface SyntheticWebhook {
  data?: {
    external_event_id?: string;
    external_message_id?: string;
    external_thread?: string;
    external_user_id?: string;
    media_ref?: string;
    text?: string;
    timestamp?: string;
  };
}

/** WAHA-style inbound webhook (WhatsApp Web session event). */
interface WahaWebhook {
  event?: string;
  payload?: {
    body?: string;
    from?: string;
    hasMedia?: boolean;
    id?: string;
    mediaUrl?: string;
    timestamp?: number;
  };
  session?: string;
}

function parseJson(raw: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(raw)) as unknown;
}

function fromSynthetic(
  data: NonNullable<SyntheticWebhook['data']>,
  options: CommunityWhatsAppAdapterOptions,
): InboundEvent | null {
  if (!data.external_event_id || !data.external_user_id) return null;
  return {
    channelAccount: options.channelAccount,
    content: {
      contentType: data.media_ref ? 'MEDIA' : 'TEXT',
      ...(data.media_ref ? { mediaRef: data.media_ref } : {}),
      ...(data.text ? { text: data.text } : {}),
    },
    direction: 'INBOUND',
    externalEventId: data.external_event_id,
    externalMessageId: data.external_message_id,
    externalThread: data.external_thread,
    externalUserId: data.external_user_id,
    provider: COMMUNITY_WHATSAPP_PROVIDER,
    providerTimestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    rawReference: `restricted://${COMMUNITY_WHATSAPP_PROVIDER}/${data.external_event_id}`,
    tenantId: options.tenantId,
  };
}

function fromWaha(
  body: WahaWebhook,
  options: CommunityWhatsAppAdapterOptions,
): InboundEvent | null {
  const p = body.payload;
  if (body.event !== 'message' || !p?.id || !p.from) return null;
  return {
    channelAccount: options.channelAccount,
    content: {
      contentType: p.hasMedia ? 'MEDIA' : 'TEXT',
      ...(p.hasMedia && p.mediaUrl ? { mediaRef: p.mediaUrl } : {}),
      ...(p.body ? { text: p.body } : {}),
    },
    direction: 'INBOUND',
    externalEventId: p.id,
    externalMessageId: p.id,
    externalUserId: p.from,
    provider: COMMUNITY_WHATSAPP_PROVIDER,
    providerTimestamp: p.timestamp ? new Date(p.timestamp * 1000) : new Date(),
    rawReference: `restricted://${COMMUNITY_WHATSAPP_PROVIDER}/${p.id}`,
    tenantId: options.tenantId,
  };
}

export function createCommunityWhatsAppAdapter(
  options: CommunityWhatsAppAdapterOptions,
): CommunityWhatsAppAdapter {
  // Idempotency ledger: a submitted send is remembered so a duplicate with the
  // same key never sends twice (README invariant: external effects idempotent).
  const sentByKey = new Map<string, string>();
  const transport: CommunityTransport =
    options.transport ?? {
      // Default dry-run transport for sandbox/local: deterministic "sent".
      async send(message: OutboundMessage): Promise<CommunitySendResult> {
        return { externalId: `waha.${message.idempotencyKey}`, outcome: 'sent' };
      },
    };

  return {
    connectorKey: COMMUNITY_WHATSAPP_PROVIDER,

    async discoverCapabilities(): Promise<CapabilityManifest> {
      return {
        capabilities: {
          // No delivery-status guarantee on an unofficial session.
          delivery_status: false,
          mark_read: false,
          receive_media: true,
          receive_text: true,
          send_media: true,
          send_template: false,
          send_text: true,
        },
        connectorKey: COMMUNITY_WHATSAPP_PROVIDER,
        // Conservative rate guard: an unofficial number gets throttled hard.
        limits: { messagesPerSecond: 1 },
        riskClass: 'COMMUNITY',
        slaClass: 'STAGING',
        version: '1',
      };
    },

    async healthCheck(): Promise<HealthCheck> {
      return { healthy: true, reason: 'community session (no SLA)' };
    },

    async normalizeWebhook({ raw }) {
      let parsed: unknown;
      try {
        parsed = parseJson(raw);
      } catch {
        return { events: [], verification: { reason: 'invalid json', verified: false } };
      }

      const synthetic = (parsed as SyntheticWebhook).data;
      if (synthetic) {
        const event = fromSynthetic(synthetic, options);
        if (!event) {
          return {
            events: [],
            verification: {
              reason: 'missing external_event_id or external_user_id',
              verified: false,
            },
          };
        }
        return { events: [event], verification: { verified: true } };
      }

      const event = fromWaha(parsed as WahaWebhook, options);
      if (!event) {
        return {
          events: [],
          verification: { reason: 'unsupported WAHA payload', verified: false },
        };
      }
      return { events: [event], verification: { verified: true } };
    },

    async sendMessage(message: OutboundMessage): Promise<ConnectorResult> {
      const existing = sentByKey.get(message.idempotencyKey);
      if (existing) {
        // Duplicate submit: acknowledge without sending again, count zero usage.
        return {
          externalId: existing,
          retryable: false,
          success: true,
          usage: { outboundMessages: 0 },
        };
      }

      const result = await transport.send(message);
      if (result.outcome === 'sent') {
        const externalId = result.externalId ?? `waha.${message.idempotencyKey}.${randomUUID().slice(0, 8)}`;
        sentByKey.set(message.idempotencyKey, externalId);
        return {
          externalId,
          retryable: false,
          success: true,
          usage: { outboundMessages: 1 },
        };
      }

      if (result.outcome === 'timeout') {
        // Submitted, result unknown. Retryable with backoff, but the caller must
        // keep it reconciling rather than immediately re-sending (04 §14, 08 §).
        return {
          category: 'UNKNOWN_RESULT',
          retryAfterMs: 30_000,
          retryable: true,
          success: false,
          usage: { outboundMessages: 0 },
        };
      }

      return {
        category: 'VALIDATION',
        retryable: false,
        success: false,
        usage: { outboundMessages: 0 },
      };
    },

    async reconcile(idempotencyKey: string): Promise<'DELIVERED' | 'FAILED' | 'UNKNOWN'> {
      if (sentByKey.has(idempotencyKey)) return 'DELIVERED';
      if (transport.status) return transport.status(idempotencyKey);
      return 'UNKNOWN';
    },
  };
}
