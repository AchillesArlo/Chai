import type { CredentialStore as AuthCredentialStore } from '@chai/auth/server';

import type { DatabaseHandle } from '../database/database.module';
import { InMemoryCredentialStore } from './credential-store';
import type { MfaOperations } from './mfa-store';
import { PostgresCredentialStore } from './postgres-credential-store';

export const CredentialStoreToken = Symbol('CredentialStore');

/** The credential store is also the MFA store; callers get both without guards. */
export type CredentialStore = AuthCredentialStore & MfaOperations;

/**
 * Picks the durable Postgres store whenever a DATABASE handle exists (i.e.
 * DATABASE_URL is set), and the in-memory store only for local/test — the same
 * token-switch pattern EntitlementModule uses. In production DatabaseModule
 * throws without DATABASE_URL, so the in-memory store never ships silently.
 */
export function createCredentialStore(database: DatabaseHandle): CredentialStore {
  return database ? new PostgresCredentialStore(database) : new InMemoryCredentialStore();
}
