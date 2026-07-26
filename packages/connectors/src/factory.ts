import type {
  CalendarAdapter,
  ChannelAdapter,
} from '@chai/connector-sdk';

import { createAnthropicAdapter, type AnthropicAdapter } from './connectors/anthropic/index.js';
import { createGoogleCalendarAdapter } from './connectors/google-calendar/index.js';
import { createJneAdapter, type JneAdapter } from './connectors/jne/index.js';
import { createMidtransAdapter, type MidtransAdapter } from './connectors/midtrans/index.js';
import { createMockAiAdapter, type MockAiAdapter } from './connectors/mock-ai/index.js';
import { createMockCalendarAdapter } from './connectors/mock-calendar/index.js';
import { createMockChannelAdapter } from './connectors/mock-channel/index.js';
import { createMockPaymentAdapter } from './connectors/mock-payment/index.js';
import { createMockShippingAdapter } from './connectors/mock-shipping/index.js';
import { createOpenAiAdapter, type OpenAiAdapter } from './connectors/openai/index.js';
import { createWhatsAppMetaAdapter } from './connectors/whatsapp-meta/index.js';

// ponytail: env-based adapter factory — reads PROVIDER_* env vars and wires the right connector.
// Each provider falls back to its mock when credentials are absent, so local dev and CI work.

/**
 * Supported provider types in the platform.
 */
export type ProviderType = 'payment' | 'channel' | 'logistics' | 'calendar' | 'ai';

/**
 * Environment variable names that drive provider selection.
 */
export const PROVIDER_ENV_VARS = {
  ai: 'PROVIDER_AI',
  calendar: 'PROVIDER_CALENDAR',
  channel: 'PROVIDER_CHANNEL',
  logistics: 'PROVIDER_LOGISTICS',
  payment: 'PROVIDER_PAYMENT',
} as const;

/**
 * Payment adapter type: union of mock and real adapter return types.
 * Mock and real adapters have different method shapes — consumers branch on the active provider.
 */
export type PaymentAdapter = ReturnType<typeof createMockPaymentAdapter> | MidtransAdapter;

/**
 * Shipping adapter type: union of mock and real adapter return types.
 */
export type ShippingAdapter = ReturnType<typeof createMockShippingAdapter> | JneAdapter;

/**
 * AI adapter type: union of mock, OpenAI, and Anthropic adapter return types.
 */
export type AiAdapter = MockAiAdapter | OpenAiAdapter | AnthropicAdapter;

/**
 * Resolve a provider from env var, falling back to 'mock'.
 */
export function resolveProvider(type: ProviderType, env: NodeJS.ProcessEnv = process.env): string {
  const key = PROVIDER_ENV_VARS[type];
  return (env[key] ?? 'mock').toLowerCase();
}

/**
 * Factory options for all connector types.
 */
export interface FactoryOptions {
  env?: NodeJS.ProcessEnv;
  tenantId?: string;
  channelAccount?: string;
}

// ---------------------------------------------------------------------------
// Payment factory
// ---------------------------------------------------------------------------

/**
 * Create a payment adapter based on PROVIDER_PAYMENT env var.
 */
export function createPaymentAdapterFactory(options: FactoryOptions = {}): PaymentAdapter {
  const env = options.env ?? process.env;
  const provider = resolveProvider('payment', env);

  switch (provider) {
    case 'midtrans':
      return createMidtransAdapter({
        clientKey: env.MIDTRANS_CLIENT_KEY,
        sandbox: env.MIDTRANS_ENV !== 'production',
        serverKey: env.MIDTRANS_SERVER_KEY,
      });
    case 'mock':
    default:
      return createMockPaymentAdapter();
  }
}

// ---------------------------------------------------------------------------
// Channel factory
// ---------------------------------------------------------------------------

/**
 * Create a channel adapter based on PROVIDER_CHANNEL env var.
 */
