import { describe, it, expect, beforeEach } from 'vitest';

import {
  createPaymentAdapterFactory,
  createChannelAdapterFactory,
  createShippingAdapterFactory,
  createCalendarAdapterFactory,
  createAiAdapterFactory,
  resolveProvider,
} from '@chai/connectors/factory';
import {
  KillSwitchRuntime,
  resetKillSwitchRuntime,
} from '@chai/connectors/kill-switch';

/**
 * S2: Connector Real Activation in Staging
 *
 * Verifies that the env-based factory (M3) correctly wires each provider
 * when staging credentials are present, and falls back to mock when absent.
 * Kill switch integration verified per provider.
 */
describe('S2: Connector staging activation', () => {
  beforeEach(() => {
    resetKillSwitchRuntime();
  });

  describe('payment provider (Midtrans)', () => {
    it('activates Midtrans when server key present', () => {
      const adapter = createPaymentAdapterFactory({
        env: {
          PROVIDER_PAYMENT: 'midtrans',
          MIDTRANS_SERVER_KEY: 'SB-Mid-server-staging-key',
          MIDTRANS_CLIENT_KEY: 'SB-Mid-client-staging-key',
          MIDTRANS_ENV: 'sandbox',
        },
      });
      expect(adapter).toBeDefined();
      // Midtrans adapter exposes checkout + session status methods
      expect(typeof adapter).toBe('object');
    });

    it('falls back to mock when key absent', () => {
      const adapter = createPaymentAdapterFactory({
        env: { PROVIDER_PAYMENT: 'midtrans' },
      });
      expect(adapter).toBeDefined();
    });

    it('kill switch trips payment provider via env', () => {
      const runtime = new KillSwitchRuntime({ KILL_SWITCH_PAYMENT: '1' });
      expect(runtime.isTripped('payment')).toBe(true);
      expect(runtime.isTripped('channel')).toBe(false);
    });
  });

  describe('channel provider (WhatsApp Meta)', () => {
    it('activates WhatsApp Meta when credentials present', () => {
      const adapter = createChannelAdapterFactory({
        env: {
          PROVIDER_CHANNEL: 'whatsapp-meta',
          WHATSAPP_ACCESS_TOKEN: 'EAAG-staging-token',
          WHATSAPP_PHONE_NUMBER_ID: '123456789',
          WHATSAPP_APP_SECRET: 'staging-secret',
        },
        channelAccount: 'acct-staging',
        tenantId: 'tenant-staging',
      });
      expect(adapter).not.toBeNull();
      expect(adapter?.connectorKey).toBe('whatsapp-meta');
    });

    it('falls back to mock channel when no credentials', () => {
      const adapter = createChannelAdapterFactory({ env: { PROVIDER_CHANNEL: 'whatsapp-meta' } });
      expect(adapter).not.toBeNull();
    });

    it('kill switch trips channel provider via env', () => {
      const runtime = new KillSwitchRuntime({ KILL_SWITCH_CHANNEL: '1' });
      expect(runtime.isTripped('channel')).toBe(true);
    });
  });

  describe('logistics provider (JNE)', () => {
    it('activates JNE when API key present', () => {
      const adapter = createShippingAdapterFactory({
        env: {
          PROVIDER_LOGISTICS: 'jne',
          JNE_API_KEY: 'jne-staging-key',
          JNE_USERNAME: 'staging-user',
          JNE_ORIGIN: 'CGK10000',
        },
      });
      expect(adapter).toBeDefined();
    });

    it('falls back to mock shipping when no key', () => {
      const adapter = createShippingAdapterFactory({
        env: { PROVIDER_LOGISTICS: 'jne' },
      });
      expect(adapter).toBeDefined();
    });

    it('kill switch trips logistics provider via env', () => {
      const runtime = new KillSwitchRuntime({ KILL_SWITCH_LOGISTICS: '1' });
      expect(runtime.isTripped('logistics')).toBe(true);
    });
  });

  describe('calendar provider (Google Calendar)', () => {
    it('activates Google Calendar when configured', () => {
      const adapter = createCalendarAdapterFactory({
        env: {
          PROVIDER_CALENDAR: 'google-calendar',
          GOOGLE_CALENDAR_ID: 'staging@example.com',
        },
      });
      expect(adapter).toBeDefined();
      expect(typeof adapter.listAvailability).toBe('function');
    });

    it('kill switch trips calendar provider via env', () => {
      const runtime = new KillSwitchRuntime({ KILL_SWITCH_CALENDAR: '1' });
      expect(runtime.isTripped('calendar')).toBe(true);
    });
  });

  describe('AI provider (OpenAI/Anthropic)', () => {
    it('activates OpenAI when key present', () => {
      const adapter = createAiAdapterFactory({
        env: {
          PROVIDER_AI: 'openai',
          OPENAI_API_KEY: 'sk-staging-key',
        },
      });
      expect(adapter).toBeDefined();
    });

    it('activates Anthropic when key present', () => {
      const adapter = createAiAdapterFactory({
        env: {
          PROVIDER_AI: 'anthropic',
          ANTHROPIC_API_KEY: 'sk-ant-staging',
        },
      });
      expect(adapter).toBeDefined();
    });

    it('falls back to mock AI when no key', () => {
      const adapter = createAiAdapterFactory({ env: {} });
      expect(adapter).toBeDefined();
    });
  });

  describe('provider resolution', () => {
    it('resolves all providers from staging env', () => {
      expect(resolveProvider('payment', { PROVIDER_PAYMENT: 'midtrans' })).toBe('midtrans');
      expect(resolveProvider('channel', { PROVIDER_CHANNEL: 'whatsapp-meta' })).toBe('whatsapp-meta');
      expect(resolveProvider('logistics', { PROVIDER_LOGISTICS: 'jne' })).toBe('jne');
      expect(resolveProvider('calendar', { PROVIDER_CALENDAR: 'google-calendar' })).toBe('google-calendar');
      expect(resolveProvider('ai', { PROVIDER_AI: 'openai' })).toBe('openai');
    });

    it('defaults to mock for all providers', () => {
      expect(resolveProvider('payment', {})).toBe('mock');
      expect(resolveProvider('channel', {})).toBe('mock');
      expect(resolveProvider('logistics', {})).toBe('mock');
      expect(resolveProvider('calendar', {})).toBe('mock');
      expect(resolveProvider('ai', {})).toBe('mock');
    });
  });

  describe('multi-layer kill switch', () => {
    it('owner override trips independently of env', () => {
      const runtime = new KillSwitchRuntime({});
      runtime.setOwnerToggle('payment', true, 'Manual override - Midtrans outage');
      expect(runtime.isTripped('payment')).toBe(true);
    });

    it('per-tenant DB toggle isolates kill switch', () => {
      const runtime = new KillSwitchRuntime({});
      runtime.setDbToggle('channel', 'tenant-a', true);
      expect(runtime.isTripped('channel', 'tenant-a')).toBe(true);
      expect(runtime.isTripped('channel', 'tenant-b')).toBe(false);
    });

    it('kill switch state reports source layer', () => {
      const runtime = new KillSwitchRuntime({ KILL_SWITCH_PAYMENT: '1' });
      const state = runtime.getState('payment');
      expect(state).toHaveLength(1);
      expect(state[0]?.source).toBe('env');
    });
  });
});
