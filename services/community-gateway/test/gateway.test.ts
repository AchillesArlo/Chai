import { describe, expect, it } from 'vitest';

import type { OutboundMessage } from '@chai/connector-sdk';
import { createCommunityWhatsAppAdapter } from '@chai/connectors/community-whatsapp';
import { KillSwitchRuntime } from '@chai/connectors/kill-switch';

import {
  ActivationDeniedError,
  COMMUNITY_CHANNEL_CAPABILITY,
  CommunityGateway,
  FeatureNotEnabledError,
  assertCommunityEntitled,
  authorizeCommunityActivation,
} from '../src/gateway';
import type { CommunityGatewayEvent } from '../src/types';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const ACCOUNT = 'acct-1';

const WAHA_RAW = new TextEncoder().encode(
  JSON.stringify({ event: 'message', payload: { body: 'hai', from: '628111', id: 'w1' } }),
);

function outbound(idempotencyKey: string, tenantId = TENANT_A): OutboundMessage {
  return {
    channelAccount: ACCOUNT,
    content: { contentType: 'TEXT', text: 'x' },
    externalUserId: '628111',
    idempotencyKey,
    provider: 'community-whatsapp',
    tenantId,
  };
}

function makeGateway() {
  const killSwitch = new KillSwitchRuntime({});
  const adapter = createCommunityWhatsAppAdapter({ channelAccount: ACCOUNT, tenantId: TENANT_A });
  const published: CommunityGatewayEvent[] = [];
  const gateway = new CommunityGateway({
    adapter,
    channelAccount: ACCOUNT,
    enabledCapabilities: [COMMUNITY_CHANNEL_CAPABILITY],
    killSwitch,
    publish: (event) => {
      published.push(event);
    },
    tenantId: TENANT_A,
  });
  return { adapter, gateway, killSwitch, published };
}