export function createChannelAdapterFactory(options: FactoryOptions = {}): ChannelAdapter | null {
  const env = options.env ?? process.env;
  const provider = resolveProvider('channel', env);
  const tenantId = options.tenantId ?? env.API_TENANT_ID ?? 'default';
  const channelAccount = options.channelAccount ?? env.API_CHANNEL_ACCOUNT_ID ?? 'default';

  switch (provider) {
    case 'whatsapp-meta':
      return createWhatsAppMetaAdapter({
        accessToken: env.WHATSAPP_ACCESS_TOKEN,
        appSecret: env.WHATSAPP_APP_SECRET,
        channelAccount,
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? '',
        tenantId,
      });
    case 'mock':
    default:
      return createMockChannelAdapter({
        channelAccount,
        provider: 'mock',
        tenantId,
      });
  }
}

// ---------------------------------------------------------------------------
// Logistics factory
// ---------------------------------------------------------------------------

/**
 * Create a shipping adapter based on PROVIDER_LOGISTICS env var.
 */
export function createShippingAdapterFactory(options: FactoryOptions = {}): ShippingAdapter {
  const env = options.env ?? process.env;
  const provider = resolveProvider('logistics', env);

  switch (provider) {
    case 'jne':
      return createJneAdapter({
        apiKey: env.JNE_API_KEY,
        origin: env.JNE_ORIGIN,
        username: env.JNE_USERNAME,
      });
    case 'mock':
    default:
      return createMockShippingAdapter();
  }
}

// ---------------------------------------------------------------------------
// Calendar factory
// ---------------------------------------------------------------------------

/**
 * Create a calendar adapter based on PROVIDER_CALENDAR env var.
 */
export function createCalendarAdapterFactory(options: FactoryOptions = {}): CalendarAdapter {
  const env = options.env ?? process.env;
  const provider = resolveProvider('calendar', env);

  switch (provider) {
    case 'google-calendar':
      return createGoogleCalendarAdapter({
        calendarApiBaseUrl: env.GOOGLE_CALENDAR_API_BASE_URL,
        defaultCalendarId: env.GOOGLE_CALENDAR_ID,
        tenantIdHint: options.tenantId,
      });
    case 'mock':
    default:
      return createMockCalendarAdapter();
  }
}

// ---------------------------------------------------------------------------
// AI factory
// ---------------------------------------------------------------------------

/**
 * Create an AI adapter based on PROVIDER_AI env var.
 * Supported: 'mock' (default), 'openai', 'anthropic'.
 */
export function createAiAdapterFactory(options: FactoryOptions = {}): AiAdapter {
  const env = options.env ?? process.env;
  const provider = resolveProvider('ai', env);

  switch (provider) {
    case 'openai':
      return createOpenAiAdapter({
        apiKey: env.OPENAI_API_KEY,
        baseUrl: env.OPENAI_BASE_URL,
        defaultModel: env.OPENAI_DEFAULT_MODEL,
        organization: env.OPENAI_ORGANIZATION,
      });
    case 'anthropic':
      return createAnthropicAdapter({
        apiKey: env.ANTHROPIC_API_KEY,
        baseUrl: env.ANTHROPIC_BASE_URL,
        defaultModel: env.ANTHROPIC_DEFAULT_MODEL,
      });
    case 'mock':
    default:
      return createMockAiAdapter();
  }
}

// ---------------------------------------------------------------------------
// Convenience: resolve all providers at once
// ---------------------------------------------------------------------------

export interface ConnectorRegistry {
  ai: AiAdapter;
  calendar: CalendarAdapter;
  channel: ChannelAdapter | null;
  logistics: ShippingAdapter;
  payment: PaymentAdapter;
}

/**
 * Build the full connector registry from environment variables.
 */
export function createConnectorRegistry(options: FactoryOptions = {}): ConnectorRegistry {
  return {
    ai: createAiAdapterFactory(options),
    calendar: createCalendarAdapterFactory(options),
    channel: createChannelAdapterFactory(options),
    logistics: createShippingAdapterFactory(options),
    payment: createPaymentAdapterFactory(options),
  };
}
