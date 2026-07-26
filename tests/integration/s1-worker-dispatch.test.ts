import { describe, it, expect, beforeEach } from 'vitest';

import type { createAutoAssignmentEngine, createIdempotencyStore } from '@chai/domain';

import { createIntegrationHarness, sampleWebhook } from './harness';

/**
 * S1.3: Worker Event Processing
 *
 * Verifies that outbox → inbox dispatch works correctly:
 * - Outbox receives events from webhook
 * - Inbox receives deduplicated events
 * - Retry/idempotency logic holds
 */
describe('S1.3: Worker outbox → inbox dispatch', () => {
  let harness: ReturnType<typeof createIntegrationHarness>;

  beforeEach(() => {
    harness = createIntegrationHarness();
  });

  it('appends webhook to outbox with correct metadata', async () => {
    const webhook = sampleWebhook({ provider: 'whatsapp' });
    const result = await harness.processor.processWebhook(webhook);

    expect(result.outboxEventId).toBeTruthy();
    expect(result.event?.payload).toMatchObject({
      provider: 'whatsapp',
    });
  });

  it('appends to inbox with outbox reference', async () => {
    const webhook = sampleWebhook();
    const result = await harness.processor.processWebhook(webhook);

    expect(result.inboxEventId).toBeTruthy();
    expect(result.inboxEventId).toMatch(/^inbox-/);
  });

  it('does not duplicate inbox entries for repeated webhooks', async () => {
    const webhook = sampleWebhook();
    const r1 = await harness.processor.processWebhook(webhook);
    const r2 = await harness.processor.processWebhook(webhook);

    expect(r1.inboxEventId).toBeTruthy();
    // Second call is deduplicated — no new inbox entry
    expect(r2.inboxEventId).toBe('');
    expect(r2.acknowledged).toBe(false);
  });

  it('processes concurrent webhooks without collision', async () => {
    const webhooks = Array.from({ length: 10 }, (_, i) =>
      sampleWebhook({ externalEventId: `evt-concurrent-${i}` })
    );

    const results = await Promise.all(
      webhooks.map((w) => harness.processor.processWebhook(w))
    );

    expect(results).toHaveLength(10);
    expect(results.every((r) => r.acknowledged)).toBe(true);
    // All unique inbox IDs
    const inboxIds = results.map((r) => r.inboxEventId);
    expect(new Set(inboxIds).size).toBe(10);
  });

  it('handles webhook from different providers', async () => {
    const providers = ['whatsapp', 'telegram', 'email', 'sms'];
    const results = [];
    for (const provider of providers) {
      results.push(
        await harness.processor.processWebhook(
          sampleWebhook({ externalEventId: `evt-${provider}`, provider })
        )
      );
    }

    expect(results).toHaveLength(4);
    expect(results.every((r) => r.acknowledged)).toBe(true);
    // Verify provider is preserved in event payload
    expect(results[0]?.event?.payload.provider).toBe('whatsapp');
    expect(results[3]?.event?.payload.provider).toBe('sms');
  });

  it('records processing in idempotency store', async () => {
    const webhook = sampleWebhook({ externalEventId: 'evt-recorded' });
    await harness.processor.processWebhook(webhook);

    expect(
      (harness.handlers.idempotencyStore as ReturnType<typeof createIdempotencyStore>).has(
        '01890f47-9b3c-7cc2-98e8-123456789207',
        'evt-recorded'
      )
    ).toBe(true);
  });

  it('assignment engine assigns round-robin across agents', async () => {
    const tenant = '01890f47-9b3c-7cc2-98e8-123456789207';
    for (let i = 0; i < 3; i++) {
      (harness.handlers.assignmentEngine as ReturnType<typeof createAutoAssignmentEngine>).registerAgent({
        active: true,
        agentId: `agent-${i}`,
        skills: [],
        tenantId: tenant,
      });
    }

    const assignments: string[] = [];
    for (let i = 0; i < 6; i++) {
      const result = await harness.processor.processWebhook(
        sampleWebhook({ externalEventId: `evt-rr-${i}` })
      );
      assignments.push(result.agentId ?? '');
    }

    // Round-robin: agent-0, agent-1, agent-2, agent-0, agent-1, agent-2
    expect(assignments[0]).toBe('agent-0');
    expect(assignments[1]).toBe('agent-1');
    expect(assignments[2]).toBe('agent-2');
    expect(assignments[3]).toBe('agent-0');
  });
});
