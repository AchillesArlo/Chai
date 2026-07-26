import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';

export type DomainStatus = 'PENDING' | 'VERIFIED' | 'ACTIVE' | 'SUSPENDED';
export type SslStatus = 'PENDING' | 'PROVISIONING' | 'ACTIVE' | 'FAILED';

export interface CustomDomainRecord {
  id: string;
  tenantId: string;
  domain: string;
  status: DomainStatus;
  sslStatus: SslStatus;
  verificationToken: string;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThemeSettingsRecord {
  id: string;
  tenantId: string;
  brandName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  customCss: string | null;
  headerHtml: string | null;
  footerHtml: string | null;
  createdAt: string;
  updatedAt: string;
}

export abstract class WhitelabelRepository {
  abstract listDomains(tenantId: string): Promise<CustomDomainRecord[]>;
  abstract getDomain(tenantId: string, id: string): Promise<CustomDomainRecord | null>;
  abstract getDomainByDomain(domain: string): Promise<CustomDomainRecord | null>;
  abstract createDomain(
    tenantId: string,
    input: { domain: string },
  ): Promise<CustomDomainRecord>;
  abstract updateDomain(
    tenantId: string,
    id: string,
    input: { status?: DomainStatus; sslStatus?: SslStatus; verifiedAt?: string },
  ): Promise<CustomDomainRecord>;
  abstract deleteDomain(tenantId: string, id: string): Promise<void>;

  abstract getTheme(tenantId: string): Promise<ThemeSettingsRecord | null>;
  abstract createOrUpdateTheme(
    tenantId: string,
    input: Partial<Omit<ThemeSettingsRecord, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<ThemeSettingsRecord>;
}

interface DomainRow {
  id: string;
  tenant_id: string;
  domain: string;
  status: DomainStatus;
  ssl_status: SslStatus;
  verification_token: string;
  verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface ThemeRow {
  id: string;
  tenant_id: string;
  brand_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  font_family: string;
  custom_css: string | null;
  header_html: string | null;
  footer_html: string | null;
  created_at: Date;
  updated_at: Date;
}

function toDomainRecord(row: DomainRow): CustomDomainRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    domain: row.domain,
    status: row.status,
    sslStatus: row.ssl_status,
    verificationToken: row.verification_token,
    verifiedAt: row.verified_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toThemeRecord(row: ThemeRow): ThemeSettingsRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    brandName: row.brand_name,
    logoUrl: row.logo_url,
    faviconUrl: row.favicon_url,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    accentColor: row.accent_color,
    fontFamily: row.font_family,
    customCss: row.custom_css,
    headerHtml: row.header_html,
    footerHtml: row.footer_html,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

@Injectable()
export class InMemoryWhitelabelRepository extends WhitelabelRepository {
  private readonly domains = new Map<string, CustomDomainRecord>();
  private readonly themes = new Map<string, ThemeSettingsRecord>();

  override async listDomains(tenantId: string): Promise<CustomDomainRecord[]> {
    return [...this.domains.values()].filter((d) => d.tenantId === tenantId);
  }

  override async getDomain(tenantId: string, id: string): Promise<CustomDomainRecord | null> {
    const domain = this.domains.get(id);
    return domain && domain.tenantId === tenantId ? domain : null;
  }

  override async getDomainByDomain(domain: string): Promise<CustomDomainRecord | null> {
    return [...this.domains.values()].find((d) => d.domain === domain) ?? null;
  }

