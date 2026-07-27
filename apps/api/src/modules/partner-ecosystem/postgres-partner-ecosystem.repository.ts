import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import {
  withPrincipalTransaction,
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import {
  PartnerEcosystemRepository,
  type ApiKey,
  type ApiVersion,
  type Partner,
  type RateLimitUsage,
  type SdkRelease,
} from './partner-ecosystem.repository';

/** Bentuk baris chai.partner. */
interface PartnerRow {
  contact_email: string;
  created_at: Date;
  description: string | null;
  id: string;
  name: string;
  status: Partner['status'];
  tenant_id: string;
  updated_at: Date;
}

/**
 * Bentuk baris chai.api_key. `key_hash` adalah NOT NULL di database tapi tidak
 * diekspos oleh ApiKey — kontrak hanya pernah mengembalikan `keyRaw` sekali
 * saat pembuatan (lihat createApiKey), hash disimpan agar tak bisa dibalik.
 */
interface ApiKeyRow {
  created_at: Date;
  expires_at: Date | null;
  id: string;
  is_active: boolean;
  key_prefix: string;
  last_used_at: Date | null;
  name: string;
  partner_id: string;
  rate_limit_per_minute: number;
  scopes: string[];
  tenant_id: string;
  updated_at: Date;
}

/** Bentuk baris chai.api_version. TANPA tenant_id — registry global. */
interface ApiVersionRow {
  changelog: string | null;
  created_at: Date;
  id: string;
  release_date: string;
  status: ApiVersion['status'];
  sunset_date: string | null;
  updated_at: Date;
  version: string;
}

/** Bentuk baris chai.sdk_release. TANPA tenant_id — registry global. */
interface SdkReleaseRow {
  api_version_id: string;
  id: string;
  language: SdkRelease['language'];
  package_url: string;
  published_at: Date;
  release_notes: string | null;
  repository_url: string | null;
  version: string;
}

/** Bentuk baris chai.rate_limit_usage. */
interface RateLimitUsageRow {
  api_key_id: string;
  created_at: Date;
  id: string;
  request_count: number;
  tenant_id: string;
  window_start: Date;
}

const API_KEY_HASH_ALGORITHM = 'sha256';

@Injectable()
export class PostgresPartnerEcosystemRepository extends PartnerEcosystemRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listPartners(tenantId: string): Promise<Partner[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<PartnerRow[]>`
        SELECT * FROM chai.partner
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapPartner(row));
    });
  }

  override async getPartner(tenantId: string, id: string): Promise<Partner | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<PartnerRow[]>`
        SELECT * FROM chai.partner
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapPartner(rows[0]) : null;
    });
  }

  override async createPartner(
    tenantId: string,
    partner: Omit<Partner, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Partner> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<PartnerRow[]>`
        INSERT INTO chai.partner (
          id, tenant_id, name, description, contact_email, status
        ) VALUES (
          ${id}, ${tenantId}, ${partner.name}, ${partner.description},
          ${partner.contactEmail}, ${partner.status}
        )
        RETURNING *
      `;
      return mapPartner(requireRow(rows));
    });
  }

  override async updatePartner(
    tenantId: string,
    id: string,
    update: Partial<Partner>,
  ): Promise<Partner> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadPartner(tx, tenantId, id);
      if (!existing) throw new Error('Partner not found');
      const merged = { ...existing, ...update };
      const rows = await tx<PartnerRow[]>`
        UPDATE chai.partner SET
          name = ${merged.name},
          description = ${merged.description},
          contact_email = ${merged.contactEmail},
          status = ${merged.status},
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapPartner(requireRow(rows));
    });
  }

  override async listApiKeys(tenantId: string, partnerId?: string): Promise<ApiKey[]> {
    const filter = partnerId ?? null;
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ApiKeyRow[]>`
        SELECT * FROM chai.api_key
        WHERE tenant_id = ${tenantId}
          AND (${filter}::uuid IS NULL OR partner_id = ${filter}::uuid)
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapApiKey(row));
    });
  }

  override async createApiKey(
    tenantId: string,
    key: Omit<ApiKey, 'id' | 'createdAt' | 'updatedAt' | 'keyPrefix' | 'lastUsedAt'>,
  ): Promise<ApiKey & { keyRaw: string }> {
    const id = randomUUID();
    const keyRaw = `chai_${randomUUID().replace(/-/g, '')}`;
    const keyPrefix = keyRaw.substring(0, 12);
    const keyHash = createHash(API_KEY_HASH_ALGORITHM).update(keyRaw).digest('hex');
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ApiKeyRow[]>`
        INSERT INTO chai.api_key (
          id, partner_id, tenant_id, name, key_hash, key_prefix, scopes,
          rate_limit_per_minute, expires_at, is_active
        ) VALUES (
          ${id}, ${key.partnerId}, ${tenantId}, ${key.name}, ${keyHash},
          ${keyPrefix}, ${key.scopes}, ${key.rateLimitPerMinute},
          ${key.expiresAt}::timestamptz, ${key.isActive}
        )
        RETURNING *
      `;
      return { ...mapApiKey(requireRow(rows)), keyRaw };
    });
  }

  override async revokeApiKey(tenantId: string, id: string): Promise<void> {
    await this.tx(tenantId, async (tx) => {
      const result = await tx`
        DELETE FROM chai.api_key
        WHERE tenant_id = ${tenantId} AND id = ${id}
      `;
      if (result.count === 0) throw new Error('API key not found');
    });
  }

  override async listApiVersions(): Promise<ApiVersion[]> {
    return this.globalTx(async (tx) => {
      const rows = await tx<ApiVersionRow[]>`
        SELECT * FROM chai.api_version
        ORDER BY release_date DESC
      `;
      return rows.map((row) => mapApiVersion(row));
    });
  }

  override async getApiVersion(version: string): Promise<ApiVersion | null> {
    return this.globalTx(async (tx) => {
      const rows = await tx<ApiVersionRow[]>`
        SELECT * FROM chai.api_version
        WHERE version = ${version}
        LIMIT 1
      `;
      return rows[0] ? mapApiVersion(rows[0]) : null;
    });
  }

  override async createApiVersion(
    version: Omit<ApiVersion, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ApiVersion> {
    const id = randomUUID();
    return this.globalTx(async (tx) => {
      const rows = await tx<ApiVersionRow[]>`
        INSERT INTO chai.api_version (
          id, version, status, release_date, sunset_date, changelog
        ) VALUES (
          ${id}, ${version.version}, ${version.status}, ${version.releaseDate}::date,
          ${version.sunsetDate}::date, ${version.changelog}
        )
        RETURNING *
      `;
      return mapApiVersion(requireRow(rows));
    });
  }

  override async updateApiVersion(
    id: string,
    update: Partial<ApiVersion>,
  ): Promise<ApiVersion> {
    return this.globalTx(async (tx) => {
      const existingRows = await tx<ApiVersionRow[]>`
        SELECT * FROM chai.api_version WHERE id = ${id} LIMIT 1
      `;
      const existing = existingRows[0] ? mapApiVersion(existingRows[0]) : null;
      if (!existing) throw new Error('API version not found');
      const merged = { ...existing, ...update };
      const rows = await tx<ApiVersionRow[]>`
        UPDATE chai.api_version SET
          version = ${merged.version},
          status = ${merged.status},
          release_date = ${merged.releaseDate}::date,
          sunset_date = ${merged.sunsetDate}::date,
          changelog = ${merged.changelog},
          updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
      return mapApiVersion(requireRow(rows));
    });
  }

  override async listSdkReleases(
    apiVersionId?: string,
    language?: string,
  ): Promise<SdkRelease[]> {
    const apiVersionFilter = apiVersionId ?? null;
    const languageFilter = language ?? null;
    return this.globalTx(async (tx) => {
      const rows = await tx<SdkReleaseRow[]>`
        SELECT * FROM chai.sdk_release
        WHERE (${apiVersionFilter}::uuid IS NULL OR api_version_id = ${apiVersionFilter}::uuid)
          AND (${languageFilter}::text IS NULL OR language = ${languageFilter}::text)
        ORDER BY published_at DESC
      `;
      return rows.map((row) => mapSdkRelease(row));
    });
  }

  override async createSdkRelease(
    release: Omit<SdkRelease, 'id'>,
  ): Promise<SdkRelease> {
    const id = randomUUID();
    return this.globalTx(async (tx) => {
      const rows = await tx<SdkReleaseRow[]>`
        INSERT INTO chai.sdk_release (
          id, api_version_id, language, version, package_url, repository_url,
          release_notes, published_at
        ) VALUES (
          ${id}, ${release.apiVersionId}, ${release.language}, ${release.version},
          ${release.packageUrl}, ${release.repositoryUrl}, ${release.releaseNotes},
          ${release.publishedAt}::timestamptz
        )
        RETURNING *
      `;
      return mapSdkRelease(requireRow(rows));
    });
  }

  override async getRateLimitUsage(
    tenantId: string,
    apiKeyId: string,
  ): Promise<RateLimitUsage[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<RateLimitUsageRow[]>`
        SELECT * FROM chai.rate_limit_usage
        WHERE tenant_id = ${tenantId} AND api_key_id = ${apiKeyId}
        ORDER BY window_start DESC
      `;
      return rows.map((row) => mapRateLimitUsage(row));
    });
  }

  override async incrementRateLimit(
    tenantId: string,
    apiKeyId: string,
  ): Promise<RateLimitUsage> {
    const now = Date.now();
    const windowStart = new Date(now - (now % 60_000)).toISOString();
    return this.tx(tenantId, async (tx) => {
      // No unique constraint backs (api_key_id, window_start) — 0022 only
      // indexes it — so this mirrors the in-memory repository's read-then-write
      // rather than ON CONFLICT. ponytail: a race between two concurrent
      // requests in the same window can each read no existing row and both
      // insert, undercounting collisions rather than overcounting; upgrade
      // path is a unique index on (api_key_id, window_start) plus ON CONFLICT
      // DO UPDATE if rate limiting needs to be exact under concurrency.
      const existingRows = await tx<RateLimitUsageRow[]>`
        SELECT * FROM chai.rate_limit_usage
        WHERE tenant_id = ${tenantId} AND api_key_id = ${apiKeyId}
          AND window_start = ${windowStart}::timestamptz
        LIMIT 1
      `;
      const existing = existingRows[0];
      if (existing) {
        const rows = await tx<RateLimitUsageRow[]>`
          UPDATE chai.rate_limit_usage SET
            request_count = request_count + 1
          WHERE tenant_id = ${tenantId} AND id = ${existing.id}
          RETURNING *
        `;
        return mapRateLimitUsage(requireRow(rows));
      }
      const id = randomUUID();
      const rows = await tx<RateLimitUsageRow[]>`
        INSERT INTO chai.rate_limit_usage (
          id, api_key_id, tenant_id, window_start, request_count
        ) VALUES (
          ${id}, ${apiKeyId}, ${tenantId}, ${windowStart}::timestamptz, 1
        )
        RETURNING *
      `;
      return mapRateLimitUsage(requireRow(rows));
    });
  }

  private async loadPartner(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<Partner | null> {
    const rows = await tx<PartnerRow[]>`
      SELECT * FROM chai.partner
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapPartner(rows[0]) : null;
  }

  private tx<T>(
    tenantId: string,
    work: (tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      work,
    );
  }

  /**
   * chai.api_version / chai.sdk_release have no tenant_id column and no RLS
   * policy (platform-wide registries, verified in migration 0022), so there is
   * no `app.tenant_id` to set. withPrincipalTransaction still records who
   * acted, without pretending these rows belong to a tenant.
   */
  private globalTx<T>(work: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return withPrincipalTransaction(this.database, SERVICE_PRINCIPAL_ID, work);
  }
}

function mapPartner(row: PartnerRow): Partner {
  return {
    contactEmail: row.contact_email,
    createdAt: row.created_at.toISOString(),
    description: row.description,
    id: row.id,
    name: row.name,
    status: row.status,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapApiKey(row: ApiKeyRow): ApiKey {
  return {
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    id: row.id,
    isActive: row.is_active,
    keyPrefix: row.key_prefix,
    lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
    name: row.name,
    partnerId: row.partner_id,
    rateLimitPerMinute: row.rate_limit_per_minute,
    scopes: row.scopes,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapApiVersion(row: ApiVersionRow): ApiVersion {
  return {
    changelog: row.changelog,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    releaseDate: row.release_date,
    status: row.status,
    sunsetDate: row.sunset_date,
    updatedAt: row.updated_at.toISOString(),
    version: row.version,
  };
}

function mapSdkRelease(row: SdkReleaseRow): SdkRelease {
  return {
    apiVersionId: row.api_version_id,
    id: row.id,
    language: row.language,
    packageUrl: row.package_url,
    publishedAt: row.published_at.toISOString(),
    releaseNotes: row.release_notes,
    repositoryUrl: row.repository_url,
    version: row.version,
  };
}

function mapRateLimitUsage(row: RateLimitUsageRow): RateLimitUsage {
  return {
    apiKeyId: row.api_key_id,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    requestCount: row.request_count,
    tenantId: row.tenant_id,
    windowStart: row.window_start.toISOString(),
  };
}

/** Baris pertama hasil RETURNING, tanpa non-null assertion. */
function requireRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) {
    throw new Error('expected a returned row');
  }
  return row;
}
