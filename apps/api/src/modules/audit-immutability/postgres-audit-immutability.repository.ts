import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import { withTenantTransaction, type Database } from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import {
  AuditImmutabilityRepository,
  type AuditIntegrityCheck,
  type AuditLogEntry,
} from './audit-immutability.repository';

interface AuditEntryRow {
  action: AuditLogEntry['action'];
  actor_id: string;
  actor_type: AuditLogEntry['actorType'];
  correlation_id: string | null;
  created_at: Date;
  event_type: string;
  hash: string;
  id: string;
  ip_address: string | null;
  metadata: unknown;
  new_state: unknown;
  previous_hash: string | null;
  previous_state: unknown;
  resource_id: string;
  resource_type: string;
  tenant_id: string;
  user_agent: string | null;
}

/** Fields that participate in the hash, in the exact order they are hashed. */
type HashInput = Pick<
  AuditLogEntry,
  | 'tenantId'
  | 'eventType'
  | 'actorType'
  | 'actorId'
  | 'resourceType'
  | 'resourceId'
  | 'action'
  | 'previousState'
  | 'newState'
  | 'metadata'
  | 'createdAt'
>;

/**
 * Persistent, per-tenant, append-only audit trail (D1).
 *
 * The chain is scoped per tenant because RLS only ever exposes the caller's own
 * rows: `previous_hash` links to the previous entry OF THE SAME TENANT, and
 * verification recomputes the same way. Appends for a tenant are serialized by a
 * transaction-scoped advisory lock so two concurrent writers cannot fork the
 * chain off the same predecessor.
 *
 * ponytail: the advisory lock serializes audit appends per tenant (a single hot
 * tenant's writes queue on one lock); the ceiling is that tenant's append
 * throughput, not the table's. Lift it with a per-tenant chain sequence if it
 * ever bites.
 */
