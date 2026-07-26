import type { BrokerClient } from './client';
import { decodeOutboxMessage, type OutboxStreamMessage } from './outbox-stream';

const OUTBOX_DEDUP_PREFIX = 'chai:outbox:dedup:';

export type OutboxMessageHandler = (
  message: OutboxStreamMessage,
) => Promise<void>;

export interface RedisStreamsConsumerConfig {
  redis: BrokerClient;
  /** Stream to read — see `outboxStreamKey`. */
  streamKey: string;
  /** Consumer group name; shared by every worker draining this stream. */
  group: string;
  /** Unique name for this consumer instance within the group. */
  consumerName: string;
  /** Start position when the group is first created. `'$'` (default) delivers
   * only messages added after the group exists; `'0'` replays the whole stream. */
  groupStartId?: string;
  /** How long a processed event id is remembered for deduplication. */
  dedupTtlMs?: number;
}

export interface ConsumeOptions {
  handler: OutboxMessageHandler;
  /** Max messages fetched per read/claim. */
  count?: number;
  /** How long `XREADGROUP` blocks waiting for new messages (ms). */
  blockMs?: number;
  /** Reclaim messages left pending (read but never acked) longer than this. */
  minIdleMs?: number;
}

export interface RunOptions extends ConsumeOptions {
  signal?: AbortSignal;
  /** Bounded loop for tests; runs forever when omitted. */
  iterations?: number;
}

interface StreamEntry {
  id: string;
  fields: Record<string, string>;
}

/**
 * Reads an outbox stream through a consumer group, at-least-once.
 *
 * `XREADGROUP` hands each new message to exactly one consumer; `XAUTOCLAIM`
 * takes over messages a dead or stuck consumer read but never acked, so nothing
 * is pinned in a crashed consumer's pending list forever. Delivery is
 * at-least-once by design, so processing is deduplicated by `event_id`: the
 * same event may legitimately arrive twice (producer redelivery, or an autoclaim
 * of a message whose handler had already run).
 */
export class RedisStreamsConsumer {
  private readonly redis: BrokerClient;
  private readonly streamKey: string;
  private readonly group: string;
  private readonly consumerName: string;
  private readonly groupStartId: string;
  private readonly dedupTtlMs: number;
  private ensured = false;

  constructor(config: RedisStreamsConsumerConfig) {
    this.redis = config.redis;
    this.streamKey = config.streamKey;
    this.group = config.group;
    this.consumerName = config.consumerName;
    this.groupStartId = config.groupStartId ?? '$';
    this.dedupTtlMs = config.dedupTtlMs ?? 24 * 60 * 60 * 1_000;
  }

  /** Creates the consumer group, tolerating the case where it already exists. */
  async ensureGroup(): Promise<void> {
    try {
      await this.redis.xgroup(
        'CREATE',
        this.streamKey,
        this.group,
        this.groupStartId,
        'MKSTREAM',
      );
    } catch (error) {
      // BUSYGROUP: the group already exists — the normal steady state.
      if (
        !(error instanceof Error) ||
        !error.message.includes('BUSYGROUP')
      ) {
        throw error;
      }
    }
    this.ensured = true;
  }

  /**
   * One drain pass: reclaim stuck messages, then read new ones. Returns the
   * number of messages handled (skipped duplicates do not count).
   */
  async pollOnce(options: ConsumeOptions): Promise<number> {
    if (!this.ensured) await this.ensureGroup();
    const handler = options.handler;
    const count = options.count ?? 32;
    const minIdleMs = options.minIdleMs ?? 60_000;
    const blockMs = options.blockMs ?? 0;

    let handled = 0;
    handled += await this.drain(
      await this.reclaim(minIdleMs, count),
      handler,
    );
    handled += await this.drain(
      await this.readNew(count, blockMs),
      handler,
    );
    return handled;
  }

  /** Runs `pollOnce` until the signal aborts (or `iterations` is exhausted). */
  async run(options: RunOptions): Promise<void> {
    const { signal, iterations, ...consume } = options;
    let iteration = 0;
    while (
      !signal?.aborted &&
      (iterations === undefined || iteration < iterations)
    ) {
      iteration += 1;
      await this.pollOnce(consume);
    }
  }

