import { context as otelContext, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Context, Span } from '@opentelemetry/api';
import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * One span per HTTP request, owned by a Fastify hook (12 §2).
 *
 * A Nest interceptor cannot do this job alone: Nest runs guards BEFORE
 * interceptors, so a request rejected by the audience, authorization, or
 * entitlement guard never reaches an interceptor and would produce no span at
 * all. A 401 spike during an attack, or a 403 storm from a misconfigured
 * entitlement, is exactly what an operator needs to see.
 *
 * The hook owns the span lifecycle; `TracingInterceptor` only re-enters the
 * stored context so work inside the handler — including the outbox append that
 * persists the traceparent — is attached to this span.
 */
export function registerTracingHook(fastify: FastifyInstance): void {
  const tracer = trace.getTracer('chai-api');

  fastify.addHook('onRequest', (request, _reply, done) => {
    // `routeOptions.url` is the route pattern (`/api/client/v1/payments/:id`), so
    // span names stay bounded instead of becoming one name per resource id. An
    // unmatched path has no pattern; naming it after the raw URL would let a
    // scanner mint unlimited span names.
    const route = request.routeOptions?.url ?? '(unmatched)';
    const span = tracer.startSpan(`${request.method} ${route}`, {
      attributes: {
        // Low-cardinality identifiers only. No body, no headers, no customer
        // text: spans leave the process, and the redacting span processor is a
        // safety net rather than a licence to attach PII.
        'chai.correlation_id': request.correlationId,
        'http.request.method': request.method,
        'http.route': route,
      },
    });
    request.otelSpan = span;
    request.otelContext = trace.setSpan(otelContext.active(), span);
    done();
  });

  fastify.addHook('onResponse', (request, reply, done) => {
    const span = request.otelSpan;
    if (span) {
      span.setAttribute('http.response.status_code', reply.statusCode);
      if (request.tenantContext?.tenantId) {
        span.setAttribute('chai.tenant.id', request.tenantContext.tenantId);
      }
      if (request.principal?.kind) {
        span.setAttribute('chai.principal.kind', request.principal.kind);
      }
      // Per OTel semantics a 4xx on a server span is not an error: the caller
      // sent something we refused. Only 5xx means this service failed.
      span.setStatus({
        code: reply.statusCode >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
      });
      span.end();
    }
    done();
  });
}

/** The span owning the current request, if tracing is active. */
export function requestSpan(request: FastifyRequest): Span | undefined {
  return request.otelSpan;
}

/** The OTel context to re-enter inside the Nest pipeline. */
export function requestTraceContext(request: FastifyRequest): Context | undefined {
  return request.otelContext;
}
