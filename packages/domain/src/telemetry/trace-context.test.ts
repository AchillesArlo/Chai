import { context, propagation, trace } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTelemetry, withSpan, type TelemetryHandle } from './otel';
import { currentTraceparent, withRemoteTraceContext } from './trace-context';

/**
 * Gelombang 3 regression: a trace survives the outbox boundary.
 *
 * Without this, the worker that performs an external effect starts its own trace
 * and an operator cannot connect a failed delivery back to the request that
 * caused it — which is the whole reason the traceparent is persisted.
 */
describe('trace context propagation', () => {
  const exporter = new InMemorySpanExporter();
  let handle: TelemetryHandle;

  beforeAll(() => {
    handle = startTelemetry(
      {
        environment: 'test',
        otlpEndpoint: 'http://localhost:4318',
        serviceName: 'chai-api',
        serviceVersion: '1.0.0',
      },
      exporter,
    );
  });

  afterAll(async () => {
    await handle.shutdown();
  });

  it('returns null when nothing is being traced', () => {
    // Telemetry is off in most environments; a missing trace context must be a
    // normal outcome, not an error that blocks writing a business event.
    expect(currentTraceparent()).toBeNull();
  });

  it('captures the active span as a W3C traceparent', async () => {
    let captured: string | null = null;
    await withSpan('api.request', async () => {
      captured = currentTraceparent();
    });

    expect(captured).toMatch(/^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
  });

  it('continues the producing trace in the consuming process', async () => {
    let producedTraceparent: string | null = null;
    let apiTraceId = '';
    let apiSpanId = '';

    await withSpan('api.request', async () => {
      producedTraceparent = currentTraceparent();
      const active = trace.getActiveSpan()?.spanContext();
      apiTraceId = active?.traceId ?? '';
      apiSpanId = active?.spanId ?? '';
    });

    // Simulates the worker: a fresh context, only the stored header to go on.
    await withRemoteTraceContext(producedTraceparent, () =>
      withSpan('outbox.dispatch payment.created', async () => 'published'),
    );
    await handle.flush();

    const dispatch = exporter
      .getFinishedSpans()
      .find((span) => span.name === 'outbox.dispatch payment.created');
    expect(dispatch?.spanContext().traceId).toBe(apiTraceId);
    expect(dispatch?.parentSpanContext?.spanId).toBe(apiSpanId);
  });

  it('still runs the work when the trace context is missing or malformed', async () => {
    const results: string[] = [];
    results.push(withRemoteTraceContext(null, () => 'ran without context'));
    results.push(withRemoteTraceContext('not-a-traceparent', () => 'ran despite garbage'));

    // Losing a trace must never lose a delivery.
    expect(results).toEqual(['ran without context', 'ran despite garbage']);
  });

  it('does not leak the remote context outside its callback', async () => {
    let inside = '';
    await withSpan('api.request', async () => {
      const traceparent = currentTraceparent();
      withRemoteTraceContext(traceparent, () => {
        inside = trace.getSpanContext(context.active())?.traceId ?? '';
      });
    });
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);

    expect(inside).toHaveLength(32);
    expect(carrier['traceparent']).toBeUndefined();
  });
});
