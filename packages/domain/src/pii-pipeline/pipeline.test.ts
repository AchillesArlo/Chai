import { describe, it, expect, beforeEach } from 'vitest';

import type {
  PiiRedactionPipeline} from './pipeline';
import {
  createPiiRedactionPipeline,
  getPiiRedactionPipeline,
  resetPiiRedactionPipeline,
} from './pipeline';

describe('PiiRedactionPipeline', () => {
  let pipeline: PiiRedactionPipeline;

  beforeEach(() => {
    pipeline = createPiiRedactionPipeline();
  });

  it('classifies email fields', () => {
    expect(pipeline.classifyField('email')).toBe('email');
    expect(pipeline.classifyField('emailAddress')).toBe('email');
    expect(pipeline.classifyField('userEmail')).toBe('email');
  });

  it('classifies phone fields', () => {
    expect(pipeline.classifyField('phone')).toBe('phone');
    expect(pipeline.classifyField('phoneNumber')).toBe('phone');
    expect(pipeline.classifyField('mobile')).toBe('phone');
  });

  it('classifies credit card fields', () => {
    expect(pipeline.classifyField('creditCard')).toBe('credit_card');
    expect(pipeline.classifyField('cardNumber')).toBe('credit_card');
  });

  it('classifies NIK fields', () => {
    expect(pipeline.classifyField('nik')).toBe('nik');
    expect(pipeline.classifyField('nationalId')).toBe('nik');
  });

  it('classifies IP address fields', () => {
    expect(pipeline.classifyField('ipAddress')).toBe('ip_address');
    expect(pipeline.classifyField('clientIp')).toBe('ip_address');
  });

  it('returns none for non-PII fields', () => {
    expect(pipeline.classifyField('name')).toBe('none');
    expect(pipeline.classifyField('description')).toBe('none');
  });

  it('redacts classified field value entirely', () => {
    const result = pipeline.redact({
      email: 'user@example.com',
      name: 'John',
    });
    expect(result.redacted.email).toBe('[REDACTED_EMAIL]');
    expect(result.redacted.name).toBe('John');
    expect(result.redactions).toHaveLength(1);
    expect(result.redactions[0]?.field).toBe('email');
  });

  it('redacts nested objects', () => {
    const result = pipeline.redact({
      user: {
        email: 'nested@example.com',
        name: 'Jane',
      },
    });
    expect(result.redacted.user).toEqual({ email: '[REDACTED_EMAIL]', name: 'Jane' });
    expect(result.redactions[0]?.field).toBe('user.email');
  });

  it('redacts arrays of objects', () => {
    const result = pipeline.redact({
      contacts: [
        { email: 'a@example.com', name: 'A' },
        { email: 'b@example.com', name: 'B' },
      ],
    });
    const contacts = result.redacted.contacts as Array<{ email: string; name: string }>;
    expect(contacts[0]?.email).toBe('[REDACTED_EMAIL]');
    expect(contacts[1]?.email).toBe('[REDACTED_EMAIL]');
  });

  it('scans string values for PII patterns', () => {
    const result = pipeline.redact({
      message: 'Contact me at user@example.com',
    });
    expect(result.redacted.message).toContain('[REDACTED_EMAIL]');
    expect(result.redacted.message).not.toContain('user@example.com');
  });

  it('scans for IP addresses in values', () => {
    const result = pipeline.redact({
      log: 'Request from 192.168.1.1',
    });
    expect(result.redacted.log).toContain('[REDACTED_IP]');
  });

  it('scans for NIK in values', () => {
    const result = pipeline.redact({
      note: 'NIK is 1234567890123456',
    });
    expect(result.redacted.note).toContain('[REDACTED_NIK]');
  });

  it('handles empty objects', () => {
    const result = pipeline.redact({});
    expect(result.redacted).toEqual({});
    expect(result.redactions).toHaveLength(0);
  });

  it('adds custom rules', () => {
    pipeline.addRule({
      class: 'none',
      fieldPattern: /customField/i,
      replacement: '[CUSTOM]',
    });
    expect(pipeline.classifyField('customField')).toBe('none');
  });
});

describe('PiiRedactionPipeline singleton', () => {
  beforeEach(() => {
    resetPiiRedactionPipeline();
  });

  it('returns same instance', () => {
    expect(getPiiRedactionPipeline()).toBe(getPiiRedactionPipeline());
  });

  it('reset creates new instance', () => {
    const p1 = getPiiRedactionPipeline();
    resetPiiRedactionPipeline();
    const p2 = getPiiRedactionPipeline();
    expect(p1).not.toBe(p2);
  });
});
