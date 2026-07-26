import { randomUUID } from 'node:crypto';

import type { DatabaseTransaction } from '@chai/database';

import type { FlowDefinition } from './flow-types';

/**
 * Versioning SQL functions. Each takes a tenant-scoped transaction so RLS
 * policies on chai.automation_flow apply.
 */

export interface FlowVersionRecord {
  id: string;
  flowId: string;
  version: number;
  definition: FlowDefinition;
  changeLog: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  createdAt: string;
}

interface FlowVersionRow {
  id: string;
  flow_id: string;
  version: number;
  definition: unknown;
  change_log: string | null;
  published_at: Date | null;
  published_by: string | null;
  created_at: Date;
}

function toRecord(row: FlowVersionRow): FlowVersionRecord {
  return {
    id: row.id,
    flowId: row.flow_id,
    version: row.version,
    definition: row.definition as FlowDefinition,
    changeLog: row.change_log,
    publishedAt: row.published_at ? row.published_at.toISOString() : null,
    publishedBy: row.published_by,
    createdAt: row.created_at.toISOString(),
  };
}

/** Snapshot the current definition as a new unpublished version row. */
export async function createVersion(
  transaction: DatabaseTransaction,
  flowId: string,
  definition: FlowDefinition,
  changeLog: string | null,
): Promise<FlowVersionRecord> {
  const id = randomUUID();
  const rows = await transaction<FlowVersionRow[]>`
    INSERT INTO chai.automation_flow_version
      (id, flow_id, version, definition, change_log, created_at)
    SELECT
      ${id}::uuid,
      ${flowId}::uuid,
      COALESCE(
        (SELECT MAX(version) FROM chai.automation_flow_version WHERE flow_id = ${flowId}::uuid),
        0
      ) + 1,
      ${JSON.stringify(definition)}::jsonb,
      ${changeLog},
      now()
    RETURNING id, flow_id, version, definition, change_log, published_at, published_by, created_at
  `;
  const row = rows[0];
  if (!row) throw new Error('automation_flow_version insert returned no row');
  return toRecord(row);
}

/** Mark a version published and point the parent flow at it (active). */
export async function publishVersion(
  transaction: DatabaseTransaction,
  flowId: string,
  version: number,
  publishedBy: string,
): Promise<FlowVersionRecord> {
  const rows = await transaction<FlowVersionRow[]>`
    UPDATE chai.automation_flow_version
      SET published_at = now(), published_by = ${publishedBy}::uuid
      WHERE flow_id = ${flowId}::uuid AND version = ${version}
      RETURNING id, flow_id, version, definition, change_log, published_at, published_by, created_at
  `;
  const row = rows[0];
  if (!row) throw new Error('automation_flow_version publish matched no row');

  await transaction`
    UPDATE chai.automation_flow
      SET status = 'ACTIVE', version = ${version}, definition = ${JSON.stringify(row.definition)}::jsonb, updated_at = now()
      WHERE id = ${flowId}::uuid
  `;

  return toRecord(row);
}

/** Restore a previous version's definition as the flow's current draft. */
export async function rollbackVersion(
  transaction: DatabaseTransaction,
  flowId: string,
  version: number,
): Promise<FlowDefinition> {
  const rows = await transaction<{ definition: unknown }[]>`
    SELECT definition FROM chai.automation_flow_version
      WHERE flow_id = ${flowId}::uuid AND version = ${version}
  `;
  const row = rows[0];
  if (!row) throw new Error('rollback target version not found');
  const definition = row.definition as FlowDefinition;

  await transaction`
    UPDATE chai.automation_flow
      SET status = 'DRAFT', definition = ${JSON.stringify(definition)}::jsonb, updated_at = now()
      WHERE id = ${flowId}::uuid
  `;

  return definition;
}

export async function listVersions(
  transaction: DatabaseTransaction,
  flowId: string,
): Promise<FlowVersionRecord[]> {
  const rows = await transaction<FlowVersionRow[]>`
    SELECT id, flow_id, version, definition, change_log, published_at, published_by, created_at
      FROM chai.automation_flow_version
      WHERE flow_id = ${flowId}::uuid
      ORDER BY version DESC
  `;
  return rows.map(toRecord);
}
