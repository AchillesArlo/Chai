import type { ServerSentEvent } from '@chai/contracts';

/**
 * Serializes a canonical event into the SSE wire format. Data is JSON-encoded;
 * multi-line payloads are split across `data:` lines per the SSE spec.
 */
/**
 * Serializes a canonical event into the SSE wire format.
 *
 * The `data` frame carries an explicit envelope — `{ aggregateId, version,
 * payload }` — so a client can apply version gating (06_API §11) without a
 * second lookup. `id` stays the bare event id because that is what the client
 * echoes back as `Last-Event-ID` for replay.
 */
export function serializeServerSentEvent(event: ServerSentEvent): string {
  const envelope = {
    aggregateId: event.aggregateId ?? null,
    payload: event.data ?? null,
    version: event.version ?? null,
  };
  const lines = JSON.stringify(envelope).split('\n');
  const body = lines.map((line) => `data: ${line}`).join('\n');
  return `event: ${event.event}\nid: ${event.id}\n${body}\n\n`;
}

export function serializeRefetchRequired(reason: string): string {
  const payload = JSON.stringify({ control: 'refetch-required', reason });
  return `event: refetch-required\ndata: ${payload}\n\n`;
}
