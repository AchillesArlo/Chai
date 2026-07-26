import type { ChannelAdapter } from '@chai/connector-sdk';

export interface ConformanceReport {
  failures: string[];
  passed: boolean;
}

/**
 * Runs every adapter operation against a synthetic payload and asserts the
 * canonical contract: capability manifest shape, webhook normalization into
 * INBOUND events, signature verification, outbound result shape, and health.
 *
 * This is the single gate every connector must pass before it is registered,
 * so platform guarantees (direction, tenant scoping, external ids, retryability)
 * stay consistent across providers.
 */
export async function runChannelConformance(
  adapter: ChannelAdapter,
): Promise<ConformanceReport> {
  const failures: string[] = [];

  const manifest = await adapter.discoverCapabilities();
  if (manifest.connectorKey !== adapter.connectorKey) {
    failures.push('manifest connectorKey must match adapter.connectorKey');
  }
  if (manifest.version.length === 0) {
    failures.push('manifest version must be non-empty');
  }
  if (!manifest.capabilities || typeof manifest.capabilities !== 'object') {
    failures.push('manifest capabilities must be an object');
  }

  const health = await adapter.healthCheck();
  if (typeof health.healthy !== 'boolean') {
    failures.push('healthCheck must return a boolean healthy flag');
  }

  const payload = JSON.stringify({
    data: {
      external_event_id: 'conformance-event',
      external_message_id: 'conformance-message',
      external_user_id: 'conformance-user',
      text: 'conformance',
    },
  });
  const normalized = await adapter.normalizeWebhook({
    raw: new TextEncoder().encode(payload),
  });
  if (!normalized.verification.verified) {
    failures.push('webhook verification must succeed for a well-formed payload');
  }
  if (normalized.events.length === 0) {
    failures.push('normalizeWebhook must emit at least one canonical event');
  }
  for (const event of normalized.events) {
    if (event.direction !== 'INBOUND') {
      failures.push(`inbound event direction must be INBOUND, got ${event.direction}`);
    }
    if (!event.externalEventId) {
      failures.push('inbound event must carry an externalEventId');
    }
    if (!event.tenantId) {
      failures.push('inbound event must carry a tenantId');
    }
    if (!event.provider) {
      failures.push('inbound event must carry a provider');
    }
    if (!event.content || !event.content.contentType) {
      failures.push('inbound event content must declare a contentType');
    }
  }

  const result = await adapter.sendMessage({
    channelAccount: 'conformance-account',
    content: { contentType: 'TEXT', text: 'conformance-outbound' },
    externalUserId: 'conformance-user',
    idempotencyKey: 'conformance-idempotency',
    provider: adapter.connectorKey,
    tenantId: normalized.events[0]?.tenantId ?? 'unknown-tenant',
  });
  if (typeof result.success !== 'boolean') {
    failures.push('sendMessage must return a boolean success flag');
  }
  if (result.success && !result.externalId) {
    failures.push('a successful sendMessage result must carry an externalId');
  }
  if (typeof result.retryable !== 'boolean') {
    failures.push('sendMessage result must declare retryability');
  }

  return { failures, passed: failures.length === 0 };
}
