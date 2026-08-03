import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_CLIENT_OWNER_ID, API_TENANT_B_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresConnectorConfigRepository } from '../../src/modules/connector-config/postgres-connector-config.repository';

describe('API Postgres connector-config repository (Fase 5.3)', () => {
  const adminUrl = inject('adminDatabaseUrl') as string;
  const runtimeUrl = inject('runtimeDatabaseUrl') as string;
  let admin: ReturnType<typeof createDatabase>;
  let runtime: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    admin = createDatabase(adminUrl);
    runtime = createDatabase(runtimeUrl);
    await seedApiRuntime(admin);
  });

  afterAll(async () => {
    await runtime.end();
    await admin.end();
  });

  it('persists a config and its secret across a new instance, and honours the delete grants', async () => {
    const writer = new PostgresConnectorConfigRepository(runtime);

    const config = await writer.createConfig(API_TENANT_ID, {
      configHash: 'hash-abc',
      configSchema: { phoneNumberId: 'string' },
      configValuesEncrypted: null,
      connectorProvider: 'meta',
      connectorType: 'whatsapp',
      createdBy: API_CLIENT_OWNER_ID,
      description: 'production WhatsApp connector',
      lastError: null,
      lastTestedAt: null,
      name: 'WhatsApp Production',
      status: 'active',
      updatedBy: null,
    });

    const secret = await writer.createSecret(API_TENANT_ID, {
      connectorConfigId: config.id,
      rotatedAt: null,
      rotatedBy: null,
      secretKey: 'api_key',
      secretValueRef: 'v1:tenant-a:api_key:1',
      secretValueLegacyEncrypted: null,
      secretVersion: 1,
    });

    // Round-trip through a brand-new repository instance — proves the data
    // lives in Postgres, not in the writer's process memory.
    const reader = new PostgresConnectorConfigRepository(runtime);

    const fetchedConfig = await reader.getConfig(API_TENANT_ID, config.id);
    expect(fetchedConfig?.configSchema).toEqual({ phoneNumberId: 'string' });

    const secrets = await reader.listSecrets(API_TENANT_ID, config.id);
    expect(secrets.some((row) => row.id === secret.id)).toBe(true);
    expect(secrets[0]?.secretValueRef).toBe('v1:tenant-a:api_key:1');

    const updated = await reader.updateConfig(API_TENANT_ID, config.id, {
      lastTestedAt: new Date().toISOString(),
      status: 'testing',
    });
    expect(updated.status).toBe('testing');

    // deleteSecret exercises the DELETE grant on public.connector_secrets.
    await reader.deleteSecret(API_TENANT_ID, secret.id);
    expect(
      (await reader.listSecrets(API_TENANT_ID, config.id)).some((row) => row.id === secret.id),
    ).toBe(false);

    // deleteConfig exercises the DELETE grant on public.connector_configs
    // (connector_secrets has ON DELETE CASCADE, but the secret above is
    // already gone).
    await reader.deleteConfig(API_TENANT_ID, config.id);
    expect(await reader.getConfig(API_TENANT_ID, config.id)).toBeNull();
  });

  it('isolates configs and secrets by tenant under RLS', async () => {
    const repo = new PostgresConnectorConfigRepository(runtime);
    const config = await repo.createConfig(API_TENANT_ID, {
      configHash: 'hash-tenant-a',
      configSchema: {},
      configValuesEncrypted: null,
      connectorProvider: 'telegram',
      connectorType: 'telegram',
      createdBy: API_CLIENT_OWNER_ID,
      description: null,
      lastError: null,
      lastTestedAt: null,
      name: 'tenant-only-connector',
      status: 'inactive',
      updatedBy: null,
    });

    const crossTenantConfigs = await repo.listConfigs(API_TENANT_B_ID);
    expect(crossTenantConfigs.some((row) => row.id === config.id)).toBe(false);
    expect(await repo.getConfig(API_TENANT_B_ID, config.id)).toBeNull();

    const secret = await repo.createSecret(API_TENANT_ID, {
      connectorConfigId: config.id,
      rotatedAt: null,
      rotatedBy: null,
      secretKey: 'bot_token',
      secretValueRef: 'v1:tenant-a:bot_token:1',
      secretValueLegacyEncrypted: null,
      secretVersion: 1,
    });
    // Tenant B cannot see tenant A's secrets even by the parent config id,
    // because the parent-scoped RLS policy resolves through current_tenant_id().
    const crossTenantSecrets = await repo.listSecrets(API_TENANT_B_ID, config.id);
    expect(crossTenantSecrets.some((row) => row.id === secret.id)).toBe(false);
  });
});
