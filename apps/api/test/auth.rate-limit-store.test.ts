import { describe, expect, it } from 'vitest';

import { shouldUseSharedRateLimitStore } from '../src/auth/auth-rate-limit';

/**
 * K-14 regression: the login limiter used the plugin's per-process LocalStore,
 * so each API replica counted independently and N replicas handed a client N x
 * the limit (production runs 5, turning a 10/minute login cap into 50/minute).
 *
 * The store decision is env-driven and pure, so it is asserted directly here;
 * the shared-counting behaviour itself belongs to @fastify/rate-limit's Redis
 * store, which we configure rather than reimplement.
 */
describe('shared rate limit store selection (K-14)', () => {
  it('uses the shared store when REDIS_URL is configured', () => {
    expect(
      shouldUseSharedRateLimitStore({ REDIS_URL: 'redis://localhost:6379' }),
    ).toBe(true);
    expect(
      shouldUseSharedRateLimitStore({ REDIS_URL: 'rediss://prod-cache:6380' }),
    ).toBe(true);
  });

  it('falls back to the per-process store when REDIS_URL is absent or blank', () => {
    // The e2e suite runs one in-process app with no broker; it must keep working.
    expect(shouldUseSharedRateLimitStore({})).toBe(false);
    expect(shouldUseSharedRateLimitStore({ REDIS_URL: '' })).toBe(false);
    expect(shouldUseSharedRateLimitStore({ REDIS_URL: '   ' })).toBe(false);
  });
});
