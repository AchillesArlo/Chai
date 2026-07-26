import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase, withTenantTransaction } from '@chai/database';

import { appendOutboxEvent } from '../src/outbox/producer';
import { claimOutboxBatch } from '../src/outbox/dispatcher';
import { startTelemetry, withSpan, type TelemetryHandle } from '../src/telemetry/otel';
import { DOMAIN_IDS, resetDispatcherTables, seedFoundation } from './fixtures';

/**
 * Gelombang 3 regression: the trace context crosses the outbox boundary through
 * the database.
 *
 * Also the migration check for `0047_outbox_trace_context.sql`: these fail if the
 * column or its shape constraint is missing.
 */
const TENANT_A = DOMAIN_IDS.tenantA;
const PRINCIPAL_A = DOMAIN_IDS.userA;
const contextA = { principalId: PRINCIPAL_A, tenantId: TENANT_A };

describe('outbox trace context', () => {
  let adminDatabaseUrl: string;
  let runtimeDatabaseUrl: string;
  let handle: TelemetryHandle;

  beforeAll(async () => {
    adminDatabaseUrl = inject('adminDatabaseUrl');
    runtimeDatabaseUrl = inject('workerDatabaseUrl');
    await seedFoundation(adminDatabaseUrl);
    handle = startTelemetry(
      {
        environment: 'test',
        otlpEndpoint: 'http://localhost:4318',
        serviceName: 'chai-api',
        serviceVersion: '1.0.0',
      },
      new InMemorySpanExporter(),
    );
  });

  afterEach(async () => {
    await resetDispatcherTables(adminDatabaseUrl);
  });

  afterAll(async () => {
    await handle.shutdown();
  });

  function appendEvent(): Promise<string> {
    const database = createDatabase(runtimeDatabaseUrl);
    return withTenantTransaction(database, contextA, (transaction) =>
      appendOutboxEvent(transaction, {
        // Any aggregate id works here: the outbox has no FK to the aggregate,
        // and this suite is about the trace context, not the aggregate.
        aggregateId: DOMAIN_IDS.userA,
        aggregateType: 'conversation',
        aggregateVersion: 1,
        eventType: 'message.created',
        payload: { probe: true },
        tenantId: TENANT_A,
      }),
    ).finally(() => database.end());
  }

  it('persists the producing traceparent and hands it to the consumer', async () => {
    let eventId = '';
    let expectedTraceId = '';

    await withSpan('api.request', async () => {
      eventId = await appendEvent();
      const { trace } = await import('@opentelemetry/api');
      expectedTraceId = trace.getActiveSpan()?.spanContext().traceId ?? '';
    });

    const admin = postgres(adminDatabaseUrl, { max: 1 });
    try {
      const rows = await admin<{ traceparent: string | null }[]>`
        SELECT traceparent FROM chai.outbox_event WHERE id = ${eventId}
      `;
      const stored = rows[0]?.traceparent;
      expect(stored).toMatch(/^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
      expect(stored).toContain(expectedTraceId);
    } finally {
      await admin.end();
    }

    // The dispatcher must receive it, otherwise persisting it achieves nothing.
    const database = createDatabase(runtimeDatabaseUrl);
    try {
      const claims = await withTenantTransaction(database, contextA, (transaction) =>
        claimOutboxBatch(transaction, { leaseMs: 1_000, limit: 10 }),
      );
      const claim = claims.find((candidate) => candidate.id === eventId);
      expect(claim?.traceparent).toContain(expectedTraceId);
    } finally {
      await database.end();
    }
  });

  it('appends the event even when nothing is being traced', async () => {
    // Telemetry is off in most environments. A business event must still commit.
    const eventId = await appendEvent();

    const admin = postgres(adminDatabaseUrl, { max: 1 });
    try {
      const rows = await admin<{ traceparent: string | null }[]>`
        SELECT traceparent FROM chai.outbox_event WHERE id = ${eventId}
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.traceparent).toBeNull();
    } finally {
      await admin.end();
    }
  });

  it('refuses a malformed traceparent at the database boundary', async () => {
    // Needs a row to update, otherwise the statement matches nothing and the
    // constraint is never exercised.
    const eventId = await appendEvent();
    const admin = postgres(adminDatabaseUrl, { max: 1 });
    try {
      // A malformed value would silently break context extraction downstream.
      await expect(
        admin`
          UPDATE chai.outbox_event SET traceparent = 'garbage'
          WHERE id = ${eventId}
        `,
      ).rejects.toThrow(/outbox_event_traceparent_shape/);
    } finally {
      await admin.end();
    }
  });
});
