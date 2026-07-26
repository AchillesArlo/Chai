// Trace context that survives a process boundary (12 §2, ADR-018).
//
// An outbox event is handed to a worker in another process, so the in-memory
// OTel context does not follow it. Storing the W3C `traceparent` with the event
// is what lets an operator answer "which request caused this failed delivery?"
// instead of seeing two unrelated traces.
import { context, propagation, trace } from '@opentelemetry/api';

/**
 * Returns the current `traceparent`, or null when nothing is being traced.
 *
 * Null is a normal outcome: telemetry is disabled unless an OTLP endpoint is
 * configured, and a missing trace context must never block a business event.
 */
export function currentTraceparent(): string | null {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  const traceparent = carrier['traceparent'];
  return traceparent ?? null;
}

/**
 * Runs `fn` inside the trace the given `traceparent` belongs to.
 *
 * The worker span becomes a child of the API span that produced the event, so
 * one trace spans request → transaction → dispatch → external effect. A missing
 * or malformed value simply runs `fn` in a fresh context rather than throwing —
 * losing a trace must not lose a delivery.
 */
export function withRemoteTraceContext<T>(
  traceparent: string | null | undefined,
  fn: () => T,
): T {
  if (!traceparent) {
    return fn();
  }
  const extracted = propagation.extract(context.active(), { traceparent });
  if (!trace.getSpanContext(extracted)) {
    return fn();
  }
  return context.with(extracted, fn);
}
