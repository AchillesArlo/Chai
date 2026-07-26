import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryPartnerEcosystemRepository } from '../src/modules/partner-ecosystem/partner-ecosystem.repository';

describe('PartnerEcosystemRepository', () => {
  let repo: InMemoryPartnerEcosystemRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryPartnerEcosystemRepository();
  });

  describe('Partners', () => {
    it('should create partner', async () => {
      const partner = await repo.createPartner(tenantId, {
        tenantId,
        name: 'Acme Corp',
        description: 'Integration partner',
        contactEmail: 'dev@acme.com',
        status: 'pending',
      });

      expect(partner.id).toBeDefined();
      expect(partner.name).toBe('Acme Corp');
      expect(partner.status).toBe('pending');
    });

    it('should list partners for tenant', async () => {
      await repo.createPartner(tenantId, {
        tenantId,
        name: 'Partner 1',
        description: null,
        contactEmail: 'p1@example.com',
        status: 'approved',
      });

      await repo.createPartner(tenantId, {
        tenantId,
        name: 'Partner 2',
        description: null,
        contactEmail: 'p2@example.com',
        status: 'approved',
      });

      const partners = await repo.listPartners(tenantId);
      expect(partners).toHaveLength(2);
    });

    it('should update partner status', async () => {
      const partner = await repo.createPartner(tenantId, {
        tenantId,
        name: 'Test Partner',
        description: null,
        contactEmail: 'test@example.com',
        status: 'pending',
      });

      const updated = await repo.updatePartner(tenantId, partner.id, {
        status: 'approved',
      });

      expect(updated.status).toBe('approved');
    });
  });

  describe('API Keys', () => {
    it('should create API key with raw key', async () => {
      const partner = await repo.createPartner(tenantId, {
        tenantId,
        name: 'Test Partner',
        description: null,
        contactEmail: 'test@example.com',
        status: 'approved',
      });

      const result = await repo.createApiKey(tenantId, {
        partnerId: partner.id,
        tenantId,
        name: 'Production Key',
        scopes: ['read', 'write'],
        rateLimitPerMinute: 100,
        expiresAt: null,
        isActive: true,
      });

      expect(result.id).toBeDefined();
      expect(result.keyRaw).toBeDefined();
      expect(result.keyRaw).toMatch(/^chai_/);
      expect(result.keyPrefix).toBe(result.keyRaw.substring(0, 12));
    });

    it('should list API keys by partner', async () => {
      const partner = await repo.createPartner(tenantId, {
        tenantId,
        name: 'Test Partner',
        description: null,
        contactEmail: 'test@example.com',
        status: 'approved',
      });

      await repo.createApiKey(tenantId, {
        partnerId: partner.id,
        tenantId,
        name: 'Key 1',
        scopes: ['read'],
        rateLimitPerMinute: 60,
        expiresAt: null,
        isActive: true,
      });

      await repo.createApiKey(tenantId, {
        partnerId: partner.id,
        tenantId,
        name: 'Key 2',
        scopes: ['write'],
        rateLimitPerMinute: 60,
        expiresAt: null,
        isActive: true,
      });

      const keys = await repo.listApiKeys(tenantId, partner.id);
      expect(keys).toHaveLength(2);
    });

    it('should revoke API key', async () => {
      const partner = await repo.createPartner(tenantId, {
        tenantId,
        name: 'Test Partner',
        description: null,
        contactEmail: 'test@example.com',
        status: 'approved',
      });

      const result = await repo.createApiKey(tenantId, {
        partnerId: partner.id,
        tenantId,
        name: 'Test Key',
        scopes: [],
        rateLimitPerMinute: 60,
        expiresAt: null,
        isActive: true,
      });

      await repo.revokeApiKey(tenantId, result.id);

      const keys = await repo.listApiKeys(tenantId, partner.id);
      expect(keys).toHaveLength(0);
    });
  });

  describe('API Versions', () => {
    it('should create API version', async () => {
      const version = await repo.createApiVersion({
        version: 'v1.0.0',
        status: 'active',
        releaseDate: '2026-01-01',
        sunsetDate: null,
        changelog: 'Initial release',
      });

      expect(version.id).toBeDefined();
      expect(version.version).toBe('v1.0.0');
      expect(version.status).toBe('active');
    });

    it('should list all API versions', async () => {
      await repo.createApiVersion({
        version: 'v1.0.0',
        status: 'active',
        releaseDate: '2026-01-01',
        sunsetDate: null,
        changelog: null,
      });

      await repo.createApiVersion({
        version: 'v2.0.0',
        status: 'active',
        releaseDate: '2026-02-01',
        sunsetDate: null,
        changelog: null,
      });

      const versions = await repo.listApiVersions();
      expect(versions).toHaveLength(2);
    });

    it('should deprecate API version', async () => {
      const version = await repo.createApiVersion({
        version: 'v1.0.0',
        status: 'active',
        releaseDate: '2026-01-01',
        sunsetDate: null,
        changelog: null,
      });

      const updated = await repo.updateApiVersion(version.id, {
        status: 'deprecated',
        sunsetDate: '2026-12-31',
      });

      expect(updated.status).toBe('deprecated');
      expect(updated.sunsetDate).toBe('2026-12-31');
    });
  });

  describe('SDK Releases', () => {
    it('should create SDK release', async () => {
      const apiVersion = await repo.createApiVersion({
        version: 'v1.0.0',
        status: 'active',
        releaseDate: '2026-01-01',
        sunsetDate: null,
        changelog: null,
      });

      const release = await repo.createSdkRelease({
        apiVersionId: apiVersion.id,
        language: 'nodejs',
        version: '1.0.0',
        packageUrl: 'https://www.npmjs.com/package/@chai/sdk',
        repositoryUrl: 'https://github.com/chai/sdk-nodejs',
        releaseNotes: 'Initial release',
        publishedAt: '2026-01-15T10:00:00Z',
      });

      expect(release.id).toBeDefined();
      expect(release.language).toBe('nodejs');
    });

    it('should list SDK releases by language', async () => {
      const apiVersion = await repo.createApiVersion({
        version: 'v1.0.0',
        status: 'active',
        releaseDate: '2026-01-01',
        sunsetDate: null,
        changelog: null,
      });

      await repo.createSdkRelease({
        apiVersionId: apiVersion.id,
        language: 'nodejs',
        version: '1.0.0',
        packageUrl: 'https://npmjs.com/package/@chai/sdk',
        repositoryUrl: null,
        releaseNotes: null,
        publishedAt: '2026-01-15T10:00:00Z',
      });

      await repo.createSdkRelease({
        apiVersionId: apiVersion.id,
        language: 'python',
        version: '1.0.0',
        packageUrl: 'https://pypi.org/project/chai-sdk',
        repositoryUrl: null,
        releaseNotes: null,
        publishedAt: '2026-01-15T10:00:00Z',
      });

      const nodeReleases = await repo.listSdkReleases(apiVersion.id, 'nodejs');
      expect(nodeReleases).toHaveLength(1);

      const allReleases = await repo.listSdkReleases(apiVersion.id);
      expect(allReleases).toHaveLength(2);
    });
  });

  describe('Rate Limit Usage', () => {
    it('should increment rate limit', async () => {
      const partner = await repo.createPartner(tenantId, {
        tenantId,
        name: 'Test Partner',
        description: null,
        contactEmail: 'test@example.com',
        status: 'approved',
      });

      const apiKey = await repo.createApiKey(tenantId, {
        partnerId: partner.id,
        tenantId,
        name: 'Test Key',
        scopes: [],
        rateLimitPerMinute: 60,
        expiresAt: null,
        isActive: true,
      });

      const usage = await repo.incrementRateLimit(tenantId, apiKey.id);
      expect(usage.requestCount).toBe(1);

      const usage2 = await repo.incrementRateLimit(tenantId, apiKey.id);
      expect(usage2.requestCount).toBe(2);
    });

    it('should get rate limit usage history', async () => {
      const partner = await repo.createPartner(tenantId, {
        tenantId,
        name: 'Test Partner',
        description: null,
        contactEmail: 'test@example.com',
        status: 'approved',
      });

      const apiKey = await repo.createApiKey(tenantId, {
        partnerId: partner.id,
        tenantId,
        name: 'Test Key',
        scopes: [],
        rateLimitPerMinute: 60,
        expiresAt: null,
        isActive: true,
      });

      await repo.incrementRateLimit(tenantId, apiKey.id);
      await repo.incrementRateLimit(tenantId, apiKey.id);

      const usage = await repo.getRateLimitUsage(tenantId, apiKey.id);
      expect(usage.length).toBeGreaterThan(0);
      expect(usage[0]?.requestCount).toBe(2);
    });
  });
});
