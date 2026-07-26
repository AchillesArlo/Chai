import rateLimit from '@fastify/rate-limit';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { normalizeEmail } from '@chai/auth';

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
 * ponytail: uses the plugin's in-memory LocalStore, so counters are per API
 * instance — with N replicas a client effectively gets N× the limit. The fix is
 * a shared store via the plugin's `redis` option, but that requires an ioredis
 * client dependency, which is out of scope for this change; REDIS_URL is
 * therefore intentionally NOT wired here. Wiring that client is the upgrade path.
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

export async function registerAuthRateLimit(
  fastify: FastifyInstance,
): Promise<void> {
  const strictMax = intFromEnv('AUTH_RATE_LIMIT_MAX', 10);
  const looseMax = intFromEnv('RATE_LIMIT_GLOBAL_MAX', 10_000);
  const timeWindow = intFromEnv('RATE_LIMIT_WINDOW_MS', 60_000);

  await fastify.register(rateLimit, {
    global: true,
    hook: 'preHandler',
    keyGenerator,
    max: (request: FastifyRequest) =>
      strictKind(request.routeOptions?.url) ? strictMax : looseMax,
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
