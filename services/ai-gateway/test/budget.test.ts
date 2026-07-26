import { describe, expect, it, vi } from 'vitest';

import { createAiGateway, createCostAccountingStore } from '../src';

/**
 * Fase 3 (R-11) regression: the spend cap is enforced BEFORE the model call.
 *
 * These fail if an over-budget tenant can keep generating, or if the gateway
 * silently continues at full cost instead of dropping to a cheaper model or
 * handing over (08_AI §20).
 */

const TENANT = '01890f47-9b3c-7cc2-98e8-123456789207';

function adapterStub() {
  return {
    complete: vi.fn().mockResolvedValue({
      citations: [],
      content: 'ok',
      model: 'gpt-4o-mini',
      safeFallback: false,
      toolProposals: [],
      traceId: 'trace-1',
    }),
  } as never;
}

function overBudgetStore() {
  const store = createCostAccountingStore();
  store.record({
    completionTokens: 100,
    costUsd: 5,
    model: 'gpt-4o-mini',
    promptTokens: 100,
    tenantId: TENANT,
    totalTokens: 200,
    traceId: 'trace-0',
  });
  return store;
}

describe('AI gateway budget enforcement', () => {
  it('generates normally while under budget', async () => {
    const adapter = adapterStub();
    const gateway = createAiGateway({
      adapter,
      costStore: createCostAccountingStore(),
      monthlyBudgetUsd: 10,
    });

    const result = await gateway.complete({
      conversationId: 'c-1',
      messages: [{ content: 'hi', role: 'user' }],
      model: 'gpt-4o-mini',
      tenantId: TENANT,
    });

    expect(result.budgetExhausted).toBeUndefined();
    expect(result.safeFallback).toBe(false);
  });

  it('hands over instead of spending when no fallback model exists', async () => {
    const adapter = adapterStub();
    const gateway = createAiGateway({
      adapter,
      costStore: overBudgetStore(),
      monthlyBudgetUsd: 1,
    });

    const result = await gateway.complete({
      conversationId: 'c-1',
      messages: [{ content: 'hi', role: 'user' }],
      model: 'gpt-4o-mini',
      tenantId: TENANT,
    });

    expect(result.budgetExhausted).toBe(true);
    expect(result.safeFallback).toBe(true);
    expect(result.content).toBe('');
    // The model must never have been called once the cap was reached.
    expect((adapter as unknown as { complete: { mock: { calls: unknown[] } } }).complete.mock.calls).toHaveLength(0);
  });

  it('drops to the cheaper model when one is configured', async () => {
    const adapter = adapterStub();
    const gateway = createAiGateway({
      adapter,
      costStore: overBudgetStore(),
      monthlyBudgetUsd: 1,
      safeFallbackModel: 'cs-fast',
    });

    const result = await gateway.complete({
      conversationId: 'c-1',
      messages: [{ content: 'hi', role: 'user' }],
      model: 'cs-quality',
      tenantId: TENANT,
    });

    expect(result.budgetExhausted).toBe(true);
    expect(result.model).toBe('cs-fast');
    expect(result.safeFallback).toBe(true);
  });

  it('leaves tenants without a configured budget untouched', async () => {
    const adapter = adapterStub();
    const gateway = createAiGateway({ adapter, costStore: overBudgetStore() });

    const result = await gateway.complete({
      conversationId: 'c-1',
      messages: [{ content: 'hi', role: 'user' }],
      model: 'gpt-4o-mini',
      tenantId: TENANT,
    });

    expect(result.budgetExhausted).toBeUndefined();
  });
});
