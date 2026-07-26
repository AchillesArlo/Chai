import type { Context, Span } from '@opentelemetry/api';
import type { Principal } from '@chai/auth';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
    /** Owned by registerTracingHook; the span covering this request. */
    otelSpan?: Span;
    /** OTel context carrying otelSpan, re-entered by TracingInterceptor. */
    otelContext?: Context;
    principal?: Principal;
    tenantContext?: {
      principalId: string;
      tenantId: string;
    };
  }
}