  override async createDomain(
    tenantId: string,
    input: { domain: string },
  ): Promise<CustomDomainRecord> {
    const now = new Date().toISOString();
    const record: CustomDomainRecord = {
      id: randomUUID(),
      tenantId,
      domain: input.domain,
      status: 'PENDING',
      sslStatus: 'PENDING',
      verificationToken: `verify_${randomUUID().replace(/-/g, '')}`,
      verifiedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.domains.set(record.id, record);
    return record;
  }

  override async updateDomain(
    tenantId: string,
    id: string,
    input: { status?: DomainStatus; sslStatus?: SslStatus; verifiedAt?: string },
  ): Promise<CustomDomainRecord> {
    const existing = await this.getDomain(tenantId, id);
    if (!existing) throw new Error('domain not found');
    const updated: CustomDomainRecord = {
      ...existing,
      status: input.status ?? existing.status,
      sslStatus: input.sslStatus ?? existing.sslStatus,
      verifiedAt: input.verifiedAt ?? existing.verifiedAt,
      updatedAt: new Date().toISOString(),
    };
    this.domains.set(id, updated);
    return updated;
  }

  override async deleteDomain(tenantId: string, id: string): Promise<void> {
    const existing = await this.getDomain(tenantId, id);
    if (!existing) throw new Error('domain not found');
    this.domains.delete(id);
  }

  override async getTheme(tenantId: string): Promise<ThemeSettingsRecord | null> {
    return this.themes.get(tenantId) ?? null;
  }

  override async createOrUpdateTheme(
    tenantId: string,
    input: Partial<Omit<ThemeSettingsRecord, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<ThemeSettingsRecord> {
    const existing = this.themes.get(tenantId);
    const now = new Date().toISOString();

    if (existing) {
      const updated: ThemeSettingsRecord = {
        ...existing,
        ...input,
        updatedAt: now,
      };
      this.themes.set(tenantId, updated);
      return updated;
    }

    const record: ThemeSettingsRecord = {
      id: randomUUID(),
      tenantId,
      brandName: input.brandName ?? 'My Brand',
      logoUrl: input.logoUrl ?? null,
      faviconUrl: input.faviconUrl ?? null,
      primaryColor: input.primaryColor ?? '#3B82F6',
      secondaryColor: input.secondaryColor ?? '#10B981',
      accentColor: input.accentColor ?? '#F59E0B',
      fontFamily: input.fontFamily ?? 'Inter, system-ui, sans-serif',
      customCss: input.customCss ?? null,
      headerHtml: input.headerHtml ?? null,
      footerHtml: input.footerHtml ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.themes.set(tenantId, record);
    return record;
  }
}

@Injectable()
export class PostgresWhitelabelRepository extends WhitelabelRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listDomains(tenantId: string): Promise<CustomDomainRecord[]> {
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const rows = await tx<DomainRow[]>`
        SELECT id, tenant_id, domain, status, ssl_status, verification_token, verified_at, created_at, updated_at
          FROM chai.custom_domain
          WHERE tenant_id = ${tenantId}::uuid
          ORDER BY created_at DESC
      `;
      return rows.map(toDomainRecord);
    });
  }

  override async getDomain(tenantId: string, id: string): Promise<CustomDomainRecord | null> {
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const rows = await tx<DomainRow[]>`
        SELECT id, tenant_id, domain, status, ssl_status, verification_token, verified_at, created_at, updated_at
          FROM chai.custom_domain
          WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
      `;
      return rows[0] ? toDomainRecord(rows[0]) : null;
    });
  }

  override async getDomainByDomain(domain: string): Promise<CustomDomainRecord | null> {
    const rows = await this.database<DomainRow[]>`
      SELECT id, tenant_id, domain, status, ssl_status, verification_token, verified_at, created_at, updated_at
        FROM chai.custom_domain
        WHERE domain = ${domain}
    `;
    return rows[0] ? toDomainRecord(rows[0]) : null;
  }