  private async readNew(count: number, blockMs: number): Promise<StreamEntry[]> {
    const reply: unknown = await this.redis.xreadgroup(
      'GROUP',
      this.group,
      this.consumerName,
      'COUNT',
      count,
      'BLOCK',
      blockMs,
      'STREAMS',
      this.streamKey,
      '>',
    );
    return parseReadGroupReply(reply, this.streamKey);
  }

  private async reclaim(
    minIdleMs: number,
    count: number,
  ): Promise<StreamEntry[]> {
    const reply: unknown = await this.redis.xautoclaim(
      this.streamKey,
      this.group,
      this.consumerName,
      minIdleMs,
      '0',
      'COUNT',
      count,
    );
    return parseAutoclaimReply(reply);
  }

  private async drain(
    entries: StreamEntry[],
    handler: OutboxMessageHandler,
  ): Promise<number> {
    let handled = 0;
    for (const entry of entries) {
      const message = decodeOutboxMessage(entry.id, entry.fields);
      const dedupKey = `${OUTBOX_DEDUP_PREFIX}${message.eventId}`;

      if ((await this.redis.exists(dedupKey)) > 0) {
        // Already processed in an earlier delivery (which may have crashed
        // before its XACK). Acking clears it from the pending list; the effect
        // must not run twice.
        await this.redis.xack(this.streamKey, this.group, entry.id);
        continue;
      }

      try {
        await handler(message);
      } catch (error) {
        // Leave the message pending and unmarked: XAUTOCLAIM will redeliver it
        // to a live consumer. Not acking is what makes delivery at-least-once.
        console.error(
          `[broker] handler failed for event ${message.eventId} (${message.eventType}):`,
          error instanceof Error ? error.message : error,
        );
        continue;
      }

      // Mark processed BEFORE acking. A crash in the gap redelivers the message,
      // and the dedup mark turns that redelivery into a bare ack.
      // ponytail: the exists-check and this set are not atomic, so a concurrent
      // autoclaim steal could run an idempotent handler twice — the handler's
      // idempotency is the contract (same at-least-once guarantee the DB outbox
      // gives). Upgrade path: a SET NX fencing token with a heartbeat lease.
      await this.redis.set(dedupKey, '1', 'PX', this.dedupTtlMs);
      await this.redis.xack(this.streamKey, this.group, entry.id);
      handled += 1;
    }
    return handled;
  }
}

/**
 * `XREADGROUP` reply: `[[streamKey, [[id, [f, v, ...]], ...]], ...]` or null on
 * timeout. Parsed defensively (every level guarded) because the reply is typed
 * loosely and a shape surprise must not crash the drain loop.
 */
function parseReadGroupReply(raw: unknown, streamKey: string): StreamEntry[] {
  if (!Array.isArray(raw)) return [];
  const streams: readonly unknown[] = raw;
  for (const stream of streams) {
    if (!Array.isArray(stream) || stream.length < 2) continue;
    if (stream[0] === streamKey) return parseEntryList(stream[1]);
  }
  return [];
}

/** `XAUTOCLAIM` reply: `[nextCursor, [[id, [f, v, ...]], ...], [deletedIds]]`. */
function parseAutoclaimReply(raw: unknown): StreamEntry[] {
  if (!Array.isArray(raw) || raw.length < 2) return [];
  return parseEntryList(raw[1]);
}

function parseEntryList(raw: unknown): StreamEntry[] {
  if (!Array.isArray(raw)) return [];
  const items: readonly unknown[] = raw;
  const entries: StreamEntry[] = [];
  for (const item of items) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const id = item[0];
    if (typeof id !== 'string') continue;
    entries.push({ fields: parseFieldArray(item[1]), id });
  }
  return entries;
}

function parseFieldArray(raw: unknown): Record<string, string> {
  const record: Record<string, string> = {};
  if (!Array.isArray(raw)) return record;
  const flat: readonly unknown[] = raw;
  for (let index = 0; index + 1 < flat.length; index += 2) {
    const key = flat[index];
    const value = flat[index + 1];
    if (typeof key === 'string' && typeof value === 'string') {
      record[key] = value;
    }
  }
  return record;
}
