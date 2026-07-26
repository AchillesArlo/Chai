import { describe, expect, it } from 'vitest';

import { evaluateActionPolicy } from './action-policy';

/**
 * Fase 3 (R-11) regression: the policy engine is the only gate, and it fails
 * closed. These fail if an unknown tool becomes implicitly allowed, if a
 * CRITICAL tool becomes AI-executable, or if HUMAN_ACTIVE stops blocking AI.
 */
describe('evaluateActionPolicy', () => {
  it('blocks AI tools while HUMAN_ACTIVE', () => {
    const decision = evaluateActionPolicy({
      mode: 'HUMAN_ACTIVE',
      origin: 'ai',
      tool: 'knowledge.search',
    });
    expect(decision).toEqual({
      code: 'AI_OUTBOUND_BLOCKED',
      kind: 'deny',
      reason: 'HUMAN_ACTIVE blocks AI-originated tool execution',
    });
  });

  it('allows human tools while HUMAN_ACTIVE', () => {
    const decision = evaluateActionPolicy({
      mode: 'HUMAN_ACTIVE',
      origin: 'human',
      tool: 'knowledge.search',
    });
    expect(decision).toEqual({ kind: 'allow', risk: 'LOW' });
  });

  it('requires approval for high-risk tools', () => {
    const decision = evaluateActionPolicy({
      mode: 'AI_ACTIVE',
      origin: 'ai',
      tool: 'payment.charge',
    });
    expect(decision.kind).toBe('require_approval');
  });

  it('denies AI tools when conversation is paused', () => {
    const decision = evaluateActionPolicy({
      mode: 'PAUSED',
      origin: 'ai',
      tool: 'knowledge.search',
    });
    expect(decision.kind).toBe('deny');
  });

  it('hard-denies refund execution to AI even with an approval', () => {
    const decision = evaluateActionPolicy({
      approvedBy: 'user-1',
      entitlements: ['payment_refunds'],
      mode: 'AI_ACTIVE',
      origin: 'ai',
      tool: 'payment.execute_refund',
    });
    expect(decision).toEqual({
      code: 'AI_EXECUTION_FORBIDDEN',
      kind: 'deny',
      reason:
        'Tool payment.execute_refund is CRITICAL and may never be executed by AI',
    });
  });

  it('still requires approval when a human drives a critical tool', () => {
    const decision = evaluateActionPolicy({
      entitlements: ['payment_refunds'],
      mode: 'AI_ACTIVE',
      origin: 'human',
      tool: 'payment.execute_refund',
    });
    expect(decision.kind).toBe('require_approval');
  });

  it('denies an unknown tool instead of treating it as low risk', () => {
    const decision = evaluateActionPolicy({
      mode: 'AI_ACTIVE',
      origin: 'ai',
      tool: 'totally.made.up',
    });
    expect(decision).toMatchObject({ code: 'UNKNOWN_TOOL', kind: 'deny' });
  });

  it('denies a gated tool when the tenant lacks the capability', () => {
    const decision = evaluateActionPolicy({
      confirmed: true,
      entitlements: [],
      mode: 'AI_ACTIVE',
      origin: 'ai',
      tool: 'payment.create_link',
    });
    expect(decision).toMatchObject({ code: 'FEATURE_NOT_ENABLED', kind: 'deny' });
  });

  it('allows a gated tool once the capability is enabled and confirmed', () => {
    const decision = evaluateActionPolicy({
      confirmed: true,
      entitlements: ['payment_orchestration'],
      mode: 'AI_ACTIVE',
      origin: 'ai',
      tool: 'payment.create_link',
    });
    expect(decision).toEqual({ kind: 'allow', risk: 'MEDIUM' });
  });

  it('requires confirmation for a medium-risk tool', () => {
    const decision = evaluateActionPolicy({
      entitlements: ['payment_orchestration'],
      mode: 'AI_ACTIVE',
      origin: 'ai',
      tool: 'payment.create_link',
    });
    expect(decision.kind).toBe('require_confirmation');
  });
});
