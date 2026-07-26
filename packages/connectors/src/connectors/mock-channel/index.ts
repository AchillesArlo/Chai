import { randomUUID } from 'node:crypto';

import type {
  CapabilityManifest,
  ChannelAdapter,
  ConnectorResult,
  HealthCheck,
  InboundEvent,
  OutboundMessage,
} from '@chai/connector-sdk';

export interface MockChannelAdapterOptions {
  channelAccount: string;
  provider: string;
  tenantId: string;
}

interface MockWebhookData {
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

function parseWebhook(raw: Uint8Array): MockWebhookData {
  const text = new TextDecoder().decode(raw);
  return JSON.parse(text) as MockWebhookData;
}

/**
 * Deterministic, side-effect-free channel adapter used by the conformance suite,
 * the webhook simulator, and local development. No network, no secrets — every
 * operation returns canonical platform data so downstream slices (contacts,
 * conversations, dispatchers) can be exercised end-to-end in tests.
 */
export function createMockChannelAdapter(
  options: MockChannelAdapterOptions,
): ChannelAdapter {
  const { channelAccount, provider, tenantId } = options;

  return {
    connectorKey: provider,

    async discoverCapabilities(): Promise<CapabilityManifest> {
      return {
        capabilities: {
          delivery_status: true,
          mark_read: true,
          receive_media: true,
          receive_text: true,
          send_media: true,
          send_template: true,
          send_text: true,
        },
        connectorKey: provider,
        limits: { messagesPerSecond: 50 },
        riskClass: 'SYNTHETIC',
        slaClass: 'SYNTHETIC',
        version: '1',
      };
    },

    async healthCheck(): Promise<HealthCheck> {
      return { healthy: true };
    },

    async normalizeWebhook({ raw }) {
      const data = parseWebhook(raw).data;
      if (!data?.external_event_id || !data?.external_user_id) {
        return {
          events: [],
          verification: {
            reason: 'missing external_event_id or external_user_id',
            verified: false,
          },
        };
      }

      const contentType = data.media_ref ? 'MEDIA' : 'TEXT';
      const event: InboundEvent = {
        channelAccount,
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
        provider,
        providerTimestamp: data.timestamp
          ? new Date(data.timestamp)
          : new Date(),
        rawReference: `restricted://${provider}/${data.external_event_id}`,
        tenantId,
      };

      return { events: [event], verification: { verified: true } };
    },

    async sendMessage(message: OutboundMessage): Promise<ConnectorResult> {
      return {
        externalId: `${message.idempotencyKey}-${randomUUID()}`,
        retryable: false,
        success: true,
        usage: { outboundMessages: 1 },
      };
    },
  };
}
