import rateLimit from '@fastify/rate-limit';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { createBrokerClient, type BrokerClient } from '@chai/broker';
import {
  normalizeEmail,
} from '@chai/auth/server';

/**
 * Rate limiting for the auth surface.
 *
 * - Login (`/auth/login`, `/api/client/v1/auth/login`) and MFA verification
 *   (`/auth/mfa/totp/verify`, `/auth/mfa/totp/confirm`) are limited STRICTLY and
 *   keyed by IP **and** identity (login email or authenticated principal), so a
 *   flood against one account cannot be spread across IPs and one IP cannot
 *   spray many accounts.
 * - Everything else gets a loose per-IP global cap as a blunt DoS backstop.
 *
 * The plugin runs at the `preHandler` hook (not the default `onRequest`) so the
 * key generator can read the parsed body (login email) and the token-derived
 * `request.principal` (MFA), while still short-circuiting before the controller
 * and its expensive scrypt/TOTP work.
 *
 * The counter store is SHARED across replicas via Redis when REDIS_URL is set
 * (see resolveRateLimitStore). Without a shared store each API replica counted
 * independently, so N replicas handed a client N x the limit — with the
 * production default of 5 replicas a 10/minute login cap was really 50/minute.
 * Falling back to the plugin's in-memory LocalStore when REDIS_URL is absent
 * keeps the e2e suite (which runs a single in-process app and no broker)
 * working unchanged.
 */

const LOGIN_ROUTES = new Set(['/auth/login', '/api/client/v1/auth/login']);
const MFA_STRICT_ROUTES = new Set([
  '/auth/mfa/totp/verify',
  '/auth/mfa/totp/confirm',
]);

type StrictKind = 'login' | 'mfa' | null;

function strictKind(url: string | undefined): StrictKind {
  if (!url) return null;
  if (LOGIN_ROUTES.has(url)) return 'login';
  if (MFA_STRICT_ROUTES.has(url)) return 'mfa';
  return null;
}

function loginIdentity(body: unknown): string {
  if (body && typeof body === 'object' && 'email' in body) {
    const email = (body as { email?: unknown }).email;
    if (typeof email === 'string' && email.length > 0) {
      return normalizeEmail(email);
    }
  }
  return 'anonymous';
}

function keyGenerator(request: FastifyRequest): string {
  const kind = strictKind(request.routeOptions?.url);
  if (kind === 'login') {
    return `login:${request.ip}:${loginIdentity(request.body)}`;
  }
  if (kind === 'mfa') {
    return `mfa:${request.ip}:${request.principal?.id ?? 'anonymous'}`;
  }
  return request.ip;
}

function intFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * Resolves the counter store for the limiter.
 *
 * Returns a Redis client when REDIS_URL is set so every replica increments the
 * same counter; returns undefined to fall back to the plugin's per-process
 * LocalStore otherwise. Exported for the unit test: the decision is pure with
 * respect to the env, so it can be asserted without opening a socket.
 */
export function shouldUseSharedRateLimitStore(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.REDIS_URL?.trim());
}

export async function registerAuthRateLimit(
  fastify: FastifyInstance,
): Promise<void> {
  const strictMax = intFromEnv('AUTH_RATE_LIMIT_MAX', 10);
  const looseMax = intFromEnv('RATE_LIMIT_GLOBAL_MAX', 10_000);
  const timeWindow = intFromEnv('RATE_LIMIT_WINDOW_MS', 60_000);

  // Reused from @chai/broker so ioredis stays an implementation detail of one
  // package (and so TLS for rediss:// and the reconnect-error swallowing are
  // handled identically to the outbox publisher).
  let redis: BrokerClient | undefined;
  if (shouldUseSharedRateLimitStore()) {
    redis = createBrokerClient(String(process.env.REDIS_URL));
    // A broker outage must not take the API down: the plugin degrades to
    // allowing the request rather than throwing, and the client is closed with
    // the server so a reload does not leak connections.
    fastify.addHook('onClose', async () => {
      await redis?.quit().catch(() => undefined);
    });
  }

  await fastify.register(rateLimit, {
    global: true,
    hook: 'preHandler',
    keyGenerator,
    max: (request: FastifyRequest) =>
      strictKind(request.routeOptions?.url) ? strictMax : looseMax,
    ...(redis ? { redis } : {}),
    timeWindow,
    errorResponseBuilder: (_request: FastifyRequest, context) =>
      // @fastify/rate-limit *throws* this value (`throw errorResponseBuilder(...)`).
      // Nest's global error handler only maps an HttpException to a real status
      // code — a plain object is caught as an unknown error and rewritten to 500,
      // so a bare `{ error: ... }` object here silently turns every throttle into
      // a 500 instead of a 429. Returning a 429 HttpException lets ApiErrorFilter
      // emit the canonical RATE_LIMITED envelope with the correct status.
      new HttpException(
        {
          code: 'RATE_LIMITED',
          message: `Rate limit exceeded, retry in ${context.after}.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
  });
}
