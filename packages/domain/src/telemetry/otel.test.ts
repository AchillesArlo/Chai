import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { startTelemetry, withSpan, type TelemetryHandle } from './otel';

/**
 * Fase 4 (R-18) regression: telemetry must actually export spans, and PII must
 * not ride along in span attributes.
 *
 * The OTel API registers its provider globally once per process, so the SDK is
 * started a single time for the whole file and the exporter is reset per test.
 */
describe('otel telemetry', () => {
  const exporter = new InMemorySpanExporter();
  let handle: TelemetryHandle;

  beforeAll(() => {
    handle = startTelemetry(
      {
        environment: 'test',
        otlpEndpoint: 'http://localhost:4318',
        serviceName: 'chai-api',
        serviceVersion: '1.2.3',
      },
      exporter,
    );
  });

  afterEach(() => {
    exporter.reset();
  });

  afterAll(async () => {
    await handle.shutdown();
  });

  it('reports itself enabled when a collector is configured', () => {
    expect(handle.enabled).toBe(true);
  });

  it('reports itself disabled when no collector is configured', () => {
    // Silently pretending to export is the failure mode this replaces.
    const disabled = startTelemetry({
      environment: 'test',
      serviceName: 'chai-worker',
      serviceVersion: '0.0.0',
    });
    expect(disabled.enabled).toBe(false);
  });

  it('exports a real span carrying the service resource', async () => {
    await withSpan('payment.checkout', async () => 'ok', {
      'payment.provider': 'midtrans',
    });
    await handle.flush();

    const span = exporter
      .getFinishedSpans()
      .find((candidate) => candidate.name === 'payment.checkout');
    expect(span).toBeDefined();
    expect(span?.attributes['payment.provider']).toBe('midtrans');
    expect(span?.resource.attributes['service.name']).toBe('chai-api');
    expect(span?.resource.attributes['deployment.environment.name']).toBe('test');
  });

  it('redacts PII from span attributes before export', async () => {
    await withSpan('contact.lookup', async () => 'ok', {
      email: 'buyer@example.com',
      phone: '+6281234567890',
      'tenant.id': 'tenant-1',
    });
    await handle.flush();

    const span = exporter
      .getFinishedSpans()
      .find((candidate) => candidate.name === 'contact.lookup');
    expect(span?.attributes['email']).not.toBe('buyer@example.com');
    expect(span?.attributes['phone']).not.toBe('+6281234567890');
    // Non-PII attributes must survive, otherwise the trace becomes useless.
    expect(span?.attributes['tenant.id']).toBe('tenant-1');
  });

  it('records the exception and rethrows when the wrapped work fails', async () => {
    await expect(
      withSpan('failing.op', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await handle.flush();

    const span = exporter
      .getFinishedSpans()
      .find((candidate) => candidate.name === 'failing.op');
    expect(span?.status.code).toBe(2);
    expect(span?.events.map((event) => event.name)).toContain('exception');
  });

  it('keeps the parent-child relationship across nested spans', async () => {
    await withSpan('api.request', async () => {
      await withSpan('worker.job', async () => 'done');
    });
    await handle.flush();

    const spans = exporter.getFinishedSpans();
    const parent = spans.find((candidate) => candidate.name === 'api.request');
    const child = spans.find((candidate) => candidate.name === 'worker.job');
    expect(child?.parentSpanContext?.spanId).toBe(parent?.spanContext().spanId);
    expect(child?.spanContext().traceId).toBe(parent?.spanContext().traceId);
  });
});
