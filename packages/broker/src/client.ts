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

/** True for a `rediss://` URL, i.e. one that requires TLS transport. */
export function isSecureRedisUrl(redisUrl: string): boolean {
  return /^rediss:\/\//iu.test(redisUrl.trim());
}

/**
 * Builds the ioredis options for a URL. Pure (no socket), so the TLS decision is
 * unit-testable. A `rediss://` URL turns TLS on explicitly: customer message text
 * crosses this wire, so an operator who points REDIS_URL at `rediss://` always
 * gets an encrypted transport rather than relying on scheme inference. TLS uses
 * secure defaults (server cert validated against the system CA, SNI from the URL
 * host).
 */
export function resolveBrokerRedisOptions(
  redisUrl: string,
  options: BrokerClientOptions = {},
): RedisOptions {
  const redisOptions: RedisOptions = {
    commandTimeout: options.commandTimeoutMs ?? 5_000,
    maxRetriesPerRequest: options.maxRetriesPerRequest ?? 3,
  };
  if (isSecureRedisUrl(redisUrl)) {
    redisOptions.tls = {};
  }
  return redisOptions;
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
  const client = new Redis(redisUrl, resolveBrokerRedisOptions(redisUrl, options));
  client.on('error', (error: Error) => {
    console.error('[broker] redis client error:', error.message);
  });
  return client;
}
