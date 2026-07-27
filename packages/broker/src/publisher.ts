import type { OutboxClaim } from '@chai/domain';

import type { BrokerClient } from './client';
import { encodeOutboxFields, outboxStreamKey } from './outbox-stream';

/** Structurally identical to the dispatcher's `OutboxPublishResult`; the
 * dispatcher marks the event PUBLISHED only on `'acked'`. */
export type OutboxPublishResult = 'acked' | 'failed';

/** Default approximate stream cap. Large enough to absorb a normal consumer
 * backlog, small enough that delivered events (which carry customer message
 * `text`) do not linger in Redis indefinitely. */
export const DEFAULT_STREAM_MAXLEN = 100_000;

export interface OutboxPublisherOptions {
  /**
   * Approximate per-stream retention cap applied via `XADD ... MAXLEN ~ N`.
   * Bounds how long delivered payloads (incl. customer message text) persist in
   * Redis. `0` disables trimming. Defaults to `BROKER_STREAM_MAXLEN` or
   * {@link DEFAULT_STREAM_MAXLEN}.
   */
  maxLen?: number;
}

function maxLenFromEnv(): number {
  const raw = process.env.BROKER_STREAM_MAXLEN;
  if (raw === undefined || raw === '') return DEFAULT_STREAM_MAXLEN;
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_STREAM_MAXLEN;
}

/**
 * Publishes outbox events to Redis Streams, one stream per event type.
 *
 * This replaces the stub that returned `'acked'` for everything, which marked
 * every event PUBLISHED without delivering it. The database remains the source
 * of truth: an event is only ever reported acknowledged when the broker
 * actually accepted the write, so a broker failure keeps the event claimable
 * for redelivery.
 *
 * Streams are capped with an approximate `MAXLEN ~` so old delivered entries age
 * out instead of retaining customer PII forever.
 * ponytail: `~` trims in whole macro-nodes, so the live length can briefly exceed
 * the cap by up to ~one node — the accepted price of O(1) trimming. The DB outbox
 * is still authoritative, so size the cap above peak consumer backlog: an entry
 * trimmed before a lagging consumer reads it is gone from Redis (the DB row is
 * already PUBLISHED). Set BROKER_STREAM_MAXLEN=0 to disable.
 */
export class RedisStreamsOutboxPublisher {
  private readonly maxLen: number;

  constructor(
    private readonly redis: BrokerClient,
    options: OutboxPublisherOptions = {},
  ) {
    this.maxLen = options.maxLen ?? maxLenFromEnv();
  }

  async publish(claim: OutboxClaim): Promise<OutboxPublishResult> {
    const streamKey = outboxStreamKey(claim.eventType);
    try {
      const fields = encodeOutboxFields(claim);
      const entryId =
        this.maxLen > 0
          ? await this.redis.xadd(
              streamKey,
              'MAXLEN',
              '~',
              this.maxLen,
              '*',
              ...fields,
            )
          : await this.redis.xadd(streamKey, '*', ...fields);
      // XADD returns the generated entry id on success. A null/empty reply means
      // the write did not land — reporting 'acked' would be the silent data-loss
      // bug this class exists to remove.
      return typeof entryId === 'string' && entryId.length > 0
        ? 'acked'
        : 'failed';
    } catch (error) {
      // Honest failure. The dispatcher routes 'failed' to retryOutboxEvent, so
      // the event goes RETRY (then DEAD_LETTER past the attempt budget) and the
      // DB stays authoritative. Logged once so a broker outage is visible rather
      // than only showing up as a rising attempt count.
      console.error(
        `[broker] outbox publish failed for event ${claim.id} (${claim.eventType}):`,
        error instanceof Error ? error.message : error,
      );
      return 'failed';
    }
  }
}
