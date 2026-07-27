import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withPrincipalTransaction,
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import { WidgetRepository, type Widget, type WidgetSession } from './widget.repository';

/** Bentuk baris public.widgets. `theme`/`business_hours` adalah jsonb. */
interface WidgetRow {
  allowed_origins: string[];
  analytics_enabled: boolean;
  business_hours: unknown | null;
  created_at: Date;
  domain: string;
  embed_code: string | null;
  greeting_message: string | null;
  id: string;
  language: string;
  name: string;
  offline_message: string | null;
  position: Widget['position'];
  status: Widget['status'];
  tenant_id: string;
  theme: unknown;
  updated_at: Date;
  widget_type: Widget['widgetType'];
}

/** Bentuk baris public.widget_sessions. `metadata` adalah jsonb. */
interface WidgetSessionRow {
  contact_id: string | null;
  conversation_id: string | null;
  ended_at: Date | null;
  id: string;
  ip_address: string | null;
  landing_page: string | null;
  metadata: unknown | null;
  referrer_url: string | null;
  started_at: Date;
  status: WidgetSession['status'];
  tenant_id: string;
  user_agent: string | null;
  visitor_id: string | null;
  widget_id: string;
}

@Injectable()
export class PostgresWidgetRepository extends WidgetRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listWidgets(tenantId: string): Promise<Widget[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<WidgetRow[]>`
        SELECT * FROM public.widgets
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapWidget(row));
    });
  }

  override async getWidget(tenantId: string, id: string): Promise<Widget | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<WidgetRow[]>`
        SELECT * FROM public.widgets
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapWidget(rows[0]) : null;
    });
  }

  override async createWidget(
    tenantId: string,
    widget: Omit<Widget, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>,
  ): Promise<Widget> {
    const id = randomUUID();
    const theme = JSON.stringify(widget.theme);
    const businessHours =
      widget.businessHours === null ? null : JSON.stringify(widget.businessHours);
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<WidgetRow[]>`
        INSERT INTO public.widgets (
          id, tenant_id, name, domain, widget_type, theme, position, language,
          greeting_message, offline_message, business_hours, allowed_origins,
          status, embed_code, analytics_enabled
        ) VALUES (
          ${id}, ${tenantId}, ${widget.name}, ${widget.domain}, ${widget.widgetType},
          ${theme}::jsonb, ${widget.position}, ${widget.language},
          ${widget.greetingMessage}, ${widget.offlineMessage}, ${businessHours}::jsonb,
          ${widget.allowedOrigins}, ${widget.status}, ${widget.embedCode},
          ${widget.analyticsEnabled}
        )
        RETURNING *
      `;
      return mapWidget(requireRow(rows));
    });
  }

  override async updateWidget(
    tenantId: string,
    id: string,
    update: Partial<Widget>,
  ): Promise<Widget> {
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadWidget(tx, tenantId, id);
      if (!existing) throw new Error('Widget not found');
      const merged = { ...existing, ...update };
      const theme = JSON.stringify(merged.theme);
      const businessHours =
        merged.businessHours === null ? null : JSON.stringify(merged.businessHours);
      const rows = await tx<WidgetRow[]>`
        UPDATE public.widgets SET
          name = ${merged.name},
          domain = ${merged.domain},
          widget_type = ${merged.widgetType},
          theme = ${theme}::jsonb,
          position = ${merged.position},
          language = ${merged.language},
          greeting_message = ${merged.greetingMessage},
          offline_message = ${merged.offlineMessage},
          business_hours = ${businessHours}::jsonb,
          allowed_origins = ${merged.allowedOrigins},
          status = ${merged.status},
          embed_code = ${merged.embedCode},
          analytics_enabled = ${merged.analyticsEnabled},
          updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapWidget(requireRow(rows));
    });
  }

  override async deleteWidget(tenantId: string, id: string): Promise<void> {
    await this.tx(tenantId, async (tx) => {
      const result = await tx`
        DELETE FROM public.widgets
        WHERE tenant_id = ${tenantId} AND id = ${id}
      `;
      if (result.count === 0) throw new Error('Widget not found');
    });
  }

  /**
   * Public, unauthenticated widget runtime (see widget.controller.ts): the
   * caller has no tenant context, so the owning tenant is discovered through
   * chai.widget_tenant_of (migration 0070, SECURITY DEFINER, returns only a
   * tenant_id) before the real read runs under the ordinary tenant_isolation
   * policy.
   */
  override async listSessions(
    widgetId: string,
    status?: string,
  ): Promise<WidgetSession[]> {
    const filter = status ?? null;
    const tenantId = await this.discoverWidgetTenant(widgetId);
    if (tenantId === null) return [];
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<WidgetSessionRow[]>`
        SELECT * FROM public.widget_sessions
        WHERE widget_id = ${widgetId}
          AND (${filter}::text IS NULL OR status = ${filter}::text)
        ORDER BY started_at DESC
      `;
      return rows.map((row) => mapSession(row));
    });
  }

  override async getSession(id: string): Promise<WidgetSession | null> {
    const tenantId = await this.discoverSessionTenant(id);
    if (tenantId === null) return null;
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<WidgetSessionRow[]>`
        SELECT * FROM public.widget_sessions
        WHERE tenant_id = ${tenantId} AND id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapSession(rows[0]) : null;
    });
  }

  override async createSession(
    session: Omit<WidgetSession, 'id' | 'endedAt'>,
  ): Promise<WidgetSession> {
    const id = randomUUID();
    const metadata = JSON.stringify(session.metadata);
    return this.tx(session.tenantId, async (tx) => {
      const rows = await tx<WidgetSessionRow[]>`
        INSERT INTO public.widget_sessions (
          id, widget_id, tenant_id, visitor_id, contact_id, conversation_id,
          ip_address, user_agent, referrer_url, landing_page, started_at,
          status, metadata
        ) VALUES (
          ${id}, ${session.widgetId}, ${session.tenantId}, ${session.visitorId},
          ${session.contactId}, ${session.conversationId}, ${session.ipAddress}::inet,
          ${session.userAgent}, ${session.referrerUrl}, ${session.landingPage},
          ${session.startedAt}::timestamptz, ${session.status}, ${metadata}::jsonb
        )
        RETURNING *
      `;
      return mapSession(requireRow(rows));
    });
  }

  override async updateSession(
    id: string,
    update: Partial<WidgetSession>,
  ): Promise<WidgetSession> {
    const tenantId = await this.discoverSessionTenant(id);
    if (tenantId === null) throw new Error('Widget session not found');
    return this.tx(tenantId, async (tx) => {
      const existing = await this.loadSession(tx, tenantId, id);
      if (!existing) throw new Error('Widget session not found');
      const merged = { ...existing, ...update };
      const metadata = JSON.stringify(merged.metadata);
      const rows = await tx<WidgetSessionRow[]>`
        UPDATE public.widget_sessions SET
          contact_id = ${merged.contactId},
          conversation_id = ${merged.conversationId},
          ended_at = ${merged.endedAt}::timestamptz,
          status = ${merged.status},
          metadata = ${metadata}::jsonb
        WHERE tenant_id = ${tenantId} AND id = ${id}
        RETURNING *
      `;
      return mapSession(requireRow(rows));
    });
  }

  private async discoverWidgetTenant(widgetId: string): Promise<string | null> {
    return withPrincipalTransaction(this.database, SERVICE_PRINCIPAL_ID, async (tx) => {
      const rows = await tx<{ widget_tenant_of: string | null }[]>`
        SELECT chai.widget_tenant_of(${widgetId}::uuid) AS widget_tenant_of
      `;
      return rows[0]?.widget_tenant_of ?? null;
    });
  }

  private async discoverSessionTenant(sessionId: string): Promise<string | null> {
    return withPrincipalTransaction(this.database, SERVICE_PRINCIPAL_ID, async (tx) => {
      const rows = await tx<{ widget_session_tenant_of: string | null }[]>`
        SELECT chai.widget_session_tenant_of(${sessionId}::uuid) AS widget_session_tenant_of
      `;
      return rows[0]?.widget_session_tenant_of ?? null;
    });
  }

  private async loadWidget(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<Widget | null> {
    const rows = await tx<WidgetRow[]>`
      SELECT * FROM public.widgets
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapWidget(rows[0]) : null;
  }

  private async loadSession(
    tx: DatabaseTransaction,
    tenantId: string,
    id: string,
  ): Promise<WidgetSession | null> {
    const rows = await tx<WidgetSessionRow[]>`
      SELECT * FROM public.widget_sessions
      WHERE tenant_id = ${tenantId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapSession(rows[0]) : null;
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
}

function mapWidget(row: WidgetRow): Widget {
  return {
    allowedOrigins: row.allowed_origins,
    analyticsEnabled: row.analytics_enabled,
    businessHours:
      row.business_hours === null
        ? null
        : parseJson<Record<string, unknown>>(row.business_hours),
    createdAt: row.created_at.toISOString(),
    domain: row.domain,
    embedCode: row.embed_code,
    greetingMessage: row.greeting_message,
    id: row.id,
    language: row.language,
    name: row.name,
    offlineMessage: row.offline_message,
    position: row.position,
    status: row.status,
    tenantId: row.tenant_id,
    theme: parseJson<Record<string, unknown>>(row.theme),
    updatedAt: row.updated_at.toISOString(),
    widgetType: row.widget_type,
  };
}

function mapSession(row: WidgetSessionRow): WidgetSession {
  return {
    contactId: row.contact_id,
    conversationId: row.conversation_id,
    endedAt: row.ended_at ? row.ended_at.toISOString() : null,
    id: row.id,
    ipAddress: row.ip_address,
    landingPage: row.landing_page,
    metadata:
      row.metadata === null ? {} : parseJson<Record<string, unknown>>(row.metadata),
    referrerUrl: row.referrer_url,
    startedAt: row.started_at.toISOString(),
    status: row.status,
    tenantId: row.tenant_id,
    userAgent: row.user_agent,
    visitorId: row.visitor_id,
    widgetId: row.widget_id,
  };
}

/** Driver ini mengembalikan jsonb sebagai string; objek dilewatkan apa adanya. */
function parseJson<T>(value: unknown): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
}

/** Baris pertama hasil RETURNING, tanpa non-null assertion. */
function requireRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) {
    throw new Error('expected a returned row');
  }
  return row;
}
