import { describe, it, expect, beforeEach } from 'vitest';

import type {
  GuardrailConfigStore} from '../src/guardrails';
import {
  redactPii,
  scoreToxicity,
  isToxic,
  meetsConfidenceThreshold,
  runGuardrails,
  createGuardrailConfigStore,
} from '../src/guardrails';

describe('redactPii', () => {
  it('redacts email addresses', () => {
    const { redacted, redactions } = redactPii('Contact me at john@example.com');
    expect(redacted).toBe('Contact me at [EMAIL]');
    expect(redactions).toBe(1);
  });

  it('redacts phone numbers', () => {
    const { redacted } = redactPii('Call +62 812 3456 7890');
    expect(redacted).toContain('[PHONE]');
  });

  it('redacts credit card numbers', () => {
    const { redacted } = redactPii('Card 4111 1111 1111 1111');
    expect(redacted).toContain('[CARD]');
  });

  it('redacts Indonesian NIK (16 digits)', () => {
    const { redacted } = redactPii('NIK 1234567890123456');
    expect(redacted).toContain('[NIK]');
  });

  it('handles text with no PII', () => {
    const { redacted, redactions } = redactPii('just normal text');
    expect(redacted).toBe('just normal text');
    expect(redactions).toBe(0);
  });

  it('redacts multiple PII types', () => {
    const { redacted, redactions } = redactPii('email: a@b.com, phone: 555-1234');
    expect(redactions).toBeGreaterThanOrEqual(1);
    expect(redacted).not.toContain('a@b.com');
  });
});

describe('scoreToxicity', () => {
  it('returns 0 for safe text', () => {
    expect(scoreToxicity('hello world welcome')).toBe(0);
  });

  it('returns score > 0 for toxic text', () => {
    const score = scoreToxicity('I hate you');
    expect(score).toBeGreaterThan(0);
  });

  it('returns 0 for empty text', () => {
    expect(scoreToxicity('')).toBe(0);
  });

  it('caps score at 1', () => {
    const score = scoreToxicity('hate kill murder attack bomb terrorist racist');
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('isToxic', () => {
  it('returns true when score exceeds threshold', () => {
    expect(isToxic(0.5, 0.3)).toBe(true);
  });

  it('returns false when score below threshold', () => {
    expect(isToxic(0.1, 0.3)).toBe(false);
  });
});

describe('meetsConfidenceThreshold', () => {
  it('passes when score meets threshold', () => {
    const result = meetsConfidenceThreshold(0.8, 0.5);
    expect(result.passed).toBe(true);
  });

  it('fails when score below threshold', () => {
    const result = meetsConfidenceThreshold(0.3, 0.5);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Confidence 0.3 below threshold 0.5');
  });
});

describe('runGuardrails', () => {
  it('passes for safe content', () => {
    const result = runGuardrails('Hello, how can I help?');
    expect(result.passed).toBe(true);
    expect(result.redactedContent).toBe('Hello, how can I help?');
  });

  it('redacts PII before returning', () => {
    const result = runGuardrails('Email me at test@example.com');
    expect(result.passed).toBe(true);
    expect(result.redactedContent).toContain('[EMAIL]');
    expect(result.redactedContent).not.toContain('test@example.com');
  });

  it('blocks toxic content', () => {
    const result = runGuardrails('I hate everyone and want to kill');
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Toxicity');
    expect(result.redactedContent).toContain('[BLOCKED');
  });

  it('blocks low confidence content', () => {
    const result = runGuardrails('maybe answer', {
      confidenceScore: 0.2,
      confidenceThreshold: 0.5,
    });
    expect(result.passed).toBe(false);
    expect(result.reason?.toLowerCase()).toContain('confidence');
  });

  it('can disable PII redaction', () => {
    const result = runGuardrails('test@example.com', { redactPiiEnabled: false });
    expect(result.passed).toBe(true);
    expect(result.redactedContent).toBe('test@example.com');
  });
});

describe('GuardrailConfigStore', () => {
  let store: GuardrailConfigStore;

  beforeEach(() => {
    store = createGuardrailConfigStore();
  });

  it('returns default config for unknown tenant', () => {
    const config = store.get('tenant-1');
    expect(config.tenantId).toBe('tenant-1');
    expect(config.redactPiiEnabled).toBeUndefined();
  });

  it('stores and retrieves tenant config', () => {
    store.set({
      confidenceThreshold: 0.8,
      redactPiiEnabled: true,
      tenantId: 'tenant-1',
      toxicityThreshold: 0.5,
    });

    const config = store.get('tenant-1');
    expect(config.confidenceThreshold).toBe(0.8);
    expect(config.toxicityThreshold).toBe(0.5);
  });

  it('clears all configs', () => {
    store.set({ tenantId: 't1' });
    store.clear();
    const config = store.get('t1');
    expect(config.confidenceThreshold).toBeUndefined();
  });
});
