import { describe, it, expect, beforeEach } from 'vitest';

import { EventChainProcessor, type createAutoAssignmentEngine } from '@chai/domain';

import { createIntegrationHarness, sampleWebhook } from './harness';

/**
 * S1.4: Full Chain Latency (<3s SLA)
 *
 * Verifies the end-to-end chain consistently meets the <3s target
 * under various load conditions.
 */
describe('S1.4: Full chain latency SLA', () => {
  let harness: ReturnType<typeof createIntegrationHarness>;

  beforeEach(() => {
    harness = createIntegrationHarness();
  });

  it('single webhook completes under 3s', async () => {
    const result = await harness.processor.processWebhook(sampleWebhook());
    expect(result.latencyMs).toBeLessThan(3000);
    expect(EventChainProcessor.meetsSla(result.latencyMs)).toBe(true);
  });

  it('10 sequential webhooks each meet SLA', async () => {
    for (let i = 0; i < 10; i++) {
      const result = await harness.processor.processWebhook(
        sampleWebhook({ externalEventId: `evt-sla-seq-${i}` })
      );
      expect(result.latencyMs).toBeLessThan(3000);
    }
  });

  it('10 concurrent webhooks all meet SLA', async () => {
    const webhooks = Array.from({ length: 10 }, (_, i) =>
      sampleWebhook({ externalEventId: `evt-sla-conc-${i}` })
    );

    const results = await Promise.all(
      webhooks.map((w) => harness.processor.processWebhook(w))
    );

    for (const result of results) {
      expect(result.latencyMs).toBeLessThan(3000);
    }
  });

  it('50 concurrent webhooks all meet SLA', async () => {
    const webhooks = Array.from({ length: 50 }, (_, i) =>
      sampleWebhook({ externalEventId: `evt-sla-burst-${i}` })
    );

    const results = await Promise.all(
      webhooks.map((w) => harness.processor.processWebhook(w))
    );

    const maxLatency = Math.max(...results.map((r) => r.latencyMs));
    expect(maxLatency).toBeLessThan(3000);
  });

  it('chain completes in under 100ms for single webhook (fast path)', async () => {
    const result = await harness.processor.processWebhook(sampleWebhook());
    // In-process mock should be very fast
    expect(result.latencyMs).toBeLessThan(100);
  });

  it('latency stays bounded with assignment engine populated', async () => {
    const tenant = '01890f47-9b3c-7cc2-98e8-123456789207';
    for (let i = 0; i < 10; i++) {
      (harness.handlers.assignmentEngine as ReturnType<typeof createAutoAssignmentEngine>).registerAgent({
        active: true,
        agentId: `agent-${i}`,
        skills: i % 2 === 0 ? ['technical'] : ['billing'],
        tenantId: tenant,
      });
    }

    const results = [];
    for (let i = 0; i < 20; i++) {
      results.push(
        await harness.processor.processWebhook(
          sampleWebhook({ externalEventId: `evt-populated-${i}` })
        )
      );
    }

    for (const result of results) {
      expect(result.latencyMs).toBeLessThan(3000);
      expect(result.assigned).toBe(true);
    }
  });

  it('SLA check helper identifies violations', () => {
    expect(EventChainProcessor.meetsSla(500)).toBe(true);
    expect(EventChainProcessor.meetsSla(2999)).toBe(true);
    expect(EventChainProcessor.meetsSla(3000)).toBe(false);
    expect(EventChainProcessor.meetsSla(5000)).toBe(false);
  });
});
