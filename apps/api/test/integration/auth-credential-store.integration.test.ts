import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import {
  generateTotpSecret,
  hashPasswordScrypt,
  verifyPasswordHash,
} from '@chai/auth';
import { createDatabase } from '@chai/database';

import { InMemoryCredentialStore } from '../../src/auth/credential-store';
import { createCredentialStore } from '../../src/auth/credential-store.di';
import { PostgresCredentialStore } from '../../src/auth/postgres-credential-store';
import { API_CLIENT_OWNER_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';

/**
 * B1 butir 6: prove PostgresCredentialStore is the store that ships whenever a
 * DATABASE handle exists, and that it actually persists to / reads from Postgres
 * under the chai_app_runtime role (RLS + FORCE, NOBYPASSRLS) — including that the
 * password is stored as a one-way scrypt hash, never as plaintext.
 */

const EMAIL = 'pg-login@chai.local';
const PASSWORD = 'Sup3rSecret!Pw9';

describe('B1 PostgresCredentialStore (real Postgres)', () => {
  const adminUrl = inject('adminDatabaseUrl') as string;
  const runtimeUrl = inject('runtimeDatabaseUrl') as string;
  let admin: ReturnType<typeof createDatabase>;
  let runtime: ReturnType<typeof createDatabase>;
  let store: PostgresCredentialStore;

  beforeAll(async () => {
    admin = createDatabase(adminUrl);
    runtime = createDatabase(runtimeUrl);
    await seedApiRuntime(admin);
    // Seed a client credential row for the pre-existing owner membership. Written
    // by the admin (superuser) since only chai_app_runtime may touch it at runtime.
    await admin`
      INSERT INTO chai.user_credential (id, user_id, email, home_tenant_id, password_hash)
      VALUES (
        ${uuidv7()},
        ${API_CLIENT_OWNER_ID},
        ${EMAIL},
        ${API_TENANT_ID},
        ${await hashPasswordScrypt(PASSWORD)}
      )
      ON CONFLICT (user_id) DO UPDATE
        SET email = EXCLUDED.email,
            home_tenant_id = EXCLUDED.home_tenant_id,
            password_hash = EXCLUDED.password_hash,
            failed_attempt_count = 0,
            locked_until = NULL
    `;
    store = new PostgresCredentialStore(runtime);
  });

  afterAll(async () => {
    await runtime.end();
    await admin.end();
  });

  it('is the store selected when a database handle is present', () => {
    expect(createCredentialStore(runtime)).toBeInstanceOf(PostgresCredentialStore);
    // And only falls back to in-memory when there is no handle at all.
    expect(createCredentialStore(null)).toBeInstanceOf(InMemoryCredentialStore);
  });

  it('resolves the client principal, verifies the hash, and stores no plaintext', async () => {
    const lookup = await store.findByEmail(EMAIL, 'client-portal');
    if (!lookup) {
      throw new Error('expected a credential lookup for the seeded email');
    }
    const record = lookup.record;
    expect(record.enabled).toBe(true);
    expect(record.principal.kind).toBe('USER');
    expect(record.principal.audience).toBe('client-portal');
    if (record.principal.kind === 'USER') {
      expect(record.principal.membership?.role).toBe('CLIENT_OWNER');
      expect(record.principal.membership?.tenantId).toBe(API_TENANT_ID);
      expect(record.principal.membership?.status).toBe('ACTIVE');
    }

    // The stored hash verifies the right password and rejects the wrong one.
    const { passwordHash } = record;
    if (!passwordHash) {
      throw new Error('expected a stored password hash');
    }
    expect(passwordHash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPasswordHash(PASSWORD, passwordHash)).toBe(true);
    expect(await verifyPasswordHash('not-the-password', passwordHash)).toBe(false);

    // Read the raw column back: the password is a scrypt hash, never plaintext.
    const rows = await admin<{ hash: string }[]>`
      SELECT password_hash AS hash FROM chai.user_credential WHERE email = ${EMAIL}
    `;
    expect(rows[0]?.hash).toBeTruthy();
    expect(rows[0]?.hash).not.toBe(PASSWORD);
    expect(rows[0]?.hash).not.toContain(PASSWORD);
    expect(rows[0]?.hash.startsWith('scrypt$')).toBe(true);
  });

  it('returns the same null for an unknown email and a wrong-audience match', async () => {
    // Unknown email → null; a real email queried for the wrong audience → also
    // null, so a caller cannot enumerate accounts across audiences.
    expect(await store.findByEmail('nobody@chai.local', 'client-portal')).toBeNull();
    expect(await store.findByEmail(EMAIL, 'owner-console')).toBeNull();
  });

  it('persists and clears the lockout counter through Postgres', async () => {
    await store.resetFailedAttempts(API_CLIENT_OWNER_ID);

    let outcome = { failedAttemptCount: 0, lockedUntil: null as Date | null };
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      outcome = await store.recordFailedAttempt(API_CLIENT_OWNER_ID);
    }
    expect(outcome.failedAttemptCount).toBe(5);
    const { lockedUntil } = outcome;
    if (!lockedUntil) {
      throw new Error('expected the account to be locked after 5 failures');
    }
    expect(lockedUntil.getTime()).toBeGreaterThan(Date.now());

    const locked = await store.findByEmail(EMAIL, 'client-portal');
    expect(locked?.lockedUntil).not.toBeNull();

    await store.resetFailedAttempts(API_CLIENT_OWNER_ID);
    const cleared = await store.findByEmail(EMAIL, 'client-portal');
    expect(cleared?.lockedUntil).toBeNull();
  });

  it('round-trips a TOTP factor and only ever advances the replay watermark', async () => {
    const secret = generateTotpSecret();
    await store.startTotpEnrollment(API_CLIENT_OWNER_ID, secret);

    const pending = await store.getTotpFactor(API_CLIENT_OWNER_ID);
    expect(pending?.secret).toBe(secret);
    expect(pending?.confirmedAt).toBeNull();
    expect(pending?.lastUsedStep).toBe(0);
    expect(await store.mfaChallengeRequired(API_CLIENT_OWNER_ID)).toBe(false);

    await store.confirmTotpFactor(API_CLIENT_OWNER_ID, 100);
    const confirmed = await store.getTotpFactor(API_CLIENT_OWNER_ID);
    expect(confirmed?.confirmedAt).not.toBeNull();
    expect(confirmed?.lastUsedStep).toBe(100);
    expect(await store.mfaChallengeRequired(API_CLIENT_OWNER_ID)).toBe(true);

    await store.markTotpStepUsed(API_CLIENT_OWNER_ID, 101);
    expect((await store.getTotpFactor(API_CLIENT_OWNER_ID))?.lastUsedStep).toBe(101);

    // A stale (lower) step must not roll the watermark back — that would reopen a
    // replay window.
    await store.markTotpStepUsed(API_CLIENT_OWNER_ID, 50);
    expect((await store.getTotpFactor(API_CLIENT_OWNER_ID))?.lastUsedStep).toBe(101);
  });
});
