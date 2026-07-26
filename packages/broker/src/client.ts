import { Redis, type RedisOptions } from 'ioredis';

/**
 * The concrete broker connection. Aliased so consumers depend on `@chai/broker`
 * rather than importing `ioredis` directly — the driver stays an implementation
 * detail of this package.
 */
export type BrokerClient = Redis;

export interface BrokerClientOptions {
  /** Reject a single command after this long so a stuck socket cannot stall the
   * dispatcher indefinitely; the event falls back to DB-backed retry instead. */
  commandTimeoutMs?: number;
  /** Retries per command before it rejects. Kept low so a broker outage surfaces
   * as a fast failure (→ RETRY) rather than a long hang. */
  maxRetriesPerRequest?: number;
}

/**
 * Builds an ioredis client from a `redis://` / `rediss://` URL.
 *
 * An `error` listener is attached deliberately: ioredis emits `error` on every
 * failed reconnection attempt, and an unhandled `error` event crashes the
 * process. A broker outage must degrade to DB-backed retry, never take the
 * worker down, so the events are logged and swallowed here.
 */
export function createBrokerClient(
  redisUrl: string,
  options: BrokerClientOptions = {},
): BrokerClient {
  const redisOptions: RedisOptions = {
    commandTimeout: options.commandTimeoutMs ?? 5_000,
    maxRetriesPerRequest: options.maxRetriesPerRequest ?? 3,
  };
  const client = new Redis(redisUrl, redisOptions);
  client.on('error', (error: Error) => {
    console.error('[broker] redis client error:', error.message);
  });
  return client;
}
