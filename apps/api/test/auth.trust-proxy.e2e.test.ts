import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap';
import { parseTrustedProxy } from '../src/bootstrap';

/**
 * D3 finding (HIGH): auth rate-limit bypass via X-Forwarded-For.
 *
 * The limiter keys the loose global cap on `request.ip`. With the old
 * `trustProxy: true`, `request.ip` came from client-controlled XFF, so rotating
 * XFF handed an attacker a fresh counter per fabricated IP. These tests pin the
 * fix: with the secure default (trust no proxy) rotating XFF does NOT create new
 * counters; only when the proxy is explicitly trusted does XFF drive the key.
 *
 * Probe route: GET /api/v1/health — unauthenticated, 200, and still subject to
 * the global limiter (global: true), so it isolates the ip-keying from the login
 * route's email component.
 */

const ENV_KEYS = [
  'TRUSTED_PROXY_CIDRS',
  'RATE_LIMIT_GLOBAL_MAX',
  'RATE_LIMIT_WINDOW_MS',
] as const;

const LOOSE_MAX = 2;

let app: NestFastifyApplication | undefined;
const savedEnv = new Map<string, string | undefined>();

function setEnv(values: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    savedEnv.set(key, process.env[key]);
  }
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
}

async function bootWithEnv(
  values: Record<string, string | undefined>,
): Promise<NestFastifyApplication> {
  setEnv({
    RATE_LIMIT_GLOBAL_MAX: String(LOOSE_MAX),
    RATE_LIMIT_WINDOW_MS: '60000',
    ...values,
  });
  const created = await createApplication({ environment: 'test' });
  await created.init();
  await created.getHttpAdapter().getInstance().ready();
  return created;
}

async function healthWithForwardedFor(
  instance: NestFastifyApplication,
  forwardedFor: string,
): Promise<number> {
  const response = await instance.inject({
    headers: { 'x-forwarded-for': forwardedFor },
    method: 'GET',
    url: '/api/v1/health',
  });
  return response.statusCode;
}

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
  for (const [key, value] of savedEnv) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
  savedEnv.clear();
});

describe('parseTrustedProxy', () => {
  it('trusts no proxy by default (unset/empty/whitespace)', () => {
    expect(parseTrustedProxy(undefined)).toBe(false);
    expect(parseTrustedProxy('')).toBe(false);
    expect(parseTrustedProxy('   ')).toBe(false);
    expect(parseTrustedProxy(' , ,')).toBe(false);
  });

  it('parses a comma-separated CIDR/IP allowlist into a trimmed array', () => {
    expect(parseTrustedProxy('127.0.0.1')).toEqual(['127.0.0.1']);
    expect(parseTrustedProxy('10.0.0.0/8, 127.0.0.1 ')).toEqual([
      '10.0.0.0/8',
      '127.0.0.1',
    ]);
  });
});

describe('D3 XFF rate-limit bypass', () => {
  it('does NOT mint a fresh counter per forged XFF when no proxy is trusted (secure default)', async () => {
    app = await bootWithEnv({ TRUSTED_PROXY_CIDRS: undefined });

    // Rotate a different fabricated client IP on every request. Because XFF is
    // untrusted, request.ip stays the real socket peer, so all three share ONE
    // counter and the request past the cap is throttled.
    const first = await healthWithForwardedFor(app, '203.0.113.1');
    const second = await healthWithForwardedFor(app, '203.0.113.2');
    const third = await healthWithForwardedFor(app, '203.0.113.3');

    expect(first).toBe(200);
    expect(second).toBe(200);
    expect(third).toBe(429); // LOOSE_MAX = 2 → the 3rd is over the cap
  });

  it('keys per-XFF ONLY when the proxy is explicitly trusted (documents the old bug)', async () => {
    app = await bootWithEnv({ TRUSTED_PROXY_CIDRS: '127.0.0.1/8' });

    // Now the loopback socket peer is a trusted hop, so request.ip is taken from
    // XFF. Each forged IP is a distinct key, so well past LOOSE_MAX requests all
    // succeed — exactly the bypass the secure default prevents.
    const statuses = await Promise.all(
      ['198.51.100.1', '198.51.100.2', '198.51.100.3', '198.51.100.4'].map(
        (ip) => healthWithForwardedFor(app as NestFastifyApplication, ip),
      ),
    );

    expect(statuses).toEqual([200, 200, 200, 200]);
  });
});
