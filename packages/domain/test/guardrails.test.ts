import { describe, it, expect } from 'vitest';
import {
  evaluateAIGuardrails,
  validateSsrfUrl,
} from '../src/ai-policy/guardrails';

describe('AI Guardrails (REQ-08-030, REQ-10-018)', () => {
  it('allows normal tool calls within limit', () => {
    const result = evaluateAIGuardrails('appointment.create', { name: 'Test' }, { history: [] });
    expect(result.allowed).toBe(true);
  });

  it('rejects N+1 tool call exceeding turn limit (REQ-08-030)', () => {
    const history = Array(5).fill({ tool: 'appointment.create', parameters: { id: 1 } });
    const result = evaluateAIGuardrails('appointment.create', { id: 2 }, { maxToolsPerTurn: 5, history });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('MAX_TOOL_CALLS_EXCEEDED');
  });

  it('rejects identical tool call repeated in history as loop (REQ-08-030)', () => {
    const history = [{ tool: 'knowledge.search', parameters: { query: 'price' } }];
    const result = evaluateAIGuardrails('knowledge.search', { query: 'price' }, { history });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('LOOP_DETECTED');
  });

  it('rejects private IP addresses for SSRF protection (REQ-10-018)', () => {
    expect(validateSsrfUrl('http://localhost/image.png').allowed).toBe(false);
    expect(validateSsrfUrl('http://127.0.0.1/file').allowed).toBe(false);
    expect(validateSsrfUrl('http://192.168.1.1/secret').allowed).toBe(false);
    expect(validateSsrfUrl('http://10.0.0.1/admin').allowed).toBe(false);
  });

  it('rejects un-whitelisted external domains', () => {
    const result = validateSsrfUrl('https://evil-site.com/malware.exe', ['cdn.chai-platform.io']);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('DOMAIN_NOT_ALLOWED');
  });

  it('allows whitelisted external domains', () => {
    const result = validateSsrfUrl('https://cdn.chai-platform.io/logo.png', ['cdn.chai-platform.io']);
    expect(result.allowed).toBe(true);
  });
});
