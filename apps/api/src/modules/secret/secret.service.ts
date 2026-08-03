import { Inject, Injectable } from '@nestjs/common';

import {
  createEnvSecretManager,
  createInMemorySecretManager,
  createVaultSecretManager,
  type SecretManager,
} from '@chai/domain';

import {
  decryptSecret,
  encryptSecret,
  SecretCryptoError,
} from './secret-crypto';

/**
 * SecretService (FASE 5): satu pintu untuk semua secret konektor / webhook /
 * payment provider.
 *
 * Nilai plaintext tidak pernah disimpan di kolom DB. Kolom DB hanya menyimpan
 * `secretRef` (referensi + versi kunci) yang dihasilkan oleh {@link store}.
 * Plaintext dienkripsi via `secret-crypto.ts` (AES-256-GCM) lalu disimpan ke
 * SecretManager (backend dari env: memory/file/vault).
 *
 * Reference format: `v1:{tenantId}:{key}:{version}`.
 *
 * Versi dikelola di vaultKey (bukan di meta backend) supaya rotasi konsisten
 * lintas backend yang mungkin tidak increment version (mis. EnvSecretBackend).
 *
 * Ponytail: SecretManager dari @chai/domain sudah ada — kita tidak menulis ulang
 * abstraksi backend, hanya menambah lapisan enkripsi + reference format.
 */
@Injectable()
export class SecretService {
  private readonly backend: SecretManager;

  constructor(
    @Inject('CHAI_SECRET_BACKEND')
    backend: SecretManager,
  ) {
    this.backend = backend;
  }

  /**
   * Simpan plaintext terenkripsi ke vault; return reference untuk disimpan
   * di kolom DB. Versi diambil dari `loadLatestVersion + 1` agar rotasi
   * menghasilkan versi baru yang unik.
   */
  async store(
    tenantId: string,
    key: string,
    plaintext: string,
  ): Promise<string> {
    const version = (await this.loadLatestVersion(tenantId, key)) + 1;
    const encrypted = encryptSecret(plaintext);
    const vaultKey = this.vaultKey(tenantId, key, version);
    await this.backend.set(vaultKey, encrypted);
    return this.formatRef(tenantId, key, version);
  }

  /**
   * Ambil plaintext dari vault berdasarkan reference. Versi dilampirkan di
   * reference; versi yang tidak ditemukan throw.
   */
  async retrieve(ref: string): Promise<string> {
    const parsed = this.parseRef(ref);
    const vaultKey = this.vaultKey(
      parsed.tenantId,
      parsed.key,
      parsed.version,
    );
    const encrypted = await this.backend.get(vaultKey);
    if (encrypted === null) {
      throw new SecretServiceError(
        `Secret reference not found in vault: ${parsed.tenantId}/${parsed.key}#${parsed.version}`,
      );
    }
    return decryptSecret(encrypted);
  }

  /**
   * Rotasi: simpan versi baru (latest+1) ke vault, return reference baru.
   * Caller bertanggung jawab menulis audit lewat AuditImmutabilityRepository.
   */
  async rotate(
    tenantId: string,
    key: string,
    newPlaintext: string,
  ): Promise<string> {
    return this.store(tenantId, key, newPlaintext);
  }

  /**
   * Cari versi terbaru untuk (tenantId, key) dengan scan key list backend.
   * Ponytail: O(n) scan atas key list — cukup untuk jumlah secret per-tenant
   * yang kecil; jika throughput rotasi tinggi, ganti dengan tabel khusus
   * `secret_version_index`.
   */
  private async loadLatestVersion(
    tenantId: string,
    key: string,
  ): Promise<number> {
    const prefix = `tenant:${tenantId}:secret:${key}:v`;
    let maxVersion = 0;
    try {
      const allKeys = await this.listVaultKeys();
      for (const k of allKeys) {
        if (k.startsWith(prefix)) {
          const v = Number(k.slice(prefix.length));
          if (Number.isFinite(v) && v > maxVersion) {
            maxVersion = v;
          }
        }
      }
    } catch {
      // Backend tanpa list support -> anggap versi 0 (insert pertama).
      maxVersion = 0;
    }
    return maxVersion;
  }

  private async listVaultKeys(): Promise<string[]> {
    // SecretManager tidak expose list() publik secara konsisten; fallback ke
    // list backend via duck-typing. Ponytail: jika tidak ada, treat as empty.
    const backend = this.backend as unknown as {
      list?: () => Promise<string[]>;
      backend?: { list?: () => Promise<string[]> };
    };
    if (typeof backend.list === 'function') {
      return backend.list();
    }
    if (backend.backend && typeof backend.backend.list === 'function') {
      return backend.backend.list();
    }
    return [];
  }

  private vaultKey(tenantId: string, key: string, version: number): string {
    return `tenant:${tenantId}:secret:${key}:v${version}`;
  }

  private formatRef(tenantId: string, key: string, version: number): string {
    return `v1:${tenantId}:${key}:${version}`;
  }

  private parseRef(ref: string): {
    tenantId: string;
    key: string;
    version: number;
  } {
    const parts = ref.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new SecretServiceError(`Malformed secret reference: ${ref}`);
    }
    const version = Number(parts[3]);
    if (!Number.isFinite(version) || version < 1) {
      throw new SecretServiceError(`Malformed secret version in ref: ${ref}`);
    }
    return {
      tenantId: parts[1] as string,
      key: parts[2] as string,
      version,
    };
  }
}

export class SecretServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretServiceError';
  }
}

/**
 * Factory: pilih backend SecretManager berdasarkan env.
 *
 * - `CHAI_SECRET_BACKEND=vault` -> Vault (URL + token dari env).
 * - `CHAI_SECRET_BACKEND=memory` -> in-memory (hanya untuk test/dev lokal).
 * - default -> env backend (memory fallback untuk dev/test).
 *
 * Ponytail: tidak ada dependency baru — semua backend sudah ada di @chai/domain.
 */
export function createSecretBackendFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SecretManager {
  // ponytail: key divalidasi lazy (saat store/retrieve pertama) agar dev/test
  // tanpa CHAI_SECRET_MASTER_KEY tetap bisa bootstrap server — konsisten
  // dengan mfa-secret-crypto. Operasi secret tanpa key throw keras saat
  // dipanggil, tidak pernah menyimpan plaintext diam-diam.

  const backend = env.CHAI_SECRET_BACKEND?.toLowerCase();
  if (backend === 'vault') {
    const url = env.CHAI_VAULT_URL;
    const token = env.CHAI_VAULT_TOKEN;
    if (!url || !token) {
      throw new Error(
        'CHAI_SECRET_BACKEND=vault requires CHAI_VAULT_URL and CHAI_VAULT_TOKEN.',
      );
    }
    return createVaultSecretManager(url, token, env.CHAI_VAULT_MOUNT_PATH);
  }
  if (backend === 'memory') {
    return createInMemorySecretManager();
  }
  return createEnvSecretManager();
}

export { SecretCryptoError };
