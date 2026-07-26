import type { OutboxClaim } from '@chai/domain';

/** All outbox streams share this prefix; the suffix is the event type. */
export const OUTBOX_STREAM_PREFIX = 'chai:outbox:';

/**
 * One Redis stream per event type.
 *
 * A consumer subscribes to the types it handles (`XREADGROUP` on that stream)
 * instead of reading every event on the platform and discarding most of them.
 * Redis preserves insertion order within a stream, so this also gives per-type
 * FIFO. Tenant is carried in the message rather than the key: keying by tenant
 * would make the stream count grow with tenants and force fan-out consumers to
 * enumerate tenants — the very problem the DB-side roster already has.
 */
export function outboxStreamKey(eventType: string): string {
  return `${OUTBOX_STREAM_PREFIX}${eventType}`;
}

/** Decoded stream entry. Mirrors the fields of an `OutboxClaim` that survive the
 * broker boundary; `payload` is re-parsed from its JSON transport form. */
export interface OutboxStreamMessage {
  aggregateId: string;
  aggregateType: string;
  aggregateVersion: number;
  eventId: string;
  eventType: string;
  partitionKey: string;
  payload: unknown;
  schemaVersion: number;
  tenantId: string;
  /** W3C trace context of the producing request, or null when untraced. */
  traceparent: string | null;
}

/**
 * Flattens a claim into the `[field, value, ...]` string pairs `XADD` expects.
 *
 * `traceparent` is appended only when present: it is diagnostic data, so a
 * missing value is a normal state the consumer reads back as `null` rather than
 * a sentinel it has to special-case.
 */
export function encodeOutboxFields(claim: OutboxClaim): string[] {
  const fields = [
    'event_id',
    claim.id,
    'tenant_id',
    claim.tenantId,
    'event_type',
    claim.eventType,
    'schema_version',
    String(claim.schemaVersion),
    'aggregate_type',
    claim.aggregateType,
    'aggregate_id',
    claim.aggregateId,
    'aggregate_version',
    String(claim.aggregateVersion),
    'partition_key',
    claim.partitionKey,
    'payload',
    JSON.stringify(claim.payload ?? null),
  ];
  if (claim.traceparent) {
    fields.push('traceparent', claim.traceparent);
  }
  return fields;
}

/** Rebuilds a message from a stream entry's field map. Falls back to the entry
 * id for `event_id` so a malformed producer can never yield an empty key for
 * deduplication. */
export function decodeOutboxMessage(
  entryId: string,
  fields: Record<string, string>,
): OutboxStreamMessage {
  const traceparent = fields['traceparent'];
  return {
    aggregateId: fields['aggregate_id'] ?? '',
    aggregateType: fields['aggregate_type'] ?? '',
    aggregateVersion: parseIntOrZero(fields['aggregate_version']),
    eventId: fields['event_id'] ?? entryId,
    eventType: fields['event_type'] ?? '',
    partitionKey: fields['partition_key'] ?? '',
    payload: parseJsonOrNull(fields['payload']),
    schemaVersion: parseIntOrZero(fields['schema_version']),
    tenantId: fields['tenant_id'] ?? '',
    traceparent: traceparent && traceparent.length > 0 ? traceparent : null,
  };
}

function parseIntOrZero(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseJsonOrNull(value: string | undefined): unknown {
  if (value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch {
    // A non-JSON payload is corruption in transit; hand back the raw string so
    // the handler can decide, rather than throwing away the whole message.
    return value;
  }
}