describe('community entitlement gate (prerequisite 1)', () => {
  it('throws FEATURE_NOT_ENABLED without the community_channel capability', () => {
    let caught: unknown;
    try {
      assertCommunityEntitled([]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(FeatureNotEnabledError);
    expect((caught as FeatureNotEnabledError).code).toBe('FEATURE_NOT_ENABLED');
    expect(() => assertCommunityEntitled([COMMUNITY_CHANNEL_CAPABILITY])).not.toThrow();
  });

  it('refuses to construct a gateway without the capability', () => {
    const killSwitch = new KillSwitchRuntime({});
    const adapter = createCommunityWhatsAppAdapter({ channelAccount: ACCOUNT, tenantId: TENANT_A });
    expect(
      () =>
        new CommunityGateway({
          adapter,
          channelAccount: ACCOUNT,
          enabledCapabilities: [],
          killSwitch,
          publish: () => {},
          tenantId: TENANT_A,
        }),
    ).toThrow(FeatureNotEnabledError);
  });
});

describe('owner-only activation (prerequisite 2)', () => {
  it('produces a cross-tenant audit record for a PLATFORM_OWNER with a reason', () => {
    const audit = authorizeCommunityActivation({
      actorId: 'owner-1',
      reason: 'Pilot komunitas untuk tenant',
      role: 'PLATFORM_OWNER',
      tenantId: TENANT_A,
    });
    expect(audit.isCrossTenant).toBe(true);
    expect(audit.reason).toBe('Pilot komunitas untuk tenant');
    expect(audit.riskClass).toBe('COMMUNITY');
    expect(audit.tenantId).toBe(TENANT_A);
    expect(audit.action).toBe('community_channel.activate');
  });

  it('rejects non-owners, missing reason, and missing tenant context', () => {
    expect(() =>
      authorizeCommunityActivation({ actorId: 'x', reason: 'r', role: 'CLIENT_OWNER', tenantId: TENANT_A }),
    ).toThrow(ActivationDeniedError);
    expect(() =>
      authorizeCommunityActivation({ actorId: 'x', reason: '   ', role: 'PLATFORM_OWNER', tenantId: TENANT_A }),
    ).toThrow(ActivationDeniedError);
    expect(() =>
      authorizeCommunityActivation({ actorId: 'x', reason: 'r', role: 'PLATFORM_OWNER', tenantId: '' }),
    ).toThrow(ActivationDeniedError);
  });
});

describe('event stamping (prerequisite 3)', () => {
  it('stamps riskClass COMMUNITY and a non-production slaClass on every event', async () => {
    const { gateway, published } = makeGateway();
    const events = await gateway.ingest(WAHA_RAW);
    expect(events).toHaveLength(1);
    expect(published).toHaveLength(1);
    for (const envelope of published) {
      expect(envelope.riskClass).toBe('COMMUNITY');
      expect(envelope.slaClass).not.toBe('PRODUCTION');
      expect(envelope.event.provider).toBe('community-whatsapp');
      expect(envelope.tenantId).toBe(TENANT_A);
    }
    expect(events[0]?.sequence).toBe(1);
  });
});

describe('kill switch + quarantine (prerequisite 5)', () => {
  it('stops this channel per tenant without touching the official channel or other tenants', async () => {
    const killSwitch = new KillSwitchRuntime({});
    const adapterA = createCommunityWhatsAppAdapter({ channelAccount: ACCOUNT, tenantId: TENANT_A });
    const publishedA: CommunityGatewayEvent[] = [];
    const gatewayA = new CommunityGateway({
      adapter: adapterA,
      channelAccount: ACCOUNT,
      enabledCapabilities: [COMMUNITY_CHANNEL_CAPABILITY],
      killSwitch,
      publish: (event) => {
        publishedA.push(event);
      },
      tenantId: TENANT_A,
    });
    const adapterB = createCommunityWhatsAppAdapter({ channelAccount: ACCOUNT, tenantId: TENANT_B });
    const gatewayB = new CommunityGateway({
      adapter: adapterB,
      channelAccount: ACCOUNT,
      enabledCapabilities: [COMMUNITY_CHANNEL_CAPABILITY],
      killSwitch,
      publish: () => {},
      tenantId: TENANT_B,
    });

    killSwitch.setDbToggle('community-channel', TENANT_A, true);

    expect(gatewayA.isStopped()).toBe(true);
    // Official channel for the same tenant is untouched.
    expect(killSwitch.isTripped('channel', TENANT_A)).toBe(false);
    // Another tenant's community channel is untouched.
    expect(gatewayB.isStopped()).toBe(false);

    const ingested = await gatewayA.ingest(WAHA_RAW);
    expect(ingested).toEqual([]);
    expect(publishedA).toEqual([]);

    const result = await gatewayA.send(outbound('k1'));
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('COMMUNITY_CHANNEL_STOPPED');
  });

  it('self-quarantine stops the channel independently of the kill switch', async () => {
    const { gateway } = makeGateway();
    gateway.quarantine('flagged spam');
    expect(gateway.isStopped()).toBe(true);
    expect(gateway.getQuarantineReason()).toBe('flagged spam');
    const result = await gateway.send(outbound('k1'));
    expect(result.errorCode).toBe('COMMUNITY_CHANNEL_STOPPED');
  });
});

describe('conservative rate guard', () => {
  it('rate-limits back-to-back sends and recovers after the interval', async () => {
    let clock = 0;
    const killSwitch = new KillSwitchRuntime({});
    const adapter = createCommunityWhatsAppAdapter({ channelAccount: ACCOUNT, tenantId: TENANT_A });
    const gateway = new CommunityGateway({
      adapter,
      channelAccount: ACCOUNT,
      enabledCapabilities: [COMMUNITY_CHANNEL_CAPABILITY],
      killSwitch,
      minSendIntervalMs: 1_000,
      now: () => clock,
      publish: () => {},
      tenantId: TENANT_A,
    });

    const first = await gateway.send(outbound('k1'));
    expect(first.success).toBe(true);

    const second = await gateway.send(outbound('k2'));
    expect(second.success).toBe(false);
    expect(second.category).toBe('RATE_LIMIT');

    clock = 1_000;
    const third = await gateway.send(outbound('k3'));
    expect(third.success).toBe(true);
  });
});
