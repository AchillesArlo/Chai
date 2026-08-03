import { Inject, Injectable } from '@nestjs/common';

import { withTenantTransaction, type Database } from '@chai/database';

import { API_SERVICE_PRINCIPAL_ID } from '../../database/api-ids';
import { DATABASE } from '../../database/database.module';

/**
 * Per-tenant capability entitlements (GAP-012, 01_PRODUCT_SCOPE §6).
 *
 * Capabilities are evaluated SERVER-SIDE per tenant. A disabled capability must
 * disappear from the API (`FEATURE_NOT_ENABLED`), from the AI tool set, and from
 * navigation — never merely be hidden in the UI.
 *
 * Core capabilities are always on: they are what every tenant buys. Optional
 * modules default OFF so a tenant that did not buy payments cannot reach the
 * payment surface, and so the core can be deployed with those modules disabled.
 */
export const CORE_CAPABILITIES = [
  'website_widget',
  'inbox',
  'knowledge_rag',
  'lead_basic',
  'followup_basic',
] as const;

export const OPTIONAL_CAPABILITIES = [
  'payment_orchestration',
  'payment_refunds',
  'payment_recurring',
  'shipment_tracking',
  'shipment_create_label',
  'shipment_pickup',
  'shipment_returns',
  'calendar',
  'commerce',
  'advanced_analytics',
  'whatsapp_meta_direct',
  'instagram',
  // Unofficial WhatsApp Web (WAHA) — FASE 25. Separate from whatsapp_meta_direct,
  // default OFF; a tenant without it gets FEATURE_NOT_ENABLED for the community channel.
  'community_channel',
] as const;

export type Capability =
  | (typeof CORE_CAPABILITIES)[number]
  | (typeof OPTIONAL_CAPABILITIES)[number];

export abstract class EntitlementService {
  /** Capabilities currently enabled for the tenant. */
  abstract list(tenantId: string): Promise<string[]>;

  async isEnabled(tenantId: string, capability: string): Promise<boolean> {
    return (await this.list(tenantId)).includes(capability);
  }
}

/**
 * Environment-driven entitlements for local runs and tests.
 *
 * Core capabilities are on; optional ones are enabled only by an explicit
 * `CHAI_CAPABILITY_<NAME>=true`, mirroring the high-risk gates from Fase 0 so a
 * capability cannot be on in one layer and off in another.
 */
@Injectable()
export class EnvEntitlementService extends EntitlementService {
  private readonly overrides = new Map<string, Set<string>>();

  override async list(tenantId: string): Promise<string[]> {
    const enabled = new Set<string>(CORE_CAPABILITIES);
    for (const capability of OPTIONAL_CAPABILITIES) {
      if (process.env[`CHAI_CAPABILITY_${capability.toUpperCase()}`] === 'true') {
        enabled.add(capability);
      }
    }
    for (const capability of this.overrides.get(tenantId) ?? []) {
      enabled.add(capability);
    }
    return [...enabled];
  }

  /** Test helper: enable a capability for one tenant without touching env. */
  enableForTenant(tenantId: string, capability: string): void {
    const current = this.overrides.get(tenantId) ?? new Set<string>();
    current.add(capability);
    this.overrides.set(tenantId, current);
  }

  /** Test helper: drop all per-tenant overrides. */
  reset(): void {
    this.overrides.clear();
  }
}

/** Reads `chai.entitlement` under tenant RLS. */
@Injectable()
export class PostgresEntitlementService extends EntitlementService {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async list(tenantId: string): Promise<string[]> {
    const rows = await withTenantTransaction(
      this.database,
      { principalId: API_SERVICE_PRINCIPAL_ID, tenantId },
      (tx) => tx<{ capability_key: string }[]>`
        SELECT capability_key
        FROM chai.entitlement
        WHERE enabled = true
      `,
    );
    // Core capabilities do not need a row: every tenant has them.
    return [...new Set([...CORE_CAPABILITIES, ...rows.map((row) => row.capability_key)])];
  }
}
