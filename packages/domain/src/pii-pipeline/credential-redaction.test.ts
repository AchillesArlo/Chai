import { describe, expect, it } from 'vitest';

import { createPiiRedactionPipeline } from './pipeline';

describe('credential redaction', () => {
  it('redacts credential-bearing fields, not just PII', () => {
    const { redacted } = createPiiRedactionPipeline().redact({
      accessToken: 'eyJhbGciOi.header.signature',
      apiKey: 'sk-live-abcdef',
      clientSecret: 'shhh',
      email: 'user@example.com',
      password: 'SuperSecret123!',
      refreshToken: 'refresh-abc',
    });

    // No original secret value survives anywhere in the output.
    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain('SuperSecret123!');
    expect(serialized).not.toContain('sk-live-abcdef');
    expect(serialized).not.toContain('refresh-abc');
    expect(serialized).not.toContain('shhh');
    expect(serialized).not.toContain('eyJhbGciOi');

    expect(redacted.password).toBe('[REDACTED_CREDENTIAL]');
    expect(redacted.accessToken).toBe('[REDACTED_CREDENTIAL]');
    expect(redacted.refreshToken).toBe('[REDACTED_CREDENTIAL]');
    expect(redacted.apiKey).toBe('[REDACTED_CREDENTIAL]');
    expect(redacted.clientSecret).toBe('[REDACTED_CREDENTIAL]');
    // Pre-existing PII behaviour still holds.
    expect(redacted.email).toBe('[REDACTED_EMAIL]');
  });

  it('redacts credentials nested inside objects and arrays', () => {
    const { redacted } = createPiiRedactionPipeline().redact({
      items: [{ password: 'nested-secret' }],
      user: { credentials: { authorization: 'Bearer leak-me' } },
    });

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain('nested-secret');
    expect(serialized).not.toContain('leak-me');
  });

  it('reports credential redactions so callers can assert none were missed', () => {
    const { redactions } = createPiiRedactionPipeline().redact({
      password: 'x',
    });

    expect(redactions).toEqual([{ class: 'credential', field: 'password' }]);
  });
});
