import type { OutboxClaim } from '@chai/domain';

import type { BrokerClient } from './client';
import { encodeOutboxFields, outboxStreamKey } from './outbox-stream';

/** Structurally identical to the dispatcher's `OutboxPublishResult`; the
 * dispatcher marks the event PUBLISHED only on `'acked'`. */
export type OutboxPublishResult = 'acked' | 'failed';

/**
 * Publishes outbox events to Redis Streams, one stream per event type.
 *
 * This replaces the stub that returned `'acked'` for everything, which marked
 * every event PUBLISHED without delivering it. The database remains the source
 * of truth: an event is only ever reported acknowledged when the broker
 * actually accepted the write, so a broker failure keeps the event claimable
 * for redelivery.
 */
export class RedisStreamsOutboxPublisher {
  constructor(private readonly redis: BrokerClient) {}

  async publish(claim: OutboxClaim): Promise<OutboxPublishResult> {
    const streamKey = outboxStreamKey(claim.eventType);
    try {
      const entryId = await this.redis.xadd(
        streamKey,
        '*',
        ...encodeOutboxFields(claim),
      );
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
