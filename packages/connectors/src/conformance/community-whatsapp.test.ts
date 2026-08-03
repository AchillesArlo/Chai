import { describe, expect, it } from 'vitest';

import {
  COMMUNITY_WHATSAPP_PROVIDER,
  createCommunityWhatsAppAdapter,
  type CommunityTransport,
} from '../connectors/community-whatsapp';
import { runChannelConformance } from './index';

const TENANT_A = '01890f47-9b3c-7cc2-98e8-1234567890a1';
const TENANT_B = '01890f47-9b3c-7cc2-98e8-1234567890b2';
const ACCOUNT = '01890f47-9b3c-7cc2-98e8-1234567890c3';

function baseOutbound(tenantId: string, idempotencyKey: string) {
  return {
    channelAccount: ACCOUNT,
    content: { contentType: 'TEXT' as const, text: 'halo' },
    externalUserId: '628123456789',
    idempotencyKey,
    provider: COMMUNITY_WHATSAPP_PROVIDER,
    tenantId,
  };
}

describe('community-whatsapp conformance', () => {
  it('satisfies the canonical channel adapter contract', async () => {
    const adapter = createCommunityWhatsAppAdapter({ channelAccount: ACCOUNT, tenantId: TENANT_A });
    const report = await runChannelConformance(adapter);
    expect(report.passed).toBe(true);
    expect(report.failures).toEqual([]);
  });

  it('reports COMMUNITY risk class and a non-production SLA class', async () => {
    const adapter = createCommunityWhatsAppAdapter({ channelAccount: ACCOUNT, tenantId: TENANT_A });
    const manifest = await adapter.discoverCapabilities();
    expect(manifest.riskClass).toBe('COMMUNITY');
    expect(manifest.slaClass).not.toBe('PRODUCTION');
    expect(manifest.connectorKey).toBe(COMMUNITY_WHATSAPP_PROVIDER);
    // Never blend with the official Meta path.
    expect(manifest.connectorKey).not.toBe('whatsapp-meta');
  });

  it('normalizes a WAHA WhatsApp Web message webhook', async () => {
    const adapter = createCommunityWhatsAppAdapter({ channelAccount: ACCOUNT, tenantId: TENANT_A });
    const raw = new TextEncoder().encode(
      JSON.stringify({
        event: 'message',
        session: 'community-a',
        payload: { body: 'Halo komunitas', from: '628123456789', id: 'waha.msg.1', timestamp: 1720000000 },
      }),
    );
    const { events, verification } = await adapter.normalizeWebhook({ raw });
    expect(verification.verified).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]?.provider).toBe(COMMUNITY_WHATSAPP_PROVIDER);
    expect(events[0]?.externalUserId).toBe('628123456789');
    expect(events[0]?.content.text).toBe('Halo komunitas');
    expect(events[0]?.tenantId).toBe(TENANT_A);
  });

  it('is idempotent: a duplicate submit never sends twice', async () => {
    const adapter = createCommunityWhatsAppAdapter({ channelAccount: ACCOUNT, tenantId: TENANT_A });
    const first = await adapter.sendMessage(baseOutbound(TENANT_A, 'idem-1'));
    const second = await adapter.sendMessage(baseOutbound(TENANT_A, 'idem-1'));
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.externalId).toBe(first.externalId);
    expect(first.usage?.outboundMessages).toBe(1);
    expect(second.usage?.outboundMessages).toBe(0);
  });

  it('returns UNKNOWN_RESULT on a timeout after submit and reconciles later', async () => {
    const transport: CommunityTransport = {
      async send() {
        return { outcome: 'timeout' };
      },
      async status() {
        return 'DELIVERED';
      },
    };
    const adapter = createCommunityWhatsAppAdapter({ channelAccount: ACCOUNT, tenantId: TENANT_A, transport });
    const result = await adapter.sendMessage(baseOutbound(TENANT_A, 'idem-timeout'));
    expect(result.success).toBe(false);
    expect(result.category).toBe('UNKNOWN_RESULT');
    expect(result.retryable).toBe(true);
    // Reconciliation resolves the uncertain result out of band.
    await expect(adapter.reconcile('idem-timeout')).resolves.toBe('DELIVERED');
  });

  it('reconciles a successfully-sent message as DELIVERED', async () => {
    const adapter = createCommunityWhatsAppAdapter({ channelAccount: ACCOUNT, tenantId: TENANT_A });
    await adapter.sendMessage(baseOutbound(TENANT_A, 'idem-ok'));
    await expect(adapter.reconcile('idem-ok')).resolves.toBe('DELIVERED');
  });

  it('keeps inbound events tenant-scoped (no cross-tenant leakage)', async () => {
    const adapterA = createCommunityWhatsAppAdapter({ channelAccount: ACCOUNT, tenantId: TENANT_A });
    const adapterB = createCommunityWhatsAppAdapter({ channelAccount: ACCOUNT, tenantId: TENANT_B });
    const raw = new TextEncoder().encode(
      JSON.stringify({ event: 'message', payload: { body: 'x', from: '628999', id: 'waha.iso.1' } }),
    );
    const a = await adapterA.normalizeWebhook({ raw });
    const b = await adapterB.normalizeWebhook({ raw });
    expect(a.events[0]?.tenantId).toBe(TENANT_A);
    expect(b.events[0]?.tenantId).toBe(TENANT_B);
    // A duplicate idempotency key in tenant A does not affect tenant B's ledger.
    await adapterA.sendMessage(baseOutbound(TENANT_A, 'shared-key'));
    const bSend = await adapterB.sendMessage(baseOutbound(TENANT_B, 'shared-key'));
    expect(bSend.usage?.outboundMessages).toBe(1);
  });
});
