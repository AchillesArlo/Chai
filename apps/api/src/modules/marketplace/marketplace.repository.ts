import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';

export type WebhookStatus = 'ACTIVE' | 'PAUSED' | 'DISABLED';
export type MarketplaceCategory = 'connector' | 'automation' | 'analytics' | 'channel';
export type InstallationStatus = 'ACTIVE' | 'SUSPENDED' | 'UNINSTALLED';

export interface WebhookSubscriptionRecord {
  id: string;
  tenantId: string;
  url: string;
  description: string | null;
  events: string[];
  signingSecret: string;
  status: WebhookStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceListingRecord {
  id: string;
  providerId: string;
  name: string;
  description: string;
  category: MarketplaceCategory;
  iconUrl: string | null;
  documentationUrl: string | null;
  configSchema: unknown;
  version: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceInstallationRecord {
  id: string;
  tenantId: string;
  listingId: string;
  config: unknown;
  status: InstallationStatus;
  installedAt: string;
  updatedAt: string;
}

export abstract class MarketplaceRepository {
  // Webhook subscriptions
  abstract listWebhooks(tenantId: string): Promise<WebhookSubscriptionRecord[]>;
  abstract getWebhook(tenantId: string, id: string): Promise<WebhookSubscriptionRecord | null>;
  abstract createWebhook(
    tenantId: string,
    input: { url: string; description?: string; events?: string[] },
  ): Promise<WebhookSubscriptionRecord>;
  abstract updateWebhook(
    tenantId: string,
    id: string,
    input: { url?: string; description?: string; events?: string[]; status?: WebhookStatus },
  ): Promise<WebhookSubscriptionRecord>;
  abstract deleteWebhook(tenantId: string, id: string): Promise<void>;

  // Marketplace listings
  abstract listListings(category?: MarketplaceCategory): Promise<MarketplaceListingRecord[]>;
  abstract getListing(id: string): Promise<MarketplaceListingRecord | null>;
  abstract getListingByProvider(providerId: string): Promise<MarketplaceListingRecord | null>;
  abstract createListing(input: {
    providerId: string;
    name: string;
    description: string;
    category?: MarketplaceCategory;
    iconUrl?: string;
    documentationUrl?: string;
    configSchema?: unknown;
    version?: string;
  }): Promise<MarketplaceListingRecord>;
  abstract updateListing(
    id: string,
    input: { name?: string; description?: string; published?: boolean; version?: string },
  ): Promise<MarketplaceListingRecord>;

  // Installations
  abstract listInstallations(tenantId: string): Promise<MarketplaceInstallationRecord[]>;
  abstract getInstallation(tenantId: string, listingId: string): Promise<MarketplaceInstallationRecord | null>;
  abstract installListing(
    tenantId: string,
    listingId: string,
    config?: unknown,
  ): Promise<MarketplaceInstallationRecord>;
  abstract updateInstallation(
    tenantId: string,
    listingId: string,
    input: { config?: unknown; status?: InstallationStatus },
  ): Promise<MarketplaceInstallationRecord>;
  abstract uninstallInstallation(tenantId: string, listingId: string): Promise<void>;
}

interface WebhookRow {
  id: string;
  tenant_id: string;
  url: string;
  description: string | null;
  events: unknown;
  signing_secret: string;
  status: WebhookStatus;
  created_at: Date;
  updated_at: Date;
}

interface ListingRow {
  id: string;
  provider_id: string;
  name: string;
  description: string;
  category: MarketplaceCategory;
  icon_url: string | null;
  documentation_url: string | null;
  config_schema: unknown;
  version: string;
  published: boolean;
  created_at: Date;
  updated_at: Date;
}

interface InstallationRow {
  id: string;
  tenant_id: string;
  listing_id: string;
  config: unknown;
  status: InstallationStatus;
  installed_at: Date;
  updated_at: Date;
}

function toWebhookRecord(row: WebhookRow): WebhookSubscriptionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    url: row.url,
    description: row.description,
    events: parseJson<string[]>(row.events) ?? [],
    signingSecret: row.signing_secret,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toListingRecord(row: ListingRow): MarketplaceListingRecord {
  return {
    id: row.id,
    providerId: row.provider_id,
    name: row.name,
    description: row.description,
    category: row.category,
    iconUrl: row.icon_url,
    documentationUrl: row.documentation_url,
    configSchema: parseJson(row.config_schema),
    version: row.version,
    published: row.published,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toInstallationRecord(row: InstallationRow): MarketplaceInstallationRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    listingId: row.listing_id,
    config: parseJson(row.config),
    status: row.status,
    installedAt: row.installed_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Decode a jsonb column that this driver returns as a raw JSON string. */
function parseJson<T>(value: unknown): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
}

@Injectable()
export class InMemoryMarketplaceRepository extends MarketplaceRepository {
  private readonly webhooks = new Map<string, WebhookSubscriptionRecord>();
  private readonly listings = new Map<string, MarketplaceListingRecord>();
  private readonly installations = new Map<string, MarketplaceInstallationRecord>();

  override async listWebhooks(tenantId: string): Promise<WebhookSubscriptionRecord[]> {
    return [...this.webhooks.values()].filter((w) => w.tenantId === tenantId);
  }

  override async getWebhook(tenantId: string, id: string): Promise<WebhookSubscriptionRecord | null> {
    const webhook = this.webhooks.get(id);
    return webhook && webhook.tenantId === tenantId ? webhook : null;
  }

  override async createWebhook(
    tenantId: string,
    input: { url: string; description?: string; events?: string[] },
  ): Promise<WebhookSubscriptionRecord> {
    const now = new Date().toISOString();
    const record: WebhookSubscriptionRecord = {
      id: randomUUID(),
      tenantId,
      url: input.url,
      description: input.description ?? null,
      events: input.events ?? [],
      signingSecret: `whsec_${randomUUID().replace(/-/g, '')}`,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    this.webhooks.set(record.id, record);
    return record;
  }

  override async updateWebhook(
    tenantId: string,
    id: string,
    input: { url?: string; description?: string; events?: string[]; status?: WebhookStatus },
  ): Promise<WebhookSubscriptionRecord> {
    const existing = await this.getWebhook(tenantId, id);
    if (!existing) throw new Error('webhook not found');
    const updated: WebhookSubscriptionRecord = {
      ...existing,
      url: input.url ?? existing.url,
      description: input.description ?? existing.description,
      events: input.events ?? existing.events,
      status: input.status ?? existing.status,
      updatedAt: new Date().toISOString(),
    };
    this.webhooks.set(id, updated);
    return updated;
  }

  override async deleteWebhook(tenantId: string, id: string): Promise<void> {
    const existing = await this.getWebhook(tenantId, id);
    if (!existing) throw new Error('webhook not found');
    this.webhooks.delete(id);
  }

  override async listListings(category?: MarketplaceCategory): Promise<MarketplaceListingRecord[]> {
    const all = [...this.listings.values()].filter((l) => l.published);
    return category ? all.filter((l) => l.category === category) : all;
  }

  override async getListing(id: string): Promise<MarketplaceListingRecord | null> {
    return this.listings.get(id) ?? null;
  }

  override async getListingByProvider(providerId: string): Promise<MarketplaceListingRecord | null> {
    return [...this.listings.values()].find((l) => l.providerId === providerId) ?? null;
  }

  override async createListing(input: {
    providerId: string;
    name: string;
    description: string;
    category?: MarketplaceCategory;
    iconUrl?: string;
    documentationUrl?: string;
    configSchema?: unknown;
    version?: string;
  }): Promise<MarketplaceListingRecord> {
    const now = new Date().toISOString();
    const record: MarketplaceListingRecord = {
      id: randomUUID(),
      providerId: input.providerId,
      name: input.name,
      description: input.description,
      category: input.category ?? 'connector',
      iconUrl: input.iconUrl ?? null,
      documentationUrl: input.documentationUrl ?? null,
      configSchema: input.configSchema ?? {},
      version: input.version ?? '1.0.0',
      published: false,
      createdAt: now,
      updatedAt: now,
    };
    this.listings.set(record.id, record);
    return record;
  }

  override async updateListing(
    id: string,
    input: { name?: string; description?: string; published?: boolean; version?: string },
  ): Promise<MarketplaceListingRecord> {
    const existing = this.listings.get(id);
    if (!existing) throw new Error('listing not found');
    const updated: MarketplaceListingRecord = {
      ...existing,
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      published: input.published ?? existing.published,
      version: input.version ?? existing.version,
      updatedAt: new Date().toISOString(),
    };
    this.listings.set(id, updated);
    return updated;
  }

  override async listInstallations(tenantId: string): Promise<MarketplaceInstallationRecord[]> {
    return [...this.installations.values()].filter((i) => i.tenantId === tenantId);
  }

  override async getInstallation(
    tenantId: string,
    listingId: string,
  ): Promise<MarketplaceInstallationRecord | null> {
    return (
      [...this.installations.values()].find(
        (i) => i.tenantId === tenantId && i.listingId === listingId,
      ) ?? null
    );
  }

  override async installListing(
    tenantId: string,
    listingId: string,
    config?: unknown,
  ): Promise<MarketplaceInstallationRecord> {
    const now = new Date().toISOString();
    const record: MarketplaceInstallationRecord = {
      id: randomUUID(),
      tenantId,
      listingId,
      config: config ?? {},
      status: 'ACTIVE',
      installedAt: now,
      updatedAt: now,
    };
    this.installations.set(record.id, record);
    return record;
  }

  override async updateInstallation(
    tenantId: string,
    listingId: string,
    input: { config?: unknown; status?: InstallationStatus },
  ): Promise<MarketplaceInstallationRecord> {
    const existing = await this.getInstallation(tenantId, listingId);
    if (!existing) throw new Error('installation not found');
    const updated: MarketplaceInstallationRecord = {
      ...existing,
      config: input.config ?? existing.config,
      status: input.status ?? existing.status,
      updatedAt: new Date().toISOString(),
    };
    this.installations.set(existing.id, updated);
    return updated;
  }

  override async uninstallInstallation(tenantId: string, listingId: string): Promise<void> {
    const existing = await this.getInstallation(tenantId, listingId);
    if (!existing) throw new Error('installation not found');
    this.installations.delete(existing.id);
  }
}

@Injectable()
export class PostgresMarketplaceRepository extends MarketplaceRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listWebhooks(tenantId: string): Promise<WebhookSubscriptionRecord[]> {
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const rows = await tx<WebhookRow[]>`
        SELECT id, tenant_id, url, description, events, signing_secret, status, created_at, updated_at
          FROM chai.webhook_subscription
          WHERE tenant_id = ${tenantId}::uuid
          ORDER BY created_at DESC
      `;
      return rows.map(toWebhookRecord);
    });
  }

  override async getWebhook(tenantId: string, id: string): Promise<WebhookSubscriptionRecord | null> {
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const rows = await tx<WebhookRow[]>`
        SELECT id, tenant_id, url, description, events, signing_secret, status, created_at, updated_at
          FROM chai.webhook_subscription
          WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
      `;
      return rows[0] ? toWebhookRecord(rows[0]) : null;
    });
  }

  override async createWebhook(
    tenantId: string,
    input: { url: string; description?: string; events?: string[] },
  ): Promise<WebhookSubscriptionRecord> {
    const id = randomUUID();
    const signingSecret = `whsec_${randomUUID().replace(/-/g, '')}`;
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const rows = (await tx`
        INSERT INTO chai.webhook_subscription (id, tenant_id, url, description, events, signing_secret)
        VALUES (${id}::uuid, ${tenantId}::uuid, ${input.url}, ${input.description ?? null}, ${tx.json((input.events ?? []) as Parameters<typeof tx.json>[0])}::jsonb, ${signingSecret})
        RETURNING id, tenant_id, url, description, events, signing_secret, status, created_at, updated_at
      `) as unknown as WebhookRow[];
      const row = rows[0];
      if (!row) throw new Error('webhook_subscription insert returned no row');
      return toWebhookRecord(row);
    });
  }

  override async updateWebhook(
    tenantId: string,
    id: string,
    input: { url?: string; description?: string; events?: string[]; status?: WebhookStatus },
  ): Promise<WebhookSubscriptionRecord> {
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const rows = (await tx`
        UPDATE chai.webhook_subscription
        SET url = COALESCE(${input.url ?? null}, url),
            description = COALESCE(${input.description ?? null}, description),
            events = COALESCE(${input.events ? tx.json(input.events as Parameters<typeof tx.json>[0]) : null}::jsonb, events),
            status = COALESCE(${input.status ?? null}, status),
            updated_at = now()
        WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
        RETURNING id, tenant_id, url, description, events, signing_secret, status, created_at, updated_at
      `) as unknown as WebhookRow[];
      if (!rows[0]) throw new Error('webhook not found');
      return toWebhookRecord(rows[0]);
    });
  }

  override async deleteWebhook(tenantId: string, id: string): Promise<void> {
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      await tx`DELETE FROM chai.webhook_subscription WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid`;
    });
  }

  override async listListings(category?: MarketplaceCategory): Promise<MarketplaceListingRecord[]> {
    const rows = (await this.database`
      SELECT id, provider_id, name, description, category, icon_url, documentation_url, config_schema, version, published, created_at, updated_at
        FROM chai.marketplace_listing
        WHERE published = true ${category ? this.database`AND category = ${category}` : this.database``}
        ORDER BY name ASC
    `) as unknown as ListingRow[];
    return rows.map(toListingRecord);
  }

  override async getListing(id: string): Promise<MarketplaceListingRecord | null> {
    const rows = (await this.database`
      SELECT id, provider_id, name, description, category, icon_url, documentation_url, config_schema, version, published, created_at, updated_at
        FROM chai.marketplace_listing
        WHERE id = ${id}::uuid
    `) as unknown as ListingRow[];
    return rows[0] ? toListingRecord(rows[0]) : null;
  }

  override async getListingByProvider(providerId: string): Promise<MarketplaceListingRecord | null> {
    const rows = (await this.database`
      SELECT id, provider_id, name, description, category, icon_url, documentation_url, config_schema, version, published, created_at, updated_at
        FROM chai.marketplace_listing
        WHERE provider_id = ${providerId}
    `) as unknown as ListingRow[];
    return rows[0] ? toListingRecord(rows[0]) : null;
  }

  override async createListing(input: {
    providerId: string;
    name: string;
    description: string;
    category?: MarketplaceCategory;
    iconUrl?: string;
    documentationUrl?: string;
    configSchema?: unknown;
    version?: string;
  }): Promise<MarketplaceListingRecord> {
    const id = randomUUID();
    const rows = (await this.database`
      INSERT INTO chai.marketplace_listing (id, provider_id, name, description, category, icon_url, documentation_url, config_schema, version)
      VALUES (${id}::uuid, ${input.providerId}, ${input.name}, ${input.description}, ${input.category ?? 'connector'}, ${input.iconUrl ?? null}, ${input.documentationUrl ?? null}, ${this.database.json((input.configSchema ?? {}) as Parameters<typeof this.database.json>[0])}::jsonb, ${input.version ?? '1.0.0'})
      RETURNING id, provider_id, name, description, category, icon_url, documentation_url, config_schema, version, published, created_at, updated_at
    `) as unknown as ListingRow[];
    const row = rows[0];
    if (!row) throw new Error('marketplace_listing insert returned no row');
    return toListingRecord(row);
  }

  override async updateListing(
    id: string,
    input: { name?: string; description?: string; published?: boolean; version?: string },
  ): Promise<MarketplaceListingRecord> {
    const rows = (await this.database`
      UPDATE chai.marketplace_listing
      SET name = COALESCE(${input.name ?? null}, name),
          description = COALESCE(${input.description ?? null}, description),
          published = COALESCE(${input.published ?? null}, published),
          version = COALESCE(${input.version ?? null}, version),
          updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id, provider_id, name, description, category, icon_url, documentation_url, config_schema, version, published, created_at, updated_at
    `) as unknown as ListingRow[];
    if (!rows[0]) throw new Error('listing not found');
    return toListingRecord(rows[0]);
  }

  override async listInstallations(tenantId: string): Promise<MarketplaceInstallationRecord[]> {
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const rows = (await tx`
        SELECT id, tenant_id, listing_id, config, status, installed_at, updated_at
          FROM chai.marketplace_installation
          WHERE tenant_id = ${tenantId}::uuid
          ORDER BY installed_at DESC
      `) as unknown as InstallationRow[];
      return rows.map(toInstallationRecord);
    });
  }

  override async getInstallation(
    tenantId: string,
    listingId: string,
  ): Promise<MarketplaceInstallationRecord | null> {
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const rows = (await tx`
        SELECT id, tenant_id, listing_id, config, status, installed_at, updated_at
          FROM chai.marketplace_installation
          WHERE tenant_id = ${tenantId}::uuid AND listing_id = ${listingId}::uuid
      `) as unknown as InstallationRow[];
      return rows[0] ? toInstallationRecord(rows[0]) : null;
    });
  }

  override async installListing(
    tenantId: string,
    listingId: string,
    config?: unknown,
  ): Promise<MarketplaceInstallationRecord> {
    const id = randomUUID();
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const rows = (await tx`
        INSERT INTO chai.marketplace_installation (id, tenant_id, listing_id, config)
        VALUES (${id}::uuid, ${tenantId}::uuid, ${listingId}::uuid, ${tx.json((config ?? {}) as Parameters<typeof tx.json>[0])}::jsonb)
        RETURNING id, tenant_id, listing_id, config, status, installed_at, updated_at
      `) as unknown as InstallationRow[];
      const row = rows[0];
      if (!row) throw new Error('marketplace_installation insert returned no row');
      return toInstallationRecord(row);
    });
  }

  override async updateInstallation(
    tenantId: string,
    listingId: string,
    input: { config?: unknown; status?: InstallationStatus },
  ): Promise<MarketplaceInstallationRecord> {
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const rows = (await tx`
        UPDATE chai.marketplace_installation
        SET config = COALESCE(${input.config ? tx.json(input.config as Parameters<typeof tx.json>[0]) : null}::jsonb, config),
            status = COALESCE(${input.status ?? null}, status),
            updated_at = now()
        WHERE tenant_id = ${tenantId}::uuid AND listing_id = ${listingId}::uuid
        RETURNING id, tenant_id, listing_id, config, status, installed_at, updated_at
      `) as unknown as InstallationRow[];
      if (!rows[0]) throw new Error('installation not found');
      return toInstallationRecord(rows[0]);
    });
  }

  override async uninstallInstallation(tenantId: string, listingId: string): Promise<void> {
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      await tx`DELETE FROM chai.marketplace_installation WHERE tenant_id = ${tenantId}::uuid AND listing_id = ${listingId}::uuid`;
    });
  }
}
