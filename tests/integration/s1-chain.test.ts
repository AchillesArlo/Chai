import { describe, it, expect, beforeEach } from 'vitest';

import type { createAutoAssignmentEngine } from '@chai/domain';

import { createIntegrationHarness, sampleWebhook } from './harness';

/**
 * S1: End-to-End Frontend ↔ Realtime ↔ Worker Integration
 *
 * Verifies the full chain: Webhook → Outbox → Realtime Gateway → SSE → Inbox
 * meets the <3s SLA and preserves event ordering.
 */
describe('S1: E2E Frontend ↔ Realtime ↔ Worker chain', () => {
  let harness: ReturnType<typeof createIntegrationHarness>;

  beforeEach(() => {
    harness = createIntegrationHarness();
  });

  it('processes a webhook through the full chain', async () => {
    const webhook = sampleWebhook();
    const result = await harness.processor.processWebhook(webhook);

    expect(result.acknowledged).toBe(true);
    expect(result.deduplicated).toBe(false);
    expect(result.outboxEventId).toBeTruthy();
    expect(result.inboxEventId).toBeTruthy();
    expect(result.published).toBe(true);
    expect(result.event).not.toBeNull();
  });

  it('delivers events to realtime bus (SSE channel)', async () => {
    const webhook = sampleWebhook();
    await harness.processor.processWebhook(webhook);

    expect(harness.receivedEvents).toHaveLength(1);
    expect(harness.receivedEvents[0]?.channel).toMatch(/^tenant:/);
    expect(harness.receivedEvents[0]?.event).toMatchObject({
      type: 'conversation.created',
    });
  });

  it('appends events to event store for SSE replay', async () => {
    const webhook = sampleWebhook();
    await harness.processor.processWebhook(webhook);

    const events = await harness.eventStore.replay(
      '01890f47-9b3c-7cc2-98e8-123456789207',
      null,
      10
    );
    expect(events.length).toBeGreaterThan(0);
  });

  it('meets the <3s SLA', async () => {
    const webhook = sampleWebhook();
    const result = await harness.processor.processWebhook(webhook);

    expect(result.latencyMs).toBeLessThan(3000);
  });

  it('deduplicates repeated webhooks (idempotent consumer)', async () => {
    const webhook = sampleWebhook();
    const r1 = await harness.processor.processWebhook(webhook);
    const r2 = await harness.processor.processWebhook(webhook);

    expect(r1.deduplicated).toBe(false);
    expect(r1.acknowledged).toBe(true);
    expect(r2.deduplicated).toBe(true);
    expect(r2.acknowledged).toBe(false);
    // Only one event delivered to SSE
    expect(harness.receivedEvents).toHaveLength(1);
  });

  it('auto-assigns conversation to an agent', async () => {
    (harness.handlers.assignmentEngine as ReturnType<typeof createAutoAssignmentEngine>).registerAgent({
      active: true,
      agentId: 'agent-001',
      skills: [],
      tenantId: '01890f47-9b3c-7cc2-98e8-123456789207',
    });

    const result = await harness.processor.processWebhook(sampleWebhook());

    expect(result.assigned).toBe(true);
    expect(result.agentId).toBe('agent-001');
  });

  it('handles unassigned conversations gracefully', async () => {
    const result = await harness.processor.processWebhook(sampleWebhook());

    expect(result.assigned).toBe(false);
    expect(result.agentId).toBeNull();
    // Chain still completes
    expect(result.acknowledged).toBe(true);
  });

  it('processes multiple webhooks in sequence', async () => {
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(
        await harness.processor.processWebhook(
          sampleWebhook({ externalEventId: `evt-seq-${i}` })
        )
      );
    }

    expect(results).toHaveLength(5);
    expect(results.every((r) => r.acknowledged)).toBe(true);
    expect(harness.receivedEvents).toHaveLength(5);
  });

  it('preserves event isolation between tenants', async () => {
    const tenantA = 'tenant-a-xxx';
    const tenantB = 'tenant-b-yyy';
    const harnessA = createIntegrationHarness(tenantA);
    const harnessB = createIntegrationHarness(tenantB);

    await harnessA.processor.processWebhook(
      sampleWebhook({ tenantId: tenantA })
    );
    await harnessB.processor.processWebhook(
      sampleWebhook({ tenantId: tenantB })
    );

    expect(harnessA.receivedEvents).toHaveLength(1);
    expect(harnessB.receivedEvents).toHaveLength(1);
    expect(harnessA.receivedEvents[0]?.event).toMatchObject({
      tenantId: tenantA,
    });
    expect(harnessB.receivedEvents[0]?.event).toMatchObject({
      tenantId: tenantB,
    });
  });
});
