import { describe, expect, it } from 'vitest';

import { createMockChannelAdapter } from '../connectors/mock-channel';
import { runChannelConformance } from './index';

describe('mock channel conformance', () => {
  it('satisfies the canonical channel adapter contract', async () => {
    const adapter = createMockChannelAdapter({
      channelAccount: 'mock-account-a',
      provider: 'mock-channel',
      tenantId: '01890f47-9b3c-7cc2-98e8-123456789207',
    });

    const report = await runChannelConformance(adapter);

    expect(report.passed).toBe(true);
    expect(report.failures).toEqual([]);
  });

  it('reports the connector key and capability manifest', async () => {
    const adapter = createMockChannelAdapter({
      channelAccount: 'mock-account-a',
      provider: 'mock-channel',
      tenantId: '01890f47-9b3c-7cc2-98e8-123456789207',
    });

    const manifest = await adapter.discoverCapabilities();

    expect(adapter.connectorKey).toBe('mock-channel');
    expect(manifest.connectorKey).toBe('mock-channel');
    expect(manifest.capabilities.receive_text).toBe(true);
    expect(manifest.capabilities.send_text).toBe(true);
    expect(manifest.riskClass).toBe('SYNTHETIC');
    expect(manifest.slaClass).toBe('SYNTHETIC');
  });

  it('normalizes an inbound webhook into canonical events', async () => {
    const adapter = createMockChannelAdapter({
      channelAccount: 'mock-account-a',
      provider: 'mock-channel',
      tenantId: '01890f47-9b3c-7cc2-98e8-123456789207',
    });

    const payload = JSON.stringify({
      data: {
        external_event_id: 'evt-1',
        external_message_id: 'msg-1',
        external_user_id: 'user-1',
        text: 'Hello',
      },
    });

    const { events, verification } = await adapter.normalizeWebhook({
      raw: new TextEncoder().encode(payload),
    });

    expect(verification.verified).toBe(true);
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event?.externalEventId).toBe('evt-1');
    expect(event?.externalMessageId).toBe('msg-1');
    expect(event?.externalUserId).toBe('user-1');
    expect(event?.content.text).toBe('Hello');
    expect(event?.direction).toBe('INBOUND');
    expect(event?.tenantId).toBe('01890f47-9b3c-7cc2-98e8-123456789207');
  });

  it('delivers an outbound message and returns a reconcilable result', async () => {
    const adapter = createMockChannelAdapter({
      channelAccount: 'mock-account-a',
      provider: 'mock-channel',
      tenantId: '01890f47-9b3c-7cc2-98e8-123456789207',
    });

    const result = await adapter.sendMessage({
      channelAccount: 'mock-account-a',
      content: { contentType: 'TEXT', text: 'Hi there' },
      externalUserId: 'user-1',
      idempotencyKey: 'idem-1',
      provider: 'mock-channel',
      tenantId: '01890f47-9b3c-7cc2-98e8-123456789207',
    });

    expect(result.success).toBe(true);
    expect(result.externalId).toBeTruthy();
    expect(result.retryable).toBe(false);
  });
});
