import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

/**
 * Durable per-tenant realtime replay window backed by `chai.realtime_event`.
 *
 * The realtime gateway kept this window in process memory, so a restart lost
 * every client cursor and two replicas served different histories. Blueprint
 * 06_API §11 requires a bounded replay window addressable by `Last-Event-ID`,
 * which means it must outlive the process.
 *
 * Every read and write runs inside a tenant-scoped transaction, so RLS — not
 * application code — keeps one tenant's stream out of another's connection.
 * Ordering is by the table sequence, not by timestamp, because two events in the
 * same millisecond still need a total order.
 *
 * Structurally compatible with the gateway's `RealtimeEventStore` interface; it
 * lives here so it can be exercised against a real database without the gateway
 * app depending on test infrastructure.
 */

export interface RealtimeEvent {
  aggregateId?: string;
  data: unknown;
  event: string;
  id: string;
  version?: number;
}

export class PostgresRealtimeEventStore {
  constructor(
    private readonly database: Database,
    private readonly principalId: string,
    private readonly retention = 500,
  ) {}

  async append(tenantId: string, event: RealtimeEvent): Promise<void> {
    await this.withTenant(tenantId, async (tx) => {
      await tx`
        INSERT INTO chai.realtime_event (
          tenant_id, event_id, event_type, aggregate_id, version, payload
        ) VALUES (
          ${tenantId},
          ${event.id},
          ${event.event},
          ${event.aggregateId ?? null},
          ${event.version ?? null},
          ${JSON.stringify(event.data ?? {})}::jsonb
        )
        ON CONFLICT (tenant_id, event_id) DO NOTHING
      `;
    });
  }

  async replay(
    tenantId: string,
    cursor: string | null,
    limit: number,
  ): Promise<RealtimeEvent[]> {
    return this.withTenant(tenantId, async (tx) => {
      const from = cursor === null ? null : await this.seqOf(tx, cursor);
      if (cursor !== null && from === null) {
        // Cursor predates retention or is unknown: the caller must refetch.
        return [];
      }
      const rows = await tx<
        {
          aggregate_id: string | null;
          event_id: string;
          event_type: string;
          payload: unknown;
          version: number | null;
        }[]
      >`
        SELECT event_id, event_type, aggregate_id, version, payload
        FROM chai.realtime_event
        WHERE (${from}::bigint IS NULL OR seq > ${from}::bigint)
        ORDER BY seq
        LIMIT ${Math.max(1, Math.trunc(limit))}::int
      `;
      return rows.map((row) => ({
        data: row.payload,
        event: row.event_type,
        id: row.event_id,
        ...(row.aggregate_id ? { aggregateId: row.aggregate_id } : {}),
        ...(row.version === null ? {} : { version: row.version }),
      }));
    });
  }

  async hasGap(tenantId: string, cursor: string): Promise<boolean> {
    return this.withTenant(
      tenantId,
      async (tx) => (await this.seqOf(tx, cursor)) === null,
    );
  }

  /**
   * Trims the replay window to the newest `retention` events for one tenant.
   * Maintenance work: only the worker role holds DELETE on this table.
   */
  async prune(tenantId: string): Promise<number> {
    return this.withTenant(tenantId, async (tx) => {
      const rows = await tx<{ count: number }[]>`
        WITH doomed AS (
          DELETE FROM chai.realtime_event
          WHERE seq NOT IN (
            SELECT seq FROM chai.realtime_event
            ORDER BY seq DESC
            LIMIT ${Math.max(1, Math.trunc(this.retention))}::int
          )
          RETURNING seq
        )
        SELECT count(*)::integer AS count FROM doomed
      `;
      return rows[0]?.count ?? 0;
    });
  }

  private async seqOf(
    transaction: DatabaseTransaction,
    eventId: string,
  ): Promise<string | null> {
    const rows = await transaction<{ seq: string }[]>`
      SELECT seq FROM chai.realtime_event WHERE event_id = ${eventId} LIMIT 1
    `;
    return rows[0]?.seq ?? null;
  }

  private async withTenant<T>(
    tenantId: string,
    run: (transaction: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    return withTenantTransaction(
      this.database,
      { principalId: this.principalId, tenantId },
      run,
    );
  }
}
