import { describe, it, expect, beforeEach } from 'vitest';

import {
  EnvSecretBackend,
  InMemorySecretBackend,
  SecretManager,
  VaultSecretBackend,
  createEnvSecretManager,
  createInMemorySecretManager,
  createSecretManager,
  getSecretManager,
  resetSecretManager,
} from './manager';

describe('EnvSecretBackend', () => {
  it('reads from env', async () => {
    const backend = new EnvSecretBackend({ API_KEY: 'secret123' });
    const secret = await backend.get('API_KEY');
    expect(secret?.value).toBe('secret123');
    expect(secret?.meta.source).toBe('env');
  });

  it('returns null for missing key', async () => {
    const backend = new EnvSecretBackend({});
    expect(await backend.get('MISSING')).toBeNull();
  });

  it('lists env keys', async () => {
    const backend = new EnvSecretBackend({ A: '1', B: '2' });
    const keys = await backend.list();
    expect(keys).toContain('A');
    expect(keys).toContain('B');
  });

  it('sets overrides', async () => {
    const backend = new EnvSecretBackend({ API_KEY: 'original' });
    await backend.set('API_KEY', 'overridden');
    const secret = await backend.get('API_KEY');
    expect(secret?.value).toBe('overridden');
    expect(secret?.meta.source).toBe('memory');
  });

  it('deletes overrides', async () => {
    const backend = new EnvSecretBackend({ API_KEY: 'original' });
    await backend.set('API_KEY', 'override');
    await backend.delete('API_KEY');
    const secret = await backend.get('API_KEY');
    expect(secret?.value).toBe('original'); // falls back to env
  });
});

describe('InMemorySecretBackend', () => {
  let backend: InMemorySecretBackend;

  beforeEach(() => {
    backend = new InMemorySecretBackend();
  });

  it('sets and gets secrets', async () => {
    await backend.set('KEY', 'value');
    const secret = await backend.get('KEY');
    expect(secret?.value).toBe('value');
  });

  it('returns null for missing', async () => {
    expect(await backend.get('MISSING')).toBeNull();
  });

  it('lists keys', async () => {
    await backend.set('A', '1');
    await backend.set('B', '2');
    const keys = await backend.list();
    expect(keys).toEqual(['A', 'B']);
  });

  it('deletes secrets', async () => {
    await backend.set('KEY', 'value');
    const deleted = await backend.delete('KEY');
    expect(deleted).toBe(true);
    expect(await backend.get('KEY')).toBeNull();
  });

  it('increments version on re-set', async () => {
    await backend.set('KEY', 'v1');
    await backend.set('KEY', 'v2');
    const secret = await backend.get('KEY');
    expect(secret?.value).toBe('v2');
    expect(secret?.meta.version).toBe(2);
  });
});

describe('VaultSecretBackend', () => {
  it('caches set secrets', async () => {
    const backend = new VaultSecretBackend('https://vault.example.com', 'token');
    await backend.set('KEY', 'value');
    const secret = await backend.get('KEY');
    expect(secret?.value).toBe('value');
    expect(secret?.meta.source).toBe('vault');
  });

  it('returns null for uncached keys', async () => {
    const backend = new VaultSecretBackend('https://vault.example.com', 'token');
    expect(await backend.get('UNCACHED')).toBeNull();
  });
});

describe('SecretManager', () => {
  let manager: SecretManager;

  beforeEach(() => {
    manager = createInMemorySecretManager();
  });

  it('sets and gets secrets', async () => {
    await manager.set('API_KEY', 'secret');
    expect(await manager.get('API_KEY')).toBe('secret');
  });

  it('caches secrets', async () => {
    const backend = new InMemorySecretBackend();
    manager = new SecretManager(backend, 60000);
    await backend.set('KEY', 'v1');
    expect(await manager.get('KEY')).toBe('v1');
    // Change backend value, cache should still return old
    await backend.set('KEY', 'v2');
    expect(await manager.get('KEY')).toBe('v1');
  });

  it('invalidates cache on set', async () => {
    const backend = new InMemorySecretBackend();
    manager = new SecretManager(backend, 60000);
    await backend.set('KEY', 'v1');
    await manager.get('KEY');
    await manager.set('KEY', 'v2');
    expect(await manager.get('KEY')).toBe('v2');
  });

  it('deletes secrets', async () => {
    await manager.set('KEY', 'value');
    await manager.delete('KEY');
    expect(await manager.get('KEY')).toBeNull();
  });

  it('lists keys', async () => {
    await manager.set('A', '1');
    await manager.set('B', '2');
    const keys = await manager.list();
    expect(keys).toContain('A');
    expect(keys).toContain('B');
  });

  it('checks if rotation needed', async () => {
    const backend = new InMemorySecretBackend();
    manager = new SecretManager(backend);
    await backend.set('KEY', 'value', { rotationDays: 0 });
    expect(await manager.needsRotation('KEY')).toBe(true);
  });

  it('returns false for rotation when no rotationDays set', async () => {
    await manager.set('KEY', 'value');
    expect(await manager.needsRotation('KEY')).toBe(false);
  });
});

describe('SecretManager singleton', () => {
  beforeEach(() => {
    resetSecretManager();
  });

  it('returns same instance', () => {
    expect(getSecretManager()).toBe(getSecretManager());
  });

  it('reset creates new instance', () => {
    const m1 = getSecretManager();
    resetSecretManager();
    const m2 = getSecretManager();
    expect(m1).not.toBe(m2);
  });
});

describe('SecretManager factories', () => {
  it('creates env-backed manager', () => {
    const m = createEnvSecretManager({ KEY: 'value' });
    expect(m).toBeInstanceOf(SecretManager);
  });

  it('creates in-memory manager', () => {
    const m = createInMemorySecretManager();
    expect(m).toBeInstanceOf(SecretManager);
  });

  it('creates vault-backed manager', () => {
    const m = createSecretManager(new VaultSecretBackend('url', 'token'));
    expect(m).toBeInstanceOf(SecretManager);
  });
});
