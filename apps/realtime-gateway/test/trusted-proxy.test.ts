import { describe, expect, it } from 'vitest';

import { parseTrustedProxy } from '../src/main';

/**
 * Fase 3 (rencana-100-persen §7): the gateway must fail CLOSED (trust no proxy)
 * when TRUSTED_PROXY_CIDRS is absent, and only trust the explicit allowlist
 * otherwise — mirrors apps/api/src/bootstrap.ts:parseTrustedProxy.
 */
describe('parseTrustedProxy', () => {
  it('trusts no proxy when unset', () => {
    expect(parseTrustedProxy(undefined)).toBe(false);
  });

  it('trusts no proxy when empty', () => {
    expect(parseTrustedProxy('')).toBe(false);
  });

  it('trusts no proxy when only whitespace/commas', () => {
    expect(parseTrustedProxy(' , ,')).toBe(false);
  });

  it('parses a single CIDR', () => {
    expect(parseTrustedProxy('10.0.0.0/8')).toEqual(['10.0.0.0/8']);
  });

  it('parses a comma-separated list and trims whitespace', () => {
    expect(parseTrustedProxy('10.0.0.0/8, 127.0.0.1 ,172.16.0.0/12')).toEqual([
      '10.0.0.0/8',
      '127.0.0.1',
      '172.16.0.0/12',
    ]);
  });
});
