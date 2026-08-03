import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { createRefreshTokenStore } from '../../src/auth/refresh-token-store.di';
import { InMemoryRefreshTokenStore } from '../../src/auth/refresh-token-store';
import { PostgresRefreshTokenStore } from '../../src/auth/postgres-refresh-token-store';
import { seedApiRuntime } from '../../src/database/seed-runtime';

/**
 * REQ-10-013: refresh token rotation + reuse detection must be durable across
 * API replicas, not lost on restart. Proves PostgresRefreshTokenStore (a) is
 * the store selected whenever a DATABASE handle exists, (b) supports normal
 * rotation, (c) revokes an entire token family on reuse (not just the
 * replayed token), and (d) that two independent store instances reading the
 * same Postgres database reach the same decision — i.e. the fix actually
 * works across replicas, which the in-memory store could never do.
 */
describe('PostgresRefreshTokenStore (real Postgres)', () => {
  const adminUrl = inject('adminDatabaseUrl') as string;
  const runtimeUrl = inject('runtimeDatabaseUrl') as string;
  let admin: ReturnType<typeof createDatabase>;
  let runtime: ReturnType<typeof createDatabase>;
  let store: PostgresRefreshTokenStore;

  beforeAll(async () => {
    admin = createDatabase(adminUrl);
    runtime = createDatabase(runtimeUrl);
    await seedApiRuntime(admin);
    store = new PostgresRefreshTokenStore(runtime);
  });

  afterAll(async () => {
    await runtime.end();
    await admin.end();
  });

  it('is the store selected when a database handle is present', () => {
    expect(createRefreshTokenStore(runtime)).toBeInstanceOf(PostgresRefreshTokenStore);
    expect(createRefreshTokenStore(null)).toBeInstanceOf(InMemoryRefreshTokenStore);
  });

  it('normal rotation succeeds: the old jti is revoked, the new one is not', async () => {
    const principalId = uuidv7();
    const loginJti = `jti-${uuidv7()}`;
    await store.record({
      expiresAt: Date.now() + 60_000,
      familyId: loginJti,
      jti: loginJti,
      principalId,
      revoked: false,
    });

    expect(await store.isRevoked(loginJti)).toBe(false);

    // Rotate.
    const rotatedJti = `jti-${uuidv7()}`;
    const familyId = (await store.getFamilyId(loginJti)) ?? loginJti;
    await store.revoke(loginJti);
    await store.record({
      expiresAt: Date.now() + 60_000,
      familyId,
      jti: rotatedJti,
      principalId,
      revoked: false,
    });

    expect(await store.isRevoked(loginJti)).toBe(true);
    expect(await store.isRevoked(rotatedJti)).toBe(false);
    expect(await store.getFamilyId(rotatedJti)).toBe(familyId);
  });

  it('reusing an already-rotated token revokes every token in its family', async () => {
    const principalId = uuidv7();
    const loginJti = `jti-${uuidv7()}`;
    const familyId = loginJti;
    await store.record({
      expiresAt: Date.now() + 60_000,
      familyId,
      jti: loginJti,
      principalId,
      revoked: false,
    });

    // Rotate once: loginJti -> rotatedJti (same family).
    const rotatedJti = `jti-${uuidv7()}`;
    await store.revoke(loginJti);
    await store.record({
      expiresAt: Date.now() + 60_000,
      familyId,
      jti: rotatedJti,
      principalId,
      revoked: false,
    });

    // rotatedJti is currently the only valid token in the family.
    expect(await store.isRevoked(rotatedJti)).toBe(false);

    // Attacker replays the already-rotated loginJti. The caller (login
    // controller) detects isRevoked(loginJti) === true and must revoke the
    // whole family — simulate that here directly against the store.
    expect(await store.isRevoked(loginJti)).toBe(true);
    const reusedFamilyId = await store.getFamilyId(loginJti);
    expect(reusedFamilyId).toBe(familyId);
    await store.revokeFamily(reusedFamilyId as string);

    // The legitimate holder's current token is now also revoked — reuse of
    // a stale token invalidates the whole chain, not just the stale token.
    expect(await store.isRevoked(rotatedJti)).toBe(true);
  });

  it('two independent store instances backed by the same database agree on revocation state', async () => {
    // Simulates two API replicas: neither shares in-memory state, only the
    // database. This is exactly the scenario the in-memory store could not
    // support (REQ-10-013).
    const storeA = new PostgresRefreshTokenStore(runtime);
    const storeB = new PostgresRefreshTokenStore(createDatabase(runtimeUrl));

    const principalId = uuidv7();
    const jti = `jti-${uuidv7()}`;
    await storeA.record({
      expiresAt: Date.now() + 60_000,
      familyId: jti,
      jti,
      principalId,
      revoked: false,
    });

    // Replica B did not issue this token but must see it as valid.
    expect(await storeB.isRevoked(jti)).toBe(false);

    // Replica B revokes it (e.g. handled the logout request)...
    await storeB.revokeAllForPrincipal(principalId);

    // ...and replica A must see the same decision on its next request.
    expect(await storeA.isRevoked(jti)).toBe(true);
  });
});
