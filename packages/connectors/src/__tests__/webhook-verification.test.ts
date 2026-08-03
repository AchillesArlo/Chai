import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WEBHOOK_REPLAY_WINDOW_SECONDS,
  verifyWebhookTimestamp,
} from '../webhook-verification';

describe('verifyWebhookTimestamp', () => {
  const now = new Date('2026-01-01T12:00:00.000Z');

  it('accepts a timestamp at exactly now', () => {
    expect(verifyWebhookTimestamp(now, now).ok).toBe(true);
  });

  it('accepts a timestamp within the window in the past', () => {
    const eventAt = new Date(now.getTime() - 60_000);
    expect(verifyWebhookTimestamp(eventAt, now).ok).toBe(true);
  });

  it('accepts a timestamp within the window in the future (clock skew tolerance)', () => {
    const eventAt = new Date(now.getTime() + 60_000);
    expect(verifyWebhookTimestamp(eventAt, now).ok).toBe(true);
  });

  it('rejects a timestamp older than the window', () => {
    const eventAt = new Date(
      now.getTime() - (DEFAULT_WEBHOOK_REPLAY_WINDOW_SECONDS + 1) * 1000,
    );
    const result = verifyWebhookTimestamp(eventAt, now);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('TOO_OLD');
  });

  it('rejects a timestamp further in the future than the window', () => {
    const eventAt = new Date(
      now.getTime() + (DEFAULT_WEBHOOK_REPLAY_WINDOW_SECONDS + 1) * 1000,
    );
    const result = verifyWebhookTimestamp(eventAt, now);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('TOO_FAR_IN_FUTURE');
  });

  it('rejects a null timestamp', () => {
    const result = verifyWebhookTimestamp(null, now);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('MISSING_TIMESTAMP');
  });

  it('rejects an invalid Date', () => {
    const result = verifyWebhookTimestamp(new Date('not-a-date'), now);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('MISSING_TIMESTAMP');
  });

  it('respects a custom window', () => {
    const eventAt = new Date(now.getTime() - 30_000);
    expect(verifyWebhookTimestamp(eventAt, now, 10).ok).toBe(false);
    expect(verifyWebhookTimestamp(eventAt, now, 60).ok).toBe(true);
  });
});
