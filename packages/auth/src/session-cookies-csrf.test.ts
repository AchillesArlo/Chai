import { describe, expect, it } from 'vitest';

import { requestOriginIsTrusted } from './session-cookies';

function headersOf(entries: Record<string, string>): { get(name: string): string | null } {
  return {
    get(name: string): string | null {
      return entries[name.toLowerCase()] ?? null;
    },
  };
}

describe('requestOriginIsTrusted', () => {
  it('trusts a request whose Origin matches the host', () => {
    expect(
      requestOriginIsTrusted(headersOf({ origin: 'https://portal.chai.example' }), 'portal.chai.example'),
    ).toBe(true);
  });

  it('rejects a cross-site Origin', () => {
    expect(
      requestOriginIsTrusted(headersOf({ origin: 'https://attacker.example' }), 'portal.chai.example'),
    ).toBe(false);
  });

  it('falls back to Referer when Origin is absent', () => {
    expect(
      requestOriginIsTrusted(
        headersOf({ referer: 'https://portal.chai.example/inbox' }),
        'portal.chai.example',
      ),
    ).toBe(true);
  });

  it('rejects a cross-site Referer when Origin is absent', () => {
    expect(
      requestOriginIsTrusted(
        headersOf({ referer: 'https://attacker.example/csrf.html' }),
        'portal.chai.example',
      ),
    ).toBe(false);
  });

  it('rejects a request with neither Origin nor Referer', () => {
    expect(requestOriginIsTrusted(headersOf({}), 'portal.chai.example')).toBe(false);
  });

  it('rejects a malformed Origin header', () => {
    expect(
      requestOriginIsTrusted(headersOf({ origin: 'not-a-url' }), 'portal.chai.example'),
    ).toBe(false);
  });

  it('rejects when host itself is null (no Host header on the incoming request)', () => {
    expect(
      requestOriginIsTrusted(headersOf({ origin: 'https://portal.chai.example' }), null),
    ).toBe(false);
  });
});
