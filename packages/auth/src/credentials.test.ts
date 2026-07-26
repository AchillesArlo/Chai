import { describe, expect, it } from 'vitest';

import {
  authenticateCredentials,
  computeLockedUntil,
  DEFAULT_LOCKOUT_POLICY,
  hashPassword,
  hashPasswordScrypt,
  verifyPasswordHash,
  type AuthenticateCredentialsResult,
  type CredentialLookupResult,
  type CredentialStore,
  type LockoutOutcome,
} from './server';
import type { Principal } from './index';
const USER_ID = '01890f47-9b3c-7cc2-98e8-1234567890aa';
const TENANT_ID = '01890f47-9b3c-7cc2-98e8-1234567890bb';

const principal: Principal = {
  audience: 'client-portal',
  authenticatedAt: new Date('2026-07-27T00:00:00.000Z'),
  id: USER_ID,
  kind: 'USER',
  membership: { role: 'CLIENT_OWNER', status: 'ACTIVE', tenantId: TENANT_ID },
  status: 'ACTIVE',
};

/** In-memory store with real lockout accounting, mirroring the store contract. */
class FakeStore implements CredentialStore {
  private failed = 0;
  private lockedUntil: Date | null = null;

  constructor(
    private readonly hash: string,
    private readonly email = 'user@example.test',
  ) {}

  async findByEmail(
    email: string,
    audience: string,
  ): Promise<CredentialLookupResult | null> {
    if (email !== this.email || audience !== principal.audience) {
      return null;
    }
    return {
      record: { email, enabled: true, passwordHash: this.hash, principal },
      lockedUntil: this.lockedUntil,
    };
  }

  async recordFailedAttempt(_userId: string, now = new Date()): Promise<LockoutOutcome> {
    this.failed += 1;
    this.lockedUntil = computeLockedUntil(this.failed, now);
    return { lockedUntil: this.lockedUntil, failedAttemptCount: this.failed };
  }

  async resetFailedAttempts(): Promise<void> {
    this.failed = 0;
    this.lockedUntil = null;
  }
}

const NOW = new Date('2026-07-27T12:00:00.000Z');

async function attempt(store: CredentialStore, password: string) {
  return authenticateCredentials({
    audience: 'client-portal',
    email: 'user@example.test',
    now: NOW,
    password,
    store,
  });
}

/**
 * Failure reason, or `undefined` when the attempt succeeded.
 *
 * The result is a discriminated union, so reading `.reason` directly does not
 * compile — and that is the type doing its job: a success has no reason.
 */
function reasonOf(result: AuthenticateCredentialsResult): string | undefined {
  return result.ok ? undefined : result.reason;
}

describe('authenticateCredentials', () => {
  it('accepts the correct password', async () => {
    const store = new FakeStore(await hashPasswordScrypt('right-password'));
    const result = await attempt(store, 'right-password');
    expect(result).toEqual({ ok: true, principal });
  });

  it('rejects a wrong password and an unknown email opaquely', async () => {
    const store = new FakeStore(await hashPasswordScrypt('right-password'));
    const wrong = await attempt(store, 'wrong-password');
    expect(wrong).toEqual({ ok: false, reason: 'INVALID_PASSWORD' });

    const unknown = await authenticateCredentials({
      audience: 'client-portal',
      email: 'nobody@example.test',
      now: NOW,
      password: 'whatever-password',
      store,
    });
    expect(unknown).toEqual({ ok: false, reason: 'UNKNOWN_CREDENTIALS' });
  });

  it('locks the account after the configured number of consecutive failures', async () => {
    const store = new FakeStore(await hashPasswordScrypt('right-password'));
    const threshold = DEFAULT_LOCKOUT_POLICY.maxFailedAttempts;

    for (let i = 0; i < threshold - 1; i += 1) {
      expect(reasonOf(await attempt(store, 'wrong-password'))).toBe('INVALID_PASSWORD');
    }
    // The failure that reaches the threshold reports the lock.
    expect(reasonOf(await attempt(store, 'wrong-password'))).toBe('ACCOUNT_LOCKED');
    // While locked, even the correct password is refused (checked before hashing).
    expect(reasonOf(await attempt(store, 'right-password'))).toBe('ACCOUNT_LOCKED');
  });

  it('clears the failure counter after a successful login', async () => {
    const store = new FakeStore(await hashPasswordScrypt('right-password'));
    await attempt(store, 'wrong-password');
    await attempt(store, 'wrong-password');
    expect((await attempt(store, 'right-password')).ok).toBe(true);

    // Counter reset: it now takes the full threshold again to lock.
    const threshold = DEFAULT_LOCKOUT_POLICY.maxFailedAttempts;
    for (let i = 0; i < threshold - 1; i += 1) {
      expect(reasonOf(await attempt(store, 'wrong-password'))).toBe('INVALID_PASSWORD');
    }
    expect(reasonOf(await attempt(store, 'wrong-password'))).toBe('ACCOUNT_LOCKED');
  });
});

describe('verifyPasswordHash', () => {
  it('verifies scrypt hashes', async () => {
    const hash = await hashPasswordScrypt('secret');
    expect(await verifyPasswordHash('secret', hash)).toBe(true);
    expect(await verifyPasswordHash('nope', hash)).toBe(false);
  });

  it('still verifies legacy pbkdf2 hashes', async () => {
    const hash = await hashPassword('secret');
    expect(hash.startsWith('pbkdf2$')).toBe(true);
    expect(await verifyPasswordHash('secret', hash)).toBe(true);
    expect(await verifyPasswordHash('nope', hash)).toBe(false);
  });
});
