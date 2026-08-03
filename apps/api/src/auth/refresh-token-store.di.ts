import type { DatabaseHandle } from '../database/database.module';
import { InMemoryRefreshTokenStore, type RefreshTokenStore } from './refresh-token-store';
import { PostgresRefreshTokenStore } from './postgres-refresh-token-store';

export const RefreshTokenStoreToken = Symbol('RefreshTokenStore');

/**
 * Picks the durable Postgres store whenever a DATABASE handle exists (i.e.
 * DATABASE_URL is set), and the in-memory store only for local/test — same
 * token-switch pattern as createCredentialStore (credential-store.di.ts). In
 * production DatabaseModule throws without DATABASE_URL, so the in-memory
 * store never ships silently.
 */
export function createRefreshTokenStore(database: DatabaseHandle): RefreshTokenStore {
  return database ? new PostgresRefreshTokenStore(database) : new InMemoryRefreshTokenStore();
}
