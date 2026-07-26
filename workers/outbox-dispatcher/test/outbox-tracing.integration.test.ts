import { trace } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { createDatabase } from '@chai/database';
import { startTelemetry, type TelemetryHandle } from '@chai/domain';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';

import { runOutboxDispatcher, type OutboxPublisher } from '../src';

import {
  clearOutbox,
  seedOutboxEvent,
  seedTenantRoster,
  WORKER_IDS,
} from './helpers';

/**
 * Gelombang 3 regression: the dispatcher continues the trace that produced the
 * event instead of starting its own.
 *
 * Without this, an operator looking at a failed delivery sees an orphan trace and
 * cannot reach the request that caused it — the reason the traceparent is stored
 * on the event in the first place.
 */
describe('outbox dispatcher tracing', () => {
  const exporter = new InMemorySpanExporter();
  let adminDatabaseUrl: string;
  let workerDatabaseUrl: string;
  let telemetry: TelemetryHandle;

  beforeAll(async () => {
    adminDatabaseUrl = inject('adminDatabaseUrl');
    workerDatabaseUrl = inject('workerDatabaseUrl');
    await seedTenantRoster(adminDatabaseUrl);
    telemetry = startTelemetry(
      {
        environment: 'test',
        otlpEndpoint: 'http://localhost:4318',
        serviceName: 'chai-outbox-dispatcher',
        serviceVersion: '1.0.0',
      },
      exporter,
    );
  });

  afterEach(async () => {
    await clearOutbox(adminDatabaseUrl);
    exporter.reset();
  });

  afterAll(async () => {
    await telemetry.shutdown();
  });

  async function setTraceparent(id: string, traceparent: string): Promise<void> {
    const admin = postgres(adminDatabaseUrl, { max: 1 });
    try {
      await admin`
        UPDATE chai.outbox_event SET traceparent = ${traceparent} WHERE id = ${id}
      `;
    } finally {
      await admin.end();
    }
  }

  async function dispatchOnce(): Promise<void> {
    const publisher: OutboxPublisher = {
      async publish() {
        return 'acked';
      },
    };
    const worker = createDatabase(workerDatabaseUrl);
    try {
      await runOutboxDispatcher({
        database: worker,
        iterations: 1,
        options: {
          leaseMs: 5_000,
          limit: 10,
          maxAttempts: 3,
          pollIntervalMs: 10,
          retryBackoffMs: 0,
        },
        publisher,
        tenants: [{ principalId: WORKER_IDS.userA, tenantId: WORKER_IDS.tenantA }],
      });
    } finally {
      await worker.end();
    }
  }

  it('dispatches inside the trace that produced the event', async () => {
    const traceId = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const producerSpanId = '0102030405060708';
    await seedOutboxEvent(adminDatabaseUrl, WORKER_IDS.outboxOne, 'message.delivered');
    await setTraceparent(WORKER_IDS.outboxOne, `00-${traceId}-${producerSpanId}-01`);

    await dispatchOnce();
    await telemetry.flush();

    const span = exporter
      .getFinishedSpans()
      .find((candidate) => candidate.name === 'outbox.dispatch message.delivered');
    expect(span).toBeDefined();
    expect(span?.spanContext().traceId).toBe(traceId);
    expect(span?.parentSpanContext?.spanId).toBe(producerSpanId);
    expect(span?.attributes['chai.outbox.event_id']).toBe(WORKER_IDS.outboxOne);
    expect(span?.attributes['chai.tenant.id']).toBe(WORKER_IDS.tenantA);
  });

  it('still dispatches an event that carries no trace context', async () => {
    await seedOutboxEvent(adminDatabaseUrl, WORKER_IDS.outboxTwo, 'message.read');

    await dispatchOnce();
    await telemetry.flush();

    const span = exporter
      .getFinishedSpans()
      .find((candidate) => candidate.name === 'outbox.dispatch message.read');
    // A missing trace context must not stop the delivery; the span simply starts
    // a new trace.
    expect(span).toBeDefined();
    expect(span?.parentSpanContext).toBeUndefined();

    const admin = postgres(adminDatabaseUrl, { max: 1 });
    try {
      const rows = await admin<{ status: string }[]>`
        SELECT status FROM chai.outbox_event WHERE id = ${WORKER_IDS.outboxTwo}
      `;
      expect(rows[0]?.status).toBe('PUBLISHED');
    } finally {
      await admin.end();
    }
  });

  it('leaves no active span behind after the batch', async () => {
    await seedOutboxEvent(adminDatabaseUrl, WORKER_IDS.outboxOne, 'message.delivered');
    await dispatchOnce();

    // A leaked active span would silently reparent everything the process does
    // next.
    expect(trace.getActiveSpan()).toBeUndefined();
  });
});
