import { describe, it, expect } from 'vitest';

import {
  createCalendarAdapterFactory,
  createChannelAdapterFactory,
  createConnectorRegistry,
  createPaymentAdapterFactory,
  createShippingAdapterFactory,
  PROVIDER_ENV_VARS,
  resolveProvider,
} from '../factory';

describe('factory: resolveProvider', () => {
  it('defaults to mock when env var is absent', () => {
    expect(resolveProvider('payment', {})).toBe('mock');
    expect(resolveProvider('channel', {})).toBe('mock');
    expect(resolveProvider('logistics', {})).toBe('mock');
    expect(resolveProvider('calendar', {})).toBe('mock');
  });

  it('reads provider from env var', () => {
    expect(resolveProvider('payment', { PROVIDER_PAYMENT: 'midtrans' })).toBe('midtrans');
    expect(resolveProvider('channel', { PROVIDER_CHANNEL: 'whatsapp-meta' })).toBe('whatsapp-meta');
    expect(resolveProvider('logistics', { PROVIDER_LOGISTICS: 'jne' })).toBe('jne');
    expect(resolveProvider('calendar', { PROVIDER_CALENDAR: 'google-calendar' })).toBe('google-calendar');
  });

  it('normalizes provider to lowercase', () => {
    expect(resolveProvider('payment', { PROVIDER_PAYMENT: 'MIDTRANS' })).toBe('midtrans');
  });

  it('exposes correct env var names', () => {
    expect(PROVIDER_ENV_VARS.payment).toBe('PROVIDER_PAYMENT');
    expect(PROVIDER_ENV_VARS.channel).toBe('PROVIDER_CHANNEL');
    expect(PROVIDER_ENV_VARS.logistics).toBe('PROVIDER_LOGISTICS');
    expect(PROVIDER_ENV_VARS.calendar).toBe('PROVIDER_CALENDAR');
  });
});

describe('factory: createPaymentAdapterFactory', () => {
  it('creates mock adapter by default', () => {
    const adapter = createPaymentAdapterFactory({ env: {} });
    expect(adapter).toBeDefined();
    expect(typeof adapter).toBe('object');
  });

  it('creates midtrans adapter when configured', () => {
    const adapter = createPaymentAdapterFactory({
      env: {
        PROVIDER_PAYMENT: 'midtrans',
        MIDTRANS_SERVER_KEY: 'test-key',
        MIDTRANS_CLIENT_KEY: 'test-client',
      },
    });
    expect(adapter).toBeDefined();
  });
});

describe('factory: createChannelAdapterFactory', () => {
  it('creates mock adapter by default', () => {
    const adapter = createChannelAdapterFactory({ env: {} });
    expect(adapter).not.toBeNull();
    expect(typeof adapter?.sendMessage).toBe('function');
  });

  it('creates whatsapp-meta adapter when configured', () => {
    const adapter = createChannelAdapterFactory({
      env: {
        PROVIDER_CHANNEL: 'whatsapp-meta',
        WHATSAPP_ACCESS_TOKEN: 'token',
        WHATSAPP_PHONE_NUMBER_ID: '123',
        WHATSAPP_APP_SECRET: 'secret',
      },
      channelAccount: 'acct-1',
      tenantId: 'tenant-1',
    });
    expect(adapter).not.toBeNull();
    expect(adapter?.connectorKey).toBe('whatsapp-meta');
  });
});

describe('factory: createShippingAdapterFactory', () => {
  it('creates mock adapter by default', () => {
    const adapter = createShippingAdapterFactory({ env: {} });
    expect(adapter).toBeDefined();
    expect(typeof adapter).toBe('object');
  });

  it('creates jne adapter when configured', () => {
    const adapter = createShippingAdapterFactory({
      env: {
        PROVIDER_LOGISTICS: 'jne',
        JNE_API_KEY: 'key',
        JNE_USERNAME: 'user',
        JNE_ORIGIN: 'CGK10000',
      },
    });
    expect(adapter).toBeDefined();
  });
});

describe('factory: createCalendarAdapterFactory', () => {
  it('creates mock adapter by default', () => {
    const adapter = createCalendarAdapterFactory({ env: {} });
    expect(adapter).toBeDefined();
    expect(typeof adapter.listAvailability).toBe('function');
  });

  it('creates google-calendar adapter when configured', () => {
    const adapter = createCalendarAdapterFactory({
      env: {
        PROVIDER_CALENDAR: 'google-calendar',
        GOOGLE_CALENDAR_ID: 'test@example.com',
      },
    });
    expect(adapter).toBeDefined();
    expect(typeof adapter.listAvailability).toBe('function');
  });
});

describe('factory: createConnectorRegistry', () => {
  it('builds registry with all adapters', () => {
    const registry = createConnectorRegistry({ env: {} });
    expect(registry.payment).toBeDefined();
    expect(registry.channel).not.toBeNull();
    expect(registry.logistics).toBeDefined();
    expect(registry.calendar).toBeDefined();
  });

  it('all adapters are objects/functions', () => {
    const registry = createConnectorRegistry({ env: {} });
    expect(typeof registry.payment).toBe('object');
    expect(typeof registry.channel).toBe('object');
    expect(typeof registry.logistics).toBe('object');
    expect(typeof registry.calendar).toBe('object');
    expect(typeof registry.calendar.listAvailability).toBe('function');
  });
});
