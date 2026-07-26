// ponytail: secret management abstraction — supports env, file, and Vault/KMS backends.
// Default: env vars. Swap for Vault/KMS in production.

/**
 * Secret metadata.
 */
export interface SecretMeta {
  createdAt: Date;
  key: string;
  rotationDays?: number;
  source: 'env' | 'file' | 'vault' | 'kms' | 'memory';
  version: number;
}

/**
 * Stored secret with metadata.
 */
export interface StoredSecret {
  meta: SecretMeta;
  value: string;
}

/**
 * Secret manager backend interface.
 */
export interface SecretBackend {
  get(key: string): Promise<StoredSecret | null>;
  list(): Promise<string[]>;
  set(key: string, value: string, meta?: Partial<SecretMeta>): Promise<StoredSecret>;
  delete(key: string): Promise<boolean>;
}

/**
 * Environment variable secret backend.
 * Reads from process.env; set operations are in-memory only.
 */
export class EnvSecretBackend implements SecretBackend {
  private overrides: Map<string, StoredSecret> = new Map();

  constructor(private env: NodeJS.ProcessEnv = process.env) {}

  async get(key: string): Promise<StoredSecret | null> {
    const override = this.overrides.get(key);
    if (override) return override;

    const value = this.env[key];
    if (!value) return null;

    return {
      meta: {
        createdAt: new Date(),
        key,
        source: 'env',
        version: 1,
      },
      value,
    };
  }

  async list(): Promise<string[]> {
    const envKeys = Object.keys(this.env);
    const overrideKeys = [...this.overrides.keys()];
    return [...new Set([...envKeys, ...overrideKeys])].sort();
  }

  async set(key: string, value: string, meta?: Partial<SecretMeta>): Promise<StoredSecret> {
    const secret: StoredSecret = {
      meta: {
        createdAt: new Date(),
        key,
        source: 'memory',
        version: 1,
        ...meta,
      },
      value,
    };
    this.overrides.set(key, secret);
    return secret;
  }

  async delete(key: string): Promise<boolean> {
    return this.overrides.delete(key);
  }
}

/**
 * In-memory secret backend (for testing).
 */
export class InMemorySecretBackend implements SecretBackend {
  private secrets: Map<string, StoredSecret> = new Map();

  async get(key: string): Promise<StoredSecret | null> {
    return this.secrets.get(key) ?? null;
  }

  async list(): Promise<string[]> {
    return [...this.secrets.keys()].sort();
  }

  async set(key: string, value: string, meta?: Partial<SecretMeta>): Promise<StoredSecret> {
    const existing = this.secrets.get(key);
    const secret: StoredSecret = {
      meta: {
        createdAt: existing?.meta.createdAt ?? new Date(),
        key,
        source: 'memory',
        version: (existing?.meta.version ?? 0) + 1,
        ...meta,
      },
      value,
    };
    this.secrets.set(key, secret);
    return secret;
  }

  async delete(key: string): Promise<boolean> {
    return this.secrets.delete(key);
  }

  clear(): void {
    this.secrets.clear();
  }
}

/**
 * Vault/KMS secret backend placeholder.
 * In production, replace with real HashiCorp Vault or AWS KMS client.
 * ponytail: interface only; real implementation injected at deployment.
 */
export class VaultSecretBackend implements SecretBackend {
  private cache: Map<string, StoredSecret> = new Map();

  constructor(
    private readonly vaultUrl: string,
    private readonly token: string,
    private readonly mountPath: string = 'secret'
  ) {
    // ponytail: real impl would open a Vault client here; stub caches in-memory.
    // Use void to satisfy noUnusedLocals until real HTTP impl lands.
    void this.vaultUrl;
    void this.token;
    void this.mountPath;
  }

  /** Vault endpoint URL (used by real HTTP implementation). */
  get endpoint(): string {
    return this.vaultUrl;
  }

  /** Vault mount path for secrets (used by real HTTP implementation). */
  get mount(): string {
    return this.mountPath;
  }

  async get(key: string): Promise<StoredSecret | null> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached) return cached;

    // In production: fetch from Vault via HTTP
    // ponytail: stub returns null; real impl calls vaultUrl/v1/{mountPath}/{key}
    return null;
  }

  async list(): Promise<string[]> {
    return [...this.cache.keys()].sort();
  }

  async set(key: string, value: string, meta?: Partial<SecretMeta>): Promise<StoredSecret> {
    // In production: write to Vault via HTTP
    const secret: StoredSecret = {
      meta: {
        createdAt: new Date(),
        key,
        source: 'vault',
        version: 1,
        ...meta,
      },
      value,
    };
    this.cache.set(key, secret);
    return secret;
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }
}

/**
 * Secret manager — wraps a backend with caching and rotation tracking.
 */
export class SecretManager {
  private cache: Map<string, { secret: StoredSecret; expiresAt: number }> = new Map();
  private readonly cacheTtlMs: number;

  constructor(
    private backend: SecretBackend,
    cacheTtlMs = 5 * 60 * 1000 // 5 min default cache
  ) {
    this.cacheTtlMs = cacheTtlMs;
  }

  /**
   * Get a secret value (with caching).
   */
  async get(key: string): Promise<string | null> {
    // Check cache
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.secret.value;
    }

    // Fetch from backend
    const secret = await this.backend.get(key);
    if (!secret) return null;

    this.cache.set(key, {
      expiresAt: Date.now() + this.cacheTtlMs,
      secret,
    });

    return secret.value;
  }

  /**
   * Set a secret.
   */
  async set(key: string, value: string): Promise<StoredSecret> {
    const secret = await this.backend.set(key, value);
    this.cache.delete(key); // invalidate cache
    return secret;
  }

  /**
   * Delete a secret.
   */
  async delete(key: string): Promise<boolean> {
    const result = await this.backend.delete(key);
    this.cache.delete(key);
    return result;
  }

  /**
   * List all secret keys.
   */
  async list(): Promise<string[]> {
    return this.backend.list();
  }

  /**
   * Check if a secret needs rotation.
   */
  async needsRotation(key: string): Promise<boolean> {
    const secret = await this.backend.get(key);
    if (secret?.meta.rotationDays === undefined || secret?.meta.rotationDays === null) return false;

    const ageMs = Date.now() - secret.meta.createdAt.getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    return ageDays >= secret.meta.rotationDays;
  }

  /**
   * Clear cache (for testing).
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * Default secret manager (env-backed).
 */
let defaultManager: SecretManager | null = null;

/**
 * Get or create the default secret manager (env backend).
 */
export function getSecretManager(): SecretManager {
  if (!defaultManager) {
    defaultManager = new SecretManager(new EnvSecretBackend());
  }
  return defaultManager;
}

/**
 * Reset the default manager (for testing).
 */
export function resetSecretManager(): void {
  defaultManager = null;
}

/**
 * Create a secret manager with a custom backend.
 */
export function createSecretManager(backend: SecretBackend, cacheTtlMs?: number): SecretManager {
  return new SecretManager(backend, cacheTtlMs);
}

/**
 * Create an env-backed secret manager.
 */
export function createEnvSecretManager(env?: NodeJS.ProcessEnv): SecretManager {
  return new SecretManager(new EnvSecretBackend(env));
}

/**
 * Create an in-memory secret manager (for testing).
 */
export function createInMemorySecretManager(): SecretManager {
  return new SecretManager(new InMemorySecretBackend());
}

/**
 * Create a Vault-backed secret manager.
 */
export function createVaultSecretManager(vaultUrl: string, token: string, mountPath?: string): SecretManager {
  return new SecretManager(new VaultSecretBackend(vaultUrl, token, mountPath));
}
