import { describe, expect, it } from 'vitest';

import { redactInboxPayload } from './payload-store';

/**
 * FASE 29 core invariant: the raw provider event is redacted BEFORE it is
 * stored. redactInboxPayload is the exact transform recordInboxPayload feeds to
 * the INSERT, so proving it here proves no secret can reach the row — no
 * database required.
 */
describe('redactInboxPayload', () => {
  it('masks a credit card number pasted into the message body', () => {
    const { redacted } = redactInboxPayload({
      channelAccount: 'acct-1',
      content: {
        contentType: 'TEXT',
        text: 'Nomor kartu saya 4111 1111 1111 1111 tolong dibantu',
      },
      externalUserId: 'user-1',
      provider: 'mock-channel',
    });

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain('4111');
    expect(serialized).toContain('[REDACTED_CARD]');
  });

  it('masks structured financial secrets by field name (CVV/PIN/OTP/bank)', () => {
    const { redacted, redactions } = redactInboxPayload({
      bankAccount: '1234567890',
      cvv: '123',
      otp: '998877',
      pin: '4321',
      routingNumber: '021000021',
    });

    const serialized = JSON.stringify(redacted);
    // Short values (CVV/PIN) are invisible to value scanning, so field-name
    // masking is the only thing that catches them — assert every one is gone.
    expect(serialized).not.toContain('123');
    expect(serialized).not.toContain('4321');
    expect(serialized).not.toContain('998877');
    expect(serialized).not.toContain('1234567890');
    expect(serialized).not.toContain('021000021');
    expect(redactions).toBeGreaterThanOrEqual(5);
  });

  it('masks secrets nested inside the provider envelope', () => {
    const { redacted } = redactInboxPayload({
      data: {
        payment: { cardNumber: '5555444433332222', pin: '0000' },
      },
    });

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain('5555444433332222');
    expect(serialized).not.toContain('0000');
  });

  it('normalises Dates and keeps non-sensitive fields intact', () => {
    const { redacted } = redactInboxPayload({
      content: { contentType: 'TEXT', text: 'halo apa kabar' },
      providerTimestamp: new Date('2026-07-31T00:00:00.000Z'),
    });

    const content = redacted['content'] as { text?: string } | undefined;
    expect(content?.text).toBe('halo apa kabar');
    // A raw Date must survive as its ISO string, not be dropped to {}.
    expect(redacted['providerTimestamp']).toBe('2026-07-31T00:00:00.000Z');
  });
});
