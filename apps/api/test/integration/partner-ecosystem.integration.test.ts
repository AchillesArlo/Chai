import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_TENANT_B_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresPartnerEcosystemRepository } from '../../src/modules/partner-ecosystem/postgres-partner-ecosystem.repository';

describe('API Postgres partner-ecosystem repository (Fase 4.5)', () => {
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

  it('persists a partner, an API key, an API version, an SDK release and rate limit usage across a new instance', async () => {
    const writer = new PostgresPartnerEcosystemRepository(runtime);

    const partner = await writer.createPartner(API_TENANT_ID, {
      contactEmail: 'dev@partner.example.com',
      description: 'integration partner',
      name: 'Acme Integrations',
      status: 'approved',
      tenantId: API_TENANT_ID,
    });

    const created = await writer.createApiKey(API_TENANT_ID, {
      expiresAt: null,
      isActive: true,
      name: 'production key',
      partnerId: partner.id,
      rateLimitPerMinute: 120,
      scopes: ['conversations.read', 'conversations.write'],
      tenantId: API_TENANT_ID,
    });
    expect(created.keyRaw.startsWith('chai_')).toBe(true);
    expect(created.keyPrefix).toBe(created.keyRaw.substring(0, 12));

    // chai.api_version / chai.sdk_release are platform-global (no tenantId).
    const apiVersion = await writer.createApiVersion({
      changelog: 'initial release',
      releaseDate: '2026-01-01',
      status: 'active',
      sunsetDate: null,
      version: 'v1',
    });

    const sdkRelease = await writer.createSdkRelease({
      apiVersionId: apiVersion.id,
      language: 'nodejs',
      packageUrl: 'https://npm.example.com/chai-sdk',
      publishedAt: new Date().toISOString(),
      releaseNotes: 'first SDK release',
      repositoryUrl: 'https://github.com/example/chai-sdk',
      version: '1.0.0',
    });

    const usage = await writer.incrementRateLimit(API_TENANT_ID, created.id);
    expect(usage.requestCount).toBe(1);
    const usageAgain = await writer.incrementRateLimit(API_TENANT_ID, created.id);
    expect(usageAgain.requestCount).toBe(2);
    expect(usageAgain.id).toBe(usage.id);

    // Round-trip through a brand-new repository instance — proves the data
    // lives in Postgres, not in the writer's process memory.
    const reader = new PostgresPartnerEcosystemRepository(runtime);

    const fetchedPartner = await reader.getPartner(API_TENANT_ID, partner.id);
    expect(fetchedPartner?.name).toBe('Acme Integrations');

    const keys = await reader.listApiKeys(API_TENANT_ID, partner.id);
    expect(keys.some((row) => row.id === created.id)).toBe(true);
    // The raw key is never persisted — only its hash — so it must not leak
    // back out of a subsequent read.
    expect(keys[0]).not.toHaveProperty('keyRaw');

    const fetchedVersion = await reader.getApiVersion('v1');
    expect(fetchedVersion?.id).toBe(apiVersion.id);

    const releases = await reader.listSdkReleases(apiVersion.id, 'nodejs');
    expect(releases.some((row) => row.id === sdkRelease.id)).toBe(true);

    const usages = await reader.getRateLimitUsage(API_TENANT_ID, created.id);
    expect(usages.find((row) => row.id === usage.id)?.requestCount).toBe(2);

    // revokeApiKey exercises the DELETE grant on chai.api_key. rate_limit_usage
    // FKs to api_key, so those rows are cleared first (admin, out of band).
    await admin`DELETE FROM chai.rate_limit_usage WHERE api_key_id = ${created.id}`;
    await reader.revokeApiKey(API_TENANT_ID, created.id);
    expect(
      (await reader.listApiKeys(API_TENANT_ID, partner.id)).some(
        (row) => row.id === created.id,
      ),
    ).toBe(false);
  });

  it('isolates partners and API keys by tenant under RLS', async () => {
    const repo = new PostgresPartnerEcosystemRepository(runtime);
    const partner = await repo.createPartner(API_TENANT_ID, {
      contactEmail: 'tenant-a@partner.example.com',
      description: null,
      name: 'tenant-only-partner',
      status: 'pending',
      tenantId: API_TENANT_ID,
    });

    const crossTenantPartners = await repo.listPartners(API_TENANT_B_ID);
    expect(crossTenantPartners.some((row) => row.id === partner.id)).toBe(false);
    expect(await repo.getPartner(API_TENANT_B_ID, partner.id)).toBeNull();

    const created = await repo.createApiKey(API_TENANT_ID, {
      expiresAt: null,
      isActive: true,
      name: 'tenant-only-key',
      partnerId: partner.id,
      rateLimitPerMinute: 60,
      scopes: [],
      tenantId: API_TENANT_ID,
    });
    const crossTenantKeys = await repo.listApiKeys(API_TENANT_B_ID, partner.id);
    expect(crossTenantKeys.some((row) => row.id === created.id)).toBe(false);
  });
});
