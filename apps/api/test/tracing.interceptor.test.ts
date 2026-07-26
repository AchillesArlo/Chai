import { context as otelContext, trace } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import type { FastifyRequest } from 'fastify';
import { of } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTelemetry, type TelemetryHandle } from '@chai/domain';

import { TracingInterceptor } from '../src/common/tracing.interceptor';

/**
 * Gelombang 3 regression: the handler runs inside the request span's context.
 *
 * This is the link that makes `appendOutboxEvent` capture a traceparent. If the
 * interceptor stops re-entering the stored context, the outbox event is written
 * with no trace context and the trace dies at the process boundary — silently.
 *
 * Telemetry is started here because context propagation needs a real context
 * manager; without an SDK, `context.with` is a no-op.
 */
function executionContext(request: Partial<FastifyRequest>) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request as FastifyRequest,
      getResponse: () => ({ statusCode: 200 }),
    }),
  } as unknown as Parameters<TracingInterceptor['intercept']>[0];
}

describe('TracingInterceptor', () => {
  let telemetry: TelemetryHandle;

  beforeAll(() => {
    telemetry = startTelemetry(
      {
        environment: 'test',
        otlpEndpoint: 'http://localhost:4318',
        serviceName: 'chai-api',
        serviceVersion: '1.0.0',
      },
      new InMemorySpanExporter(),
    );
  });

  afterAll(async () => {
    await telemetry.shutdown();
  });
  it('runs the handler inside the context stored by the Fastify hook', () => {
    const tracer = trace.getTracer('test');
    const span = tracer.startSpan('request');
    const stored = trace.setSpan(otelContext.active(), span);
    let observed: string | undefined;

    new TracingInterceptor()
      .intercept(executionContext({ otelContext: stored, otelSpan: span }), {
        handle: () => {
          observed = trace.getSpanContext(otelContext.active())?.spanId;
          return of('ok');
        },
      })
      .subscribe();

    expect(observed).toBe(span.spanContext().spanId);
    span.end();
  });

  it('still runs the handler when tracing is disabled', () => {
    let ran = false;

    new TracingInterceptor()
      .intercept(executionContext({}), {
        handle: () => {
          ran = true;
          return of('ok');
        },
      })
      .subscribe();

    // Telemetry is off unless an OTLP endpoint is configured; a request must not
    // depend on it.
    expect(ran).toBe(true);
  });

  it('leaves non-http contexts untouched', () => {
    let ran = false;
    const nonHttp = {
      getType: () => 'rpc',
    } as unknown as Parameters<TracingInterceptor['intercept']>[0];

    new TracingInterceptor()
      .intercept(nonHttp, {
        handle: () => {
          ran = true;
          return of('ok');
        },
      })
      .subscribe();

    expect(ran).toBe(true);
  });
});
