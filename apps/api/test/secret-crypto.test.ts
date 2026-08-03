import { beforeEach, describe, expect, it } from 'vitest';

import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  loadSecretMasterKey,
  SecretCryptoError,
} from '../src/modules/secret/secret-crypto';
import {
  createSecretBackendFromEnv,
  SecretService,
  SecretServiceError,
} from '../src/modules/secret/secret.service';

const TEST_KEY = 'a'.repeat(64); // 32-byte hex

describe('secret-crypto', () => {
  beforeEach(() => {
    process.env.CHAI_SECRET_MASTER_KEY = TEST_KEY;
  });

  it('encrypts and decrypts a secret round-trip', () => {
    const plaintext = 'whsec_super_secret_value_123';
    const encrypted = encryptSecret(plaintext);
    expect(isEncryptedSecret(encrypted)).toBe(true);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertexts for same plaintext (random IV)', () => {
    const a = encryptSecret('same');
    const b = encryptSecret('same');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('same');
    expect(decryptSecret(b)).toBe('same');
  });

  it('throws on tampered auth tag (GCM integrity)', () => {
    const encrypted = encryptSecret('value');
    const parts = encrypted.split('.');
    const tampered = [
      parts[0],
      parts[1],
      Buffer.from('AAAAAAAAAAAAAAAAAAAAAA==', 'base64').toString('base64'),
      parts[3],
    ].join('.');
    expect(() => decryptSecret(tampered)).toThrow(SecretCryptoError);
  });

  it('throws when CHAI_SECRET_MASTER_KEY is missing', () => {
    delete process.env.CHAI_SECRET_MASTER_KEY;
    expect(() => loadSecretMasterKey()).toThrow(SecretCryptoError);
  });

  it('throws when CHAI_SECRET_MASTER_KEY is wrong length', () => {
    process.env.CHAI_SECRET_MASTER_KEY = 'tooshort';
    expect(() => loadSecretMasterKey()).toThrow(SecretCryptoError);
  });
});

describe('SecretService', () => {
  beforeEach(() => {
    process.env.CHAI_SECRET_MASTER_KEY = TEST_KEY;
    process.env.CHAI_SECRET_BACKEND = 'memory';
  });

  it('store returns a v1 reference and retrieve decrypts it back', async () => {
    const svc = new SecretService(createSecretBackendFromEnv());
    const ref = await svc.store(
      '01890f47-9b3c-7cc2-98e8-123456789001',
      'midtrans_server_key',
      'SB-Mid-server-abc123',
    );
    expect(ref).toMatch(/^v1:01890f47-[^:]+:midtrans_server_key:\d+$/u);
    expect(await svc.retrieve(ref)).toBe('SB-Mid-server-abc123');
  });

  it('rotate produces a new version with the new value', async () => {
    const svc = new SecretService(createSecretBackendFromEnv());
    const tenantId = '01890f47-9b3c-7cc2-98e8-123456789002';
    const ref1 = await svc.store(tenantId, 'k', 'old');
    const ref2 = await svc.rotate(tenantId, 'k', 'new');
    expect(ref1).not.toBe(ref2);
    expect(await svc.retrieve(ref1)).toBe('old');
    expect(await svc.retrieve(ref2)).toBe('new');
  });

  it('retrieve throws SecretServiceError for unknown reference', async () => {
    const svc = new SecretService(createSecretBackendFromEnv());
    await expect(
      svc.retrieve('v1:01890f47-9b3c-7cc2-98e8-123456789099:k:999'),
    ).rejects.toThrow(SecretServiceError);
  });

  it('retrieve throws on malformed reference', async () => {
    const svc = new SecretService(createSecretBackendFromEnv());
    await expect(svc.retrieve('not-a-ref')).rejects.toThrow(SecretServiceError);
  });
});