  override async createDomain(
    tenantId: string,
    input: { domain: string },
  ): Promise<CustomDomainRecord> {
    const id = randomUUID();
    const verificationToken = `verify_${randomUUID().replace(/-/g, '')}`;
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const rows = await tx<DomainRow[]>`
        INSERT INTO chai.custom_domain (id, tenant_id, domain, verification_token)
        VALUES (${id}::uuid, ${tenantId}::uuid, ${input.domain}, ${verificationToken})
        RETURNING id, tenant_id, domain, status, ssl_status, verification_token, verified_at, created_at, updated_at
      `;
      const row = rows[0];
      if (!row) throw new Error('custom_domain insert returned no row');
      return toDomainRecord(row);
    });
  }

  override async updateDomain(
    tenantId: string,
    id: string,
    input: { status?: DomainStatus; sslStatus?: SslStatus; verifiedAt?: string },
  ): Promise<CustomDomainRecord> {
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const rows = (await tx`
        UPDATE chai.custom_domain
        SET status = COALESCE(${input.status ?? null}, status),
            ssl_status = COALESCE(${input.sslStatus ?? null}, ssl_status),
            verified_at = COALESCE(${input.verifiedAt ?? null}::timestamptz, verified_at),
            updated_at = now()
        WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
        RETURNING id, tenant_id, domain, status, ssl_status, verification_token, verified_at, created_at, updated_at
      `) as unknown as DomainRow[];
      if (!rows[0]) throw new Error('domain not found');
      return toDomainRecord(rows[0]);
    });
  }

  override async deleteDomain(tenantId: string, id: string): Promise<void> {
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      await tx`DELETE FROM chai.custom_domain WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid`;
    });
  }

  override async getTheme(tenantId: string): Promise<ThemeSettingsRecord | null> {
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const rows = (await tx`
        SELECT id, tenant_id, brand_name, logo_url, favicon_url, primary_color, secondary_color, accent_color, font_family, custom_css, header_html, footer_html, created_at, updated_at
          FROM chai.theme_settings
          WHERE tenant_id = ${tenantId}::uuid
      `) as unknown as ThemeRow[];
      return rows[0] ? toThemeRecord(rows[0]) : null;
    });
  }

  override async createOrUpdateTheme(
    tenantId: string,
    input: Partial<Omit<ThemeSettingsRecord, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<ThemeSettingsRecord> {
    return withTenantTransaction(this.database, { tenantId, principalId: SERVICE_PRINCIPAL_ID }, async (tx) => {
      const existing = await this.getTheme(tenantId);

      if (existing) {
        const rows = (await tx`
          UPDATE chai.theme_settings
          SET brand_name = COALESCE(${input.brandName ?? null}, brand_name),
              logo_url = COALESCE(${input.logoUrl ?? null}, logo_url),
              favicon_url = COALESCE(${input.faviconUrl ?? null}, favicon_url),
              primary_color = COALESCE(${input.primaryColor ?? null}, primary_color),
              secondary_color = COALESCE(${input.secondaryColor ?? null}, secondary_color),
              accent_color = COALESCE(${input.accentColor ?? null}, accent_color),
              font_family = COALESCE(${input.fontFamily ?? null}, font_family),
              custom_css = COALESCE(${input.customCss ?? null}, custom_css),
              header_html = COALESCE(${input.headerHtml ?? null}, header_html),
              footer_html = COALESCE(${input.footerHtml ?? null}, footer_html),
              updated_at = now()
          WHERE tenant_id = ${tenantId}::uuid
          RETURNING id, tenant_id, brand_name, logo_url, favicon_url, primary_color, secondary_color, accent_color, font_family, custom_css, header_html, footer_html, created_at, updated_at
        `) as unknown as ThemeRow[];
        const row = rows[0];
        if (!row) throw new Error('theme_settings update matched no row');
        return toThemeRecord(row);
      }

      const id = randomUUID();
      const rows = (await tx`
        INSERT INTO chai.theme_settings (id, tenant_id, brand_name, logo_url, favicon_url, primary_color, secondary_color, accent_color, font_family, custom_css, header_html, footer_html)
        VALUES (${id}::uuid, ${tenantId}::uuid, ${input.brandName ?? 'My Brand'}, ${input.logoUrl ?? null}, ${input.faviconUrl ?? null}, ${input.primaryColor ?? '#3B82F6'}, ${input.secondaryColor ?? '#10B981'}, ${input.accentColor ?? '#F59E0B'}, ${input.fontFamily ?? 'Inter, system-ui, sans-serif'}, ${input.customCss ?? null}, ${input.headerHtml ?? null}, ${input.footerHtml ?? null})
        RETURNING id, tenant_id, brand_name, logo_url, favicon_url, primary_color, secondary_color, accent_color, font_family, custom_css, header_html, footer_html, created_at, updated_at
      `) as unknown as ThemeRow[];
      const row = rows[0];
      if (!row) throw new Error('theme_settings insert returned no row');
      return toThemeRecord(row);
    });
  }
}
