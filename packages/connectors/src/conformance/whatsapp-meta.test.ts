import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createWhatsAppMetaSandboxAdapter } from '../connectors/whatsapp-meta-sandbox';
import { runChannelConformance } from './index';

const TENANT = '01890f47-9b3c-7cc2-98e8-123456789203';
const ACCOUNT = '01890f47-9b3c-7cc2-98e8-12345678930a';

describe('whatsapp-meta sandbox conformance', () => {
  it('satisfies the canonical channel adapter contract', async () => {
    const adapter = createWhatsAppMetaSandboxAdapter({
      channelAccount: ACCOUNT,
      tenantId: TENANT,
    });
    const report = await runChannelConformance(adapter);
    expect(report.passed).toBe(true);
    expect(report.failures).toEqual([]);
  });

  it('normalizes a Meta Cloud API messages webhook', async () => {
    const adapter = createWhatsAppMetaSandboxAdapter({
      channelAccount: ACCOUNT,
      phoneNumberId: '123456',
      tenantId: TENANT,
    });
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: '123456' },
                messages: [
                  {
                    from: '628123456789',
                    id: 'wamid.ABC123',
                    timestamp: '1720000000',
                    type: 'text',
                    text: { body: 'Halo jadwal' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const { events, verification } = await adapter.normalizeWebhook({
      raw: new TextEncoder().encode(payload),
    });
    expect(verification.verified).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]?.externalUserId).toBe('628123456789');
    expect(events[0]?.externalEventId).toBe('wamid.ABC123');
    expect(events[0]?.content.text).toBe('Halo jadwal');
    expect(events[0]?.provider).toBe('whatsapp-meta');
    expect(events[0]?.tenantId).toBe(TENANT);
  });

  it('rejects bad HMAC when app secret is configured', async () => {
    const secret = 'test-app-secret';
    const adapter = createWhatsAppMetaSandboxAdapter({
      appSecret: secret,
      channelAccount: ACCOUNT,
      tenantId: TENANT,
    });
    const raw = new TextEncoder().encode(
      JSON.stringify({
        data: {
          external_event_id: 'e1',
          external_user_id: 'u1',
          text: 'x',
        },
      }),
    );
    const bad = await adapter.normalizeWebhook({
      raw,
      signature: 'sha256=deadbeef',
    });
    expect(bad.verification.verified).toBe(false);

    const goodSig =
      'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
    const good = await adapter.normalizeWebhook({ raw, signature: goodSig });
    expect(good.verification.verified).toBe(true);
    expect(good.events).toHaveLength(1);
  });

  it('reports META_DIRECT risk class', async () => {
    const adapter = createWhatsAppMetaSandboxAdapter({
      channelAccount: ACCOUNT,
      tenantId: TENANT,
    });
    const manifest = await adapter.discoverCapabilities();
    expect(manifest.riskClass).toBe('META_DIRECT');
    expect(manifest.slaClass).toBe('STAGING');
    expect(manifest.connectorKey).toBe('whatsapp-meta');
  });
});
