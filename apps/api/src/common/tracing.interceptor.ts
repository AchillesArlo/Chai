import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { context as otelContext } from '@opentelemetry/api';
import type { FastifyRequest } from 'fastify';
import type { Observable } from 'rxjs';

import { requestTraceContext } from './tracing.hook';

/**
 * Re-enters the request span's context inside the Nest pipeline.
 *
 * The span itself is created and ended by `registerTracingHook`, because guards
 * run before interceptors and a guard rejection must still be traced. This
 * interceptor exists so that work performed by the handler — notably
 * `appendOutboxEvent`, which persists the current traceparent — sees the request
 * span as its parent instead of starting an orphan trace.
 */
@Injectable()
export class TracingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const traceContext = requestTraceContext(request);
    if (!traceContext) {
      return next.handle();
    }

    return otelContext.with(traceContext, () => next.handle());
  }
}
