import type { CredentialStore as AuthCredentialStore } from '@chai/auth';

import { InMemoryCredentialStore } from './credential-store';

export const CredentialStoreToken = Symbol('CredentialStore');

export type CredentialStore = AuthCredentialStore;

export function createCredentialStore(): CredentialStore {
  return new InMemoryCredentialStore();
}
