import type { FastifyInstance } from 'fastify';

import {
  type ClientRole,
  extractBearerToken,
  verifyAccessToken,
  type Principal,
  type PrincipalStatus,
  type TokenClaims,
  type TokenConfig,
} from '@chai/auth';

/**
 * Fastify hook that extracts the JWT access token from the Authorization
 * header, verifies it, and populates request.principal.
 *
 * Runs before the legacy x-test-subject hook; if it resolves a principal,
 * the subject hook skips itself. This keeps existing tests working until
 * they migrate to real Bearer tokens.
 */

export interface RegisterTokenHookOptions {
  tokenConfig: TokenConfig;
  allowTestSubject?: boolean;
}

export function registerTokenHook(
  fastify: FastifyInstance,
  options: RegisterTokenHookOptions,
): void {
  const { tokenConfig } = options;

  fastify.addHook('onRequest', async (request) => {
    const authHeader = request.headers.authorization;
    const bearer = extractBearerToken(authHeader);
    if (!bearer) {
      return;
    }
    const result = await verifyAccessToken(bearer, tokenConfig);
    if (result.ok && result.claims) {
      request.principal = principalFromClaims(result.claims);
    }
  });
}

/**
 * Rebuilds the principal from *authenticated* token claims.
 *
 * Every branch fails closed, because a token that does not carry a trust fact
 * must never be upgraded into one that does (blueprint 10_SECURITY §5, §7):
 *
 * - no `platformRole` claim  -> no platform role, so owner-only routes deny
 * - no `mfaState` claim      -> 'REQUIRED', so the owner MFA check denies
 * - no `principalStatus`     -> 'DISABLED', so authorize() denies
 * - no `authTime`            -> epoch 0, so recent-auth reads stale and guarded
 *                               actions deny instead of silently passing
 * - no tenant/role/status    -> no membership, so tenant-scoped routes deny
 *
 * ponytail: membership is trusted from our own signed token. Revalidating it
 * against the platform DB per request (16_TECH_STACK §6) is the upgrade path;
 * it needs a membership repository in the auth path plus a short-lived cache.
 */
function principalFromClaims(claims: TokenClaims): Principal {
  const status: PrincipalStatus = claims.principalStatus ?? 'DISABLED';
  const authenticatedAt = claims.authTime
    ? new Date(claims.authTime * 1000)
    : new Date(0);
  const recoveredAt = claims.recoveredAt
    ? new Date(claims.recoveredAt * 1000)
    : undefined;

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

  const membership =
    claims.tenantId && claims.role && claims.membershipStatus
      ? {
          role: claims.role as ClientRole,
          status: claims.membershipStatus,
          tenantId: claims.tenantId,
        }
      : undefined;

  return {
    audience: claims.aud,
    authenticatedAt,
    id: claims.sub,
    kind: 'USER',
    mfaState: claims.mfaState ?? 'REQUIRED',
    status,
    ...(membership ? { membership } : {}),
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
    ...(recoveredAt ? { recoveredAt } : {}),
  };
}
