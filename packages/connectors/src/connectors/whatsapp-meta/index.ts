import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import type {
  CapabilityManifest,
  ChannelAdapter,
  ConnectorResult,
  HealthCheck,
  InboundEvent,
  OutboundMessage,
} from '@chai/connector-sdk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WhatsAppMetaAdapterOptions {
  /** WhatsApp Business Account phone number ID (from Meta dashboard). */
  phoneNumberId: string;
  /** Channel account identifier used in normalised events. */
  channelAccount: string;
  /** Tenant that owns this channel. */
  tenantId: string;
  /**
   * Bearer token for Graph API. When absent the adapter falls back to a
   * dry-run sandbox so local development still works.
   */
  accessToken?: string;
  /**
   * App secret for HMAC-SHA256 webhook signature verification.
   * When absent, signature checks are skipped (sandbox mode).
   */
  appSecret?: string;
  /** Override the Graph API base URL (useful for tests / proxies). */
  graphApiBaseUrl?: string;
}

/** Shape of a Meta Cloud API webhook payload (messages). */
interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: MetaChangeValue;
    }>;
  }>;
}

interface MetaChangeValue {
  messaging_product?: string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
}

interface MetaMessage {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  document?: { id?: string; mime_type?: string; filename?: string };
  audio?: { id?: string; mime_type?: string };
  video?: { id?: string; mime_type?: string };
}

interface MetaStatus {
  id?: string;
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp?: string;
  recipient_id?: string;
  conversation?: { id?: string; origin?: { type?: string } };
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

/** Graph API response for a successful message send. */
interface GraphApiSendResponse {
  messaging_product: string;
  contacts?: { input: string; wa_id: string }[];
  messages?: { id: string; message_status?: string }[];
}

/** Graph API error envelope. */
interface GraphApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';

function resolveOptions(options: WhatsAppMetaAdapterOptions): Required<WhatsAppMetaAdapterOptions> {
  return {
    accessToken: options.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN ?? '',
    appSecret: options.appSecret ?? process.env.WHATSAPP_APP_SECRET ?? '',
    graphApiBaseUrl: options.graphApiBaseUrl ?? DEFAULT_GRAPH_API_BASE,
    phoneNumberId: options.phoneNumberId,
    channelAccount: options.channelAccount,
    tenantId: options.tenantId,
  };
}

/**
 * Verify the `X-Hub-Signature-256` header using HMAC-SHA256.
 * Returns `{ verified: true }` when the signature matches or when no app
 * secret is configured (sandbox mode).
 */
export function verifyWebhookSignature(
  rawBody: Uint8Array,
  signature: string | undefined,
  appSecret: string,
): { verified: boolean; reason?: string } {
  if (!appSecret) {
    return { verified: true };
  }
  if (!signature?.startsWith('sha256=')) {
    return { reason: 'missing or malformed X-Hub-Signature-256', verified: false };
  }
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
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

function parseMetaMessages(
  body: MetaWebhookPayload,
  opts: Required<WhatsAppMetaAdapterOptions>,
): InboundEvent[] {
  if (body.object !== 'whatsapp_business_account') return [];

  const events: InboundEvent[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages) continue;

      // Filter by phone number ID when configured.
      if (
        value.metadata?.phone_number_id &&
        value.metadata.phone_number_id !== opts.phoneNumberId
      ) {
        continue;
      }

      for (const message of value.messages) {
        if (!message.from || !message.id) continue;

        const text =
          message.type === 'text' || message.text?.body
            ? message.text?.body
            : undefined;

        // Determine content type from message type.
        let contentType: 'TEXT' | 'MEDIA' | 'SYSTEM' = 'SYSTEM';
        let mediaRef: string | undefined;
        if (text) {
          contentType = 'TEXT';
        } else if (message.image?.id || message.document?.id || message.audio?.id || message.video?.id) {
          contentType = 'MEDIA';
          mediaRef =
            message.image?.id ??
            message.document?.id ??
            message.audio?.id ??
            message.video?.id;
        }

        events.push({
          channelAccount: opts.channelAccount,
          content: {
            contentType,
            ...(mediaRef ? { mediaRef } : {}),
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
          tenantId: opts.tenantId,
        });
      }
    }
  }
  return events;
}

function buildGraphApiPayload(message: OutboundMessage): Record<string, unknown> {
  const to = message.externalUserId;

  if (message.content.contentType === 'TEXT') {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: message.content.text ?? '' },
    };
  }

  if (message.content.contentType === 'TEMPLATE') {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: message.content.templateKey ?? 'hello_world',
        language: { code: 'en' },
      },
    };
  }

  if (message.content.contentType === 'MEDIA' && message.content.mediaRef) {
    // Treat mediaRef as a publicly accessible URL for simplicity.
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: {
        link: message.content.mediaRef,
        caption: message.content.text,
      },
    };
  }

  // Fallback: text message.
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: message.content.text ?? '' },
  };
}

