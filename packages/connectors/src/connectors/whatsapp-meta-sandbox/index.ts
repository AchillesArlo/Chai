import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import type {
  CapabilityManifest,
  ChannelAdapter,
  ConnectorResult,
  HealthCheck,
  InboundEvent,
  OutboundMessage,
} from '@chai/connector-sdk';

export interface WhatsAppMetaSandboxOptions {
  /** App secret for X-Hub-Signature-256. Empty = accept verified=true in sandbox. */
  appSecret?: string;
  channelAccount: string;
  phoneNumberId?: string;
  tenantId: string;
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

interface MetaMessage {
  from?: string;
  id?: string;
  text?: { body?: string };
  timestamp?: string;
  type?: string;
}

interface MetaChangeValue {
  messages?: MetaMessage[];
  metadata?: { phone_number_id?: string };
}

interface MetaWebhook {
  entry?: Array<{
    changes?: Array<{ value?: MetaChangeValue }>;
  }>;
  object?: string;
}

function parseJson(raw: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(raw)) as unknown;
}

function verifySignature(
  raw: Uint8Array,
  signature: string | undefined,
  appSecret: string | undefined,
): { reason?: string; verified: boolean } {
  if (!appSecret) {
    // ponytail: sandbox without secret trusts shape; set WHATSAPP_APP_SECRET in staging.
    return { verified: true };
  }
  if (!signature?.startsWith('sha256=')) {
    return { reason: 'missing or malformed X-Hub-Signature-256', verified: false };
  }
  const expected = createHmac('sha256', appSecret).update(raw).digest('hex');
  const provided = signature.slice('sha256='.length);
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { reason: 'signature mismatch', verified: false };
    }
  } catch {
    return { reason: 'signature compare failed', verified: false };
  }
  return { verified: true };
}

function fromSynthetic(
  data: NonNullable<SyntheticWebhook['data']>,
  options: WhatsAppMetaSandboxOptions,
): InboundEvent | null {
  if (!data.external_event_id || !data.external_user_id) return null;
  const contentType = data.media_ref ? 'MEDIA' : 'TEXT';
  return {
    channelAccount: options.channelAccount,
    content: {
      contentType,
      ...(data.media_ref ? { mediaRef: data.media_ref } : {}),
      ...(data.text ? { text: data.text } : {}),
    },
    direction: 'INBOUND',
    externalEventId: data.external_event_id,
    externalMessageId: data.external_message_id,
    externalThread: data.external_thread,
    externalUserId: data.external_user_id,
    provider: 'whatsapp-meta',
    providerTimestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    rawReference: `restricted://whatsapp-meta/${data.external_event_id}`,
    tenantId: options.tenantId,
  };
}

function fromMeta(
  body: MetaWebhook,
  options: WhatsAppMetaSandboxOptions,
): InboundEvent[] {
  if (body.object !== 'whatsapp_business_account') return [];
  const events: InboundEvent[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages) continue;
      if (
        options.phoneNumberId &&
        value.metadata?.phone_number_id &&
        value.metadata.phone_number_id !== options.phoneNumberId
      ) {
        continue;
      }
      for (const message of value.messages) {
        if (!message.from || !message.id) continue;
        const text =
          message.type === 'text' || message.text?.body
            ? message.text?.body
            : undefined;
        events.push({
          channelAccount: options.channelAccount,
          content: {
            contentType: text ? 'TEXT' : 'SYSTEM',
            ...(text ? { text } : {}),
          },
          direction: 'INBOUND',
          externalEventId: message.id,
          externalMessageId: message.id,
          externalUserId: message.from,
          provider: 'whatsapp-meta',
          providerTimestamp: message.timestamp
            ? new Date(Number(message.timestamp) * 1000)
            : new Date(),
          rawReference: `restricted://whatsapp-meta/${message.id}`,
          tenantId: options.tenantId,
        });
      }
    }
  }
  return events;
}

/**
 * Meta Cloud API WhatsApp sandbox adapter.
 * Accepts real Meta webhook JSON and the synthetic conformance payload shape.
 * Outbound is dry-run (no Graph API call) until tokens are wired.
 */
export function createWhatsAppMetaSandboxAdapter(
  options: WhatsAppMetaSandboxOptions,
): ChannelAdapter {
  const appSecret = options.appSecret ?? process.env.WHATSAPP_APP_SECRET;

  return {
    connectorKey: 'whatsapp-meta',

    async discoverCapabilities(): Promise<CapabilityManifest> {
      return {
        capabilities: {
          delivery_status: true,
          mark_read: true,
          receive_media: true,
          receive_text: true,
          send_media: false,
          send_template: true,
          send_text: true,
        },
        connectorKey: 'whatsapp-meta',
        limits: { messagesPerSecond: 20 },
        riskClass: 'META_DIRECT',
        slaClass: 'STAGING',
        version: '1',
      };
    },

    async healthCheck(): Promise<HealthCheck> {
      return { healthy: true, reason: appSecret ? 'secret-configured' : 'sandbox-open' };
    },

    async normalizeWebhook({ raw, signature }) {
      const verification = verifySignature(raw, signature, appSecret);
      if (!verification.verified) {
        return { events: [], verification };
      }

      let parsed: unknown;
      try {
        parsed = parseJson(raw);
      } catch {
        return {
          events: [],
          verification: { reason: 'invalid json', verified: false },
        };
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

      const events = fromMeta(parsed as MetaWebhook, options);
      if (events.length === 0) {
        return {
          events: [],
          verification: {
            reason: 'no messages in webhook',
            verified: false,
          },
        };
      }
      return { events, verification: { verified: true } };
    },

    async sendMessage(message: OutboundMessage): Promise<ConnectorResult> {
      // ponytail: Graph API send when WHATSAPP_ACCESS_TOKEN lands; dry-run for sandbox.
      return {
        externalId: `wamid.sandbox.${message.idempotencyKey}.${randomUUID().slice(0, 8)}`,
        retryable: false,
        success: true,
        usage: { outboundMessages: 1 },
      };
    },
  };
}
