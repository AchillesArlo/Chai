import { describe, expect, it } from 'vitest';

import {
  assertNotificationConsent,
  decideNotificationConsent,
  type NotificationConsentContext,
} from './notification-consent';

const BASE: NotificationConsentContext = {
  targetChannel: 'WHATSAPP',
  configuredChannels: ['WHATSAPP', 'EMAIL'],
  consents: [
    { channel: 'WHATSAPP', consented: true },
    { channel: 'EMAIL', consented: false },
  ],
};

describe('decideNotificationConsent', () => {
  it('ALLOWs a configured channel the contact consented to', () => {
    expect(decideNotificationConsent(BASE)).toEqual({ kind: 'ALLOW' });
  });

  it('BLOCKs a channel the tenant has not configured', () => {
    expect(
      decideNotificationConsent({ ...BASE, targetChannel: 'SMS' }),
    ).toEqual({ kind: 'BLOCK', reason: 'CHANNEL_NOT_CONFIGURED' });
  });

  it('BLOCKs a configured channel the contact opted out of', () => {
    expect(
      decideNotificationConsent({ ...BASE, targetChannel: 'EMAIL' }),
    ).toEqual({ kind: 'BLOCK', reason: 'NO_CONSENT' });
  });

  it('BLOCKs when there is no consent record at all (fails closed)', () => {
    expect(
      decideNotificationConsent({
        targetChannel: 'WHATSAPP',
        configuredChannels: ['WHATSAPP'],
        consents: [],
      }),
    ).toEqual({ kind: 'BLOCK', reason: 'NO_CONSENT' });
  });
});

describe('assertNotificationConsent', () => {
  it('passes silently when allowed', () => {
    expect(() => assertNotificationConsent(BASE)).not.toThrow();
  });

  it('throws a typed reason when blocked', () => {
    expect(() =>
      assertNotificationConsent({ ...BASE, targetChannel: 'EMAIL' }),
    ).toThrow(/NOTIFICATION_BLOCKED:NO_CONSENT/);
    expect(() =>
      assertNotificationConsent({ ...BASE, targetChannel: 'SMS' }),
    ).toThrow(/NOTIFICATION_BLOCKED:CHANNEL_NOT_CONFIGURED/);
  });
});
