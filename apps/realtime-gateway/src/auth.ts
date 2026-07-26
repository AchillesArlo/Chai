import {
  extractBearerToken,
  verifyAccessToken,
  type Principal,
  type TokenClaims,
  type TokenConfig,
} from '@chai/auth';

const DEFAULT_ISSUER = 'chai-platform';

/** Scope a workload token must carry to fan events in. */
export const REALTIME_PUBLISH_SCOPE = 'realtime:publish';

export type RealtimeAuthFailure =
  | 'MISSING_TOKEN'
  | 'INVALID_TOKEN'
  | 'PRINCIPAL_INACTIVE'
  | 'NO_TENANT_SCOPE'
  | 'FORBIDDEN_AUDIENCE'
  | 'MISSING_SCOPE';

export type RealtimeSubscriber =
  | { ok: true; principalId: string; tenantId: string }
  | { ok: false; reason: RealtimeAuthFailure };

export type RealtimePublisher =
  | { ok: true; principalId: string }
  | { ok: false; reason: RealtimeAuthFailure };

function requireSecret(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value || value.trim().length < 32) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        `${key} must be set to a value of at least 32 characters in production`,
      );
    }
    // ponytail: dev/test fallback mirrors apps/api/src/auth/token-config.ts so a
    // locally issued token verifies against the gateway. Rotate before deploy.
    return `dev-secret-please-rotate-${key.toLowerCase()}-0123456789abcdef`;
  }
  return value;
}

export function loadRealtimeTokenConfig(
  env: NodeJS.ProcessEnv = process.env,
): TokenConfig {
  return {
    clockSkewSeconds: 5,
    issuer: env.AUTH_TOKEN_ISSUER ?? DEFAULT_ISSUER,
    secret: requireSecret(env, 'AUTH_TOKEN_SECRET'),
  };
}

/**
 * Rebuilds the principal from verified claims, failing closed on every missing
 * trust fact. Mirrors apps/api/src/auth/token-hook.ts on purpose: the gateway is
 * a separate process, so it must not infer anything the token did not assert.
 */
function principalFromClaims(claims: TokenClaims): Principal {
  const status = claims.principalStatus ?? 'DISABLED';
  const authenticatedAt = claims.authTime
    ? new Date(claims.authTime * 1000)
    : new Date(0);

  if (claims.kind === 'SERVICE') {
    return {
      audience: claims.aud,
      authenticatedAt,
      id: claims.sub,
      kind: 'SERVICE',
      scopes: claims.scopes ?? [],
      status,
      ...(claims.tenantId ? { tenantId: claims.tenantId } : {}),
    };
  }

  return {
    audience: claims.aud,
    authenticatedAt,
    id: claims.sub,
    kind: 'USER',
    mfaState: claims.mfaState ?? 'REQUIRED',
    status,
    ...(claims.tenantId && claims.role && claims.membershipStatus
      ? {
          membership: {
            role: claims.role as never,
            status: claims.membershipStatus,
            tenantId: claims.tenantId,
          },
        }
      : {}),
    ...(claims.ownerTenantScope
      ? {
          ownerTenantScope: {
            expiresAt: new Date(claims.ownerTenantScope.expiresAt * 1000),
            reason: claims.ownerTenantScope.reason,
            tenantId: claims.ownerTenantScope.tenantId,
          },
        }
      : {}),
    ...(claims.platformRole ? { platformRole: claims.platformRole } : {}),
  };
}

async function principalFrom(
  authorization: string | undefined,
  tokenConfig: TokenConfig,
): Promise<{ ok: true; principal: Principal } | { ok: false; reason: RealtimeAuthFailure }> {
  const bearer = extractBearerToken(authorization);
  if (!bearer) {
    return { ok: false, reason: 'MISSING_TOKEN' };
  }
  const verified = await verifyAccessToken(bearer, tokenConfig);
  if (!verified.ok || !verified.claims) {
    return { ok: false, reason: 'INVALID_TOKEN' };
  }
  const principal = principalFromClaims(verified.claims);
  if (principal.status !== 'ACTIVE') {
    return { ok: false, reason: 'PRINCIPAL_INACTIVE' };
  }
  return { ok: true, principal };
}

/**
 * Resolves which tenant stream a caller may subscribe to.
 *
 * The tenant is derived from the token, never from the request path or a
 * client-supplied header (blueprint 10_SECURITY §6, ADR-003). An owner may only
 * subscribe through an unexpired, explicitly selected tenant scope.
 */
export async function authorizeSubscriber(
  authorization: string | undefined,
  tokenConfig: TokenConfig,
  now: Date = new Date(),
): Promise<RealtimeSubscriber> {
  const resolved = await principalFrom(authorization, tokenConfig);
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason };
  }
  const { principal } = resolved;

  if (principal.kind === 'SERVICE') {
    return principal.tenantId
      ? { ok: true, principalId: principal.id, tenantId: principal.tenantId }
      : { ok: false, reason: 'NO_TENANT_SCOPE' };
  }

  if (principal.audience === 'owner-console') {
    const scope = principal.ownerTenantScope;
    if (!scope || scope.expiresAt.getTime() <= now.getTime()) {
      return { ok: false, reason: 'NO_TENANT_SCOPE' };
    }
    return { ok: true, principalId: principal.id, tenantId: scope.tenantId };
  }

  if (principal.audience !== 'client-portal' && principal.audience !== 'widget') {
    return { ok: false, reason: 'FORBIDDEN_AUDIENCE' };
  }

  const membership = principal.membership;
  if (!membership || membership.status !== 'ACTIVE') {
    return { ok: false, reason: 'NO_TENANT_SCOPE' };
  }
  return { ok: true, principalId: principal.id, tenantId: membership.tenantId };
}

/**
 * Only workload identities may publish, because the outbox dispatcher fans in
 * events for many tenants. ADR-029 forbids long-lived shared service keys, so
 * this expects a short-lived service token carrying the publish scope.
 */
export async function authorizePublisher(
  authorization: string | undefined,
  tokenConfig: TokenConfig,
): Promise<RealtimePublisher> {
  const resolved = await principalFrom(authorization, tokenConfig);
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason };
  }
  const { principal } = resolved;
  if (principal.kind !== 'SERVICE' || principal.audience !== 'service') {
    return { ok: false, reason: 'FORBIDDEN_AUDIENCE' };
  }
  if (!principal.scopes.includes(REALTIME_PUBLISH_SCOPE)) {
    return { ok: false, reason: 'MISSING_SCOPE' };
  }
  return { ok: true, principalId: principal.id };
}
