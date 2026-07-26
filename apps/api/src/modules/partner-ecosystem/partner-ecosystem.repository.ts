import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface Partner {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  contactEmail: string;
  status: 'pending' | 'approved' | 'suspended' | 'revoked';
  createdAt: string;
  updatedAt: string;
}

export interface ApiKey {
  id: string;
  partnerId: string;
  tenantId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimitPerMinute: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiVersion {
  id: string;
  version: string;
  status: 'active' | 'deprecated' | 'sunset';
  releaseDate: string;
  sunsetDate: string | null;
  changelog: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SdkRelease {
  id: string;
  apiVersionId: string;
  language: 'python' | 'nodejs' | 'go' | 'java' | 'ruby';
  version: string;
  packageUrl: string;
  repositoryUrl: string | null;
  releaseNotes: string | null;
  publishedAt: string;
}

export interface RateLimitUsage {
  id: string;
  apiKeyId: string;
  tenantId: string;
  windowStart: string;
  requestCount: number;
  createdAt: string;
}

export abstract class PartnerEcosystemRepository {
  abstract listPartners(tenantId: string): Promise<Partner[]>;
  abstract getPartner(tenantId: string, id: string): Promise<Partner | null>;
  abstract createPartner(tenantId: string, partner: Omit<Partner, 'id' | 'createdAt' | 'updatedAt'>): Promise<Partner>;
  abstract updatePartner(tenantId: string, id: string, update: Partial<Partner>): Promise<Partner>;

  abstract listApiKeys(tenantId: string, partnerId?: string): Promise<ApiKey[]>;
  abstract createApiKey(tenantId: string, key: Omit<ApiKey, 'id' | 'createdAt' | 'updatedAt' | 'keyPrefix' | 'lastUsedAt'>): Promise<ApiKey & { keyRaw: string }>;
  abstract revokeApiKey(tenantId: string, id: string): Promise<void>;

  abstract listApiVersions(): Promise<ApiVersion[]>;
  abstract getApiVersion(version: string): Promise<ApiVersion | null>;
  abstract createApiVersion(version: Omit<ApiVersion, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiVersion>;
  abstract updateApiVersion(id: string, update: Partial<ApiVersion>): Promise<ApiVersion>;

  abstract listSdkReleases(apiVersionId?: string, language?: string): Promise<SdkRelease[]>;
  abstract createSdkRelease(release: Omit<SdkRelease, 'id'>): Promise<SdkRelease>;

  abstract getRateLimitUsage(tenantId: string, apiKeyId: string): Promise<RateLimitUsage[]>;
  abstract incrementRateLimit(tenantId: string, apiKeyId: string): Promise<RateLimitUsage>;
}

@Injectable()
export class InMemoryPartnerEcosystemRepository extends PartnerEcosystemRepository {
  private partners = new Map<string, Partner>();
  private apiKeys = new Map<string, ApiKey>();
  private apiVersions = new Map<string, ApiVersion>();
  private sdkReleases = new Map<string, SdkRelease>();
  private rateLimits = new Map<string, RateLimitUsage>();

  async listPartners(tenantId: string): Promise<Partner[]> {
    return Array.from(this.partners.values()).filter(p => p.tenantId === tenantId);
  }

  async getPartner(tenantId: string, id: string): Promise<Partner | null> {
    const p = this.partners.get(id);
    return p && p.tenantId === tenantId ? p : null;
  }

  async createPartner(tenantId: string, partner: Omit<Partner, 'id' | 'createdAt' | 'updatedAt'>): Promise<Partner> {
    const now = new Date().toISOString();
    const created = { ...partner, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.partners.set(created.id, created);
    return created;
  }

  async updatePartner(tenantId: string, id: string, update: Partial<Partner>): Promise<Partner> {
    const existing = this.partners.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Partner not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.partners.set(id, updated);
    return updated;
  }

  async listApiKeys(tenantId: string, partnerId?: string): Promise<ApiKey[]> {
    return Array.from(this.apiKeys.values()).filter(
      k => k.tenantId === tenantId && (!partnerId || k.partnerId === partnerId)
    );
  }

  async createApiKey(tenantId: string, key: Omit<ApiKey, 'id' | 'createdAt' | 'updatedAt' | 'keyPrefix' | 'lastUsedAt'>): Promise<ApiKey & { keyRaw: string }> {
    const now = new Date().toISOString();
    const keyRaw = `chai_${randomUUID().replace(/-/g, '')}`;
    const keyPrefix = keyRaw.substring(0, 12);
    const created: ApiKey = {
      ...key,
      tenantId,
      id: randomUUID(),
      keyPrefix,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.apiKeys.set(created.id, created);
    return { ...created, keyRaw };
  }

  async revokeApiKey(tenantId: string, id: string): Promise<void> {
    const existing = this.apiKeys.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('API key not found');
    this.apiKeys.delete(id);
  }

  async listApiVersions(): Promise<ApiVersion[]> {
    return Array.from(this.apiVersions.values());
  }

  async getApiVersion(version: string): Promise<ApiVersion | null> {
    return Array.from(this.apiVersions.values()).find(v => v.version === version) || null;
  }

  async createApiVersion(version: Omit<ApiVersion, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiVersion> {
    const now = new Date().toISOString();
    const created = { ...version, id: randomUUID(), createdAt: now, updatedAt: now };
    this.apiVersions.set(created.id, created);
    return created;
  }

  async updateApiVersion(id: string, update: Partial<ApiVersion>): Promise<ApiVersion> {
    const existing = this.apiVersions.get(id);
    if (!existing) throw new Error('API version not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.apiVersions.set(id, updated);
    return updated;
  }

  async listSdkReleases(apiVersionId?: string, language?: string): Promise<SdkRelease[]> {
    return Array.from(this.sdkReleases.values()).filter(
      r => (!apiVersionId || r.apiVersionId === apiVersionId) && (!language || r.language === language)
    );
  }

  async createSdkRelease(release: Omit<SdkRelease, 'id'>): Promise<SdkRelease> {
    const created = { ...release, id: randomUUID() };
    this.sdkReleases.set(created.id, created);
    return created;
  }

  async getRateLimitUsage(tenantId: string, apiKeyId: string): Promise<RateLimitUsage[]> {
    return Array.from(this.rateLimits.values()).filter(
      r => r.tenantId === tenantId && r.apiKeyId === apiKeyId
    );
  }

  async incrementRateLimit(tenantId: string, apiKeyId: string): Promise<RateLimitUsage> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - (now.getTime() % 60000)).toISOString();

    const existing = Array.from(this.rateLimits.values()).find(
      r => r.tenantId === tenantId && r.apiKeyId === apiKeyId && r.windowStart === windowStart
    );

    if (existing) {
      existing.requestCount++;
      return existing;
    }

    const created: RateLimitUsage = {
      id: randomUUID(),
      apiKeyId,
      tenantId,
      windowStart,
      requestCount: 1,
      createdAt: now.toISOString(),
    };
    this.rateLimits.set(created.id, created);
    return created;
  }
}