function classifyGraphApiError(statusCode: number): {
  category: 'AUTH' | 'RATE_LIMIT' | 'TRANSIENT' | 'VALIDATION' | 'UNKNOWN_RESULT';
  retryable: boolean;
  retryAfterMs?: number;
} {
  switch (statusCode) {
    case 401:
    case 403:
      return { category: 'AUTH', retryable: false };
    case 429:
      return { category: 'RATE_LIMIT', retryable: true, retryAfterMs: 60_000 };
    case 500:
    case 502:
    case 503:
    case 504:
      return { category: 'TRANSIENT', retryable: true, retryAfterMs: 5_000 };
    default:
      return { category: 'VALIDATION', retryable: false };
  }
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

/**
 * Production-ready Meta Cloud API WhatsApp adapter.
 *
 * - **sendMessage** calls the Graph API when `WHATSAPP_ACCESS_TOKEN` is set;
 *   otherwise falls back to a dry-run sandbox result.
 * - **normalizeWebhook** parses real Meta webhook JSON and verifies the
 *   `X-Hub-Signature-256` HMAC when `WHATSAPP_APP_SECRET` is set.
 */
export function createWhatsAppMetaAdapter(
  options: WhatsAppMetaAdapterOptions,
): ChannelAdapter {
  const opts = resolveOptions(options);
  const isProduction = Boolean(opts.accessToken);

  return {
    connectorKey: 'whatsapp-meta',

    // -- Capabilities -------------------------------------------------------

    async discoverCapabilities(): Promise<CapabilityManifest> {
      return {
        capabilities: {
          delivery_status: true,
          mark_read: true,
          receive_media: true,
          receive_text: true,
          send_media: isProduction,
          send_template: true,
          send_text: true,
        },
        connectorKey: 'whatsapp-meta',
        limits: { messagesPerSecond: 20 },
        riskClass: 'META_DIRECT',
        slaClass: isProduction ? 'STAGING' : 'SYNTHETIC',
        version: '1',
      };
    },

    // -- Health -------------------------------------------------------------

    async healthCheck(): Promise<HealthCheck> {
      if (!isProduction) {
        return { healthy: true, reason: 'sandbox (no WHATSAPP_ACCESS_TOKEN)' };
      }
      // Lightweight: verify the token by calling the debug endpoint.
      try {
        const url = `${opts.graphApiBaseUrl}/debug_token?input_token=${opts.accessToken}`;
        const res = await fetch(url);
        if (!res.ok) {
          return { healthy: false, reason: `debug_token returned ${res.status}` };
        }
        return { healthy: true, reason: 'token valid' };
      } catch (err) {
        return {
          healthy: false,
          reason: `health check failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },

    // -- Webhook normalisation ----------------------------------------------

    async normalizeWebhook({ raw, signature }) {
      // 1. Signature verification.
      const verification = verifyWebhookSignature(raw, signature, opts.appSecret);
      if (!verification.verified) {
        return { events: [], verification };
      }

      // 2. Parse JSON.
      let body: MetaWebhookPayload;
      try {
        const text = new TextDecoder().decode(raw);
        body = JSON.parse(text) as MetaWebhookPayload;
      } catch {
        return {
          events: [],
          verification: { reason: 'invalid JSON', verified: false },
        };
      }

      // 3. Extract messages.
      const events = parseMetaMessages(body, opts);
      if (events.length === 0) {
        return {
          events: [],
          verification: { reason: 'no messages in webhook', verified: false },
        };
      }
      return { events, verification: { verified: true } };
    },

    // -- Outbound -----------------------------------------------------------

    async sendMessage(message: OutboundMessage): Promise<ConnectorResult> {
      // Sandbox fallback when no token is configured.
      if (!isProduction) {
        return {
          externalId: `wamid.sandbox.${message.idempotencyKey}.${randomUUID().slice(0, 8)}`,
          retryable: false,
          success: true,
          usage: { outboundMessages: 1 },
        };
      }

      const url = `${opts.graphApiBaseUrl}/${opts.phoneNumberId}/messages`;
      const payload = buildGraphApiPayload(message);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${opts.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          let errorBody: GraphApiError | undefined;
          try {
            errorBody = (await res.json()) as GraphApiError;
          } catch {
            // Response wasn't JSON — that's fine, we have the status code.
          }
          const classification = classifyGraphApiError(res.status);
          return {
            category: classification.category,
            diagnosticRef: errorBody?.error?.fbtrace_id,
            errorCode: String(errorBody?.error?.code ?? res.status),
            retryable: classification.retryable,
            retryAfterMs: classification.retryAfterMs,
            success: false,
            usage: { outboundMessages: 0 },
          };
        }

        const data = (await res.json()) as GraphApiSendResponse;
        const externalId = data.messages?.[0]?.id ?? `wamid.${randomUUID()}`;
        return {
          externalId,
          retryable: false,
          success: true,
          usage: { outboundMessages: 1 },
        };
      } catch (err) {
        // Network error — treat as transient.
        return {
          category: 'TRANSIENT',
          retryable: true,
          retryAfterMs: 5_000,
          success: false,
          usage: { outboundMessages: 0 },
          diagnosticRef: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
