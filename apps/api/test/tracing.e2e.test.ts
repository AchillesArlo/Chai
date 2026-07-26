import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTelemetry, type TelemetryHandle } from '@chai/domain';

import { createApplication } from '../src/bootstrap';

/**
 * Gelombang 3 regression: every HTTP request produces one span.
 *
 * These fail if `TracingInterceptor` is unregistered or stops being outermost —
 * in which case an outbox event written during the request would carry no
 * traceparent and the trace would stop at the process boundary.
 */
describe('request tracing', () => {
  const exporter = new InMemorySpanExporter();
  let app: NestFastifyApplication;
  let telemetry: TelemetryHandle;

  beforeAll(async () => {
    telemetry = startTelemetry(
      {
        environment: 'test',
        otlpEndpoint: 'http://localhost:4318',
        serviceName: 'chai-api',
        serviceVersion: '1.0.0',
      },
      exporter,
    );
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await telemetry.shutdown();
  });

  it('names the span after the route pattern, not the concrete path', async () => {
    exporter.reset();
    const response = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/conversations',
    });
    expect(response.statusCode).toBe(200);
    await telemetry.flush();

    const span = exporter
      .getFinishedSpans()
      .find((candidate) => candidate.name.includes('/api/client/v1/conversations'));
    expect(span).toBeDefined();
    expect(span?.attributes['http.request.method']).toBe('GET');
    expect(span?.attributes['http.route']).toBe('/api/client/v1/conversations');
    expect(span?.attributes['http.response.status_code']).toBe(200);
  });

  it('keeps resource ids out of the span name so cardinality stays bounded', async () => {
    exporter.reset();
    // 403 here (the payment capability is off by default) — which is exactly the
    // case a Nest interceptor alone would miss, since guards run before
    // interceptors.
    const response = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/payments/some-external-id',
    });
    expect(response.statusCode).toBe(403);
    await telemetry.flush();

    const names = exporter.getFinishedSpans().map((candidate) => candidate.name);
    expect(names).toContain('GET /api/client/v1/payments/:externalId');
    expect(names.some((name) => name.includes('some-external-id'))).toBe(false);
  });

  it('traces a request rejected by a guard', async () => {
    exporter.reset();
    const response = await app.inject({
      // No test subject: the audience guard rejects this before any handler runs.
      method: 'GET',
      url: '/api/client/v1/conversations',
    });
    expect(response.statusCode).toBe(401);
    await telemetry.flush();

    const span = exporter
      .getFinishedSpans()
      .find((candidate) => candidate.name === 'GET /api/client/v1/conversations');
    expect(span).toBeDefined();
    expect(span?.attributes['http.response.status_code']).toBe(401);
    // Per OTel semantics a 4xx on a server span is not this service failing, so
    // the status stays OK while the code itself carries the refusal.
    expect(span?.status.code).toBe(1);
  });

  it('does not mint a span name per unmatched path', async () => {
    exporter.reset();
    await app.inject({ method: 'GET', url: '/api/does-not-exist-12345' });
    await telemetry.flush();

    const names = exporter.getFinishedSpans().map((candidate) => candidate.name);
    // A scanner hitting random paths must not create unbounded span names.
    expect(names).toContain('GET (unmatched)');
    expect(names.some((name) => name.includes('does-not-exist-12345'))).toBe(false);
  });
});