@Injectable()
export class PostgresAuditImmutabilityRepository extends AuditImmutabilityRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async createEntry(
    entry: Omit<AuditLogEntry, 'id' | 'createdAt' | 'hash' | 'previousHash'>,
  ): Promise<AuditLogEntry> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId: entry.tenantId },
      async (tx) => {
        await tx`
          SELECT pg_advisory_xact_lock(
            hashtext('chai.audit_entry'),
            hashtext(${entry.tenantId})
          )
        `;
        const [last] = await tx<{ hash: string }[]>`
          SELECT hash
          FROM chai.audit_entry
          WHERE tenant_id = ${entry.tenantId}
          ORDER BY seq DESC
          LIMIT 1
        `;
        const previousHash = last?.hash ?? null;
        const hash = this.computeHash({ ...entry, createdAt }, previousHash);

        await tx`
          INSERT INTO chai.audit_entry (
            id, tenant_id, event_type, actor_type, actor_id, resource_type,
            resource_id, action, previous_state, new_state, metadata,
            ip_address, user_agent, correlation_id, hash, previous_hash, created_at
          ) VALUES (
            ${id}, ${entry.tenantId}, ${entry.eventType}, ${entry.actorType},
            ${entry.actorId}, ${entry.resourceType}, ${entry.resourceId},
            ${entry.action},
            ${entry.previousState === null ? null : JSON.stringify(entry.previousState)}::jsonb,
            ${entry.newState === null ? null : JSON.stringify(entry.newState)}::jsonb,
            ${JSON.stringify(entry.metadata)}::jsonb,
            ${entry.ipAddress}, ${entry.userAgent}, ${entry.correlationId},
            ${hash}, ${previousHash}, ${createdAt}::timestamptz
          )
        `;
        return { ...entry, createdAt, hash, id, previousHash };
      },
    );
  }

  override async getEntry(
    tenantId: string,
    id: string,
  ): Promise<AuditLogEntry | null> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const rows = await tx<AuditEntryRow[]>`
          SELECT *
          FROM chai.audit_entry
          WHERE tenant_id = ${tenantId} AND id = ${id}
          LIMIT 1
        `;
        return rows[0] ? this.mapRow(rows[0]) : null;
      },
    );
  }

  override async listEntries(
    tenantId: string,
    filters?: { eventType?: string; resourceId?: string; resourceType?: string },
  ): Promise<AuditLogEntry[]> {
    const resourceType = filters?.resourceType ?? null;
    const resourceId = filters?.resourceId ?? null;
    const eventType = filters?.eventType ?? null;
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const rows = await tx<AuditEntryRow[]>`
          SELECT *
          FROM chai.audit_entry
          WHERE tenant_id = ${tenantId}
            AND (${resourceType}::text IS NULL OR resource_type = ${resourceType})
            AND (${resourceId}::text IS NULL OR resource_id = ${resourceId})
            AND (${eventType}::text IS NULL OR event_type = ${eventType})
          ORDER BY seq ASC
        `;
        return rows.map((row) => this.mapRow(row));
      },
    );
  }

  override async verifyChain(
    tenantId: string,
    checkedBy: string,
  ): Promise<AuditIntegrityCheck> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const rows = await tx<AuditEntryRow[]>`
          SELECT *
          FROM chai.audit_entry
          WHERE tenant_id = ${tenantId}
          ORDER BY seq ASC
        `;
        const entries = rows.map((row) => this.mapRow(row));

        let verifiedEntries = 0;
        let brokenChains = 0;
        let expectedPreviousHash: string | null = null;
        for (const entry of entries) {
          const expectedHash = this.computeHash(entry, expectedPreviousHash);
          if (
            entry.hash === expectedHash &&
            entry.previousHash === expectedPreviousHash
          ) {
            verifiedEntries += 1;
          } else {
            brokenChains += 1;
          }
          expectedPreviousHash = entry.hash;
        }

        return {
          brokenChains,
          checkedAt: new Date().toISOString(),
          checkedBy,
          details: { brokenChains },
          firstEntryId: entries[0]?.id ?? null,
          id: randomUUID(),
          lastEntryId: entries[entries.length - 1]?.id ?? null,
          status: brokenChains === 0 ? 'passed' : 'failed',
          tenantId,
          totalEntries: entries.length,
          verifiedEntries,
        };
      },
    );
  }

  /**
   * SHA-256 over the identity fields plus the previous hash. Nested JSON is
   * canonicalized (deep key-sort) so a jsonb round trip -- which does not
   * preserve key order -- still hashes identically at verification time.
   */
  private computeHash(input: HashInput, previousHash: string | null): string {
    const content = JSON.stringify({
      tenantId: input.tenantId,
      eventType: input.eventType,
      actorType: input.actorType,
      actorId: input.actorId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      action: input.action,
      previousState: canonicalize(input.previousState),
      newState: canonicalize(input.newState),
      metadata: canonicalize(input.metadata),
      createdAt: input.createdAt,
      previousHash,
    });
    return createHash('sha256').update(content).digest('hex');
  }

  private mapRow(row: AuditEntryRow): AuditLogEntry {
    return {
      action: row.action,
      actorId: row.actor_id,
      actorType: row.actor_type,
      correlationId: row.correlation_id,
      createdAt: row.created_at.toISOString(),
      eventType: row.event_type,
      hash: row.hash,
      id: row.id,
      ipAddress: row.ip_address,
      metadata: parseJson<Record<string, unknown>>(row.metadata),
      newState: parseJson<Record<string, unknown> | null>(row.new_state),
      previousHash: row.previous_hash,
      previousState: parseJson<Record<string, unknown> | null>(row.previous_state),
      resourceId: row.resource_id,
      resourceType: row.resource_type,
      tenantId: row.tenant_id,
      userAgent: row.user_agent,
    };
  }
}

/** Decode a jsonb column that this driver returns as a raw JSON string. */
function parseJson<T>(value: unknown): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
}

/** Deep key-sorted clone so hashing is stable across a jsonb round trip. */
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    sorted[key] = canonicalize(source[key]);
  }
  return sorted;
}
