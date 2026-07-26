import { NotFoundException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

/**
 * Returns the tenant id resolved from the authenticated principal's token.
 * Throws NotFoundException when no tenant context is bound — owner-console
 * callers that legitimately lack a tenant must opt out explicitly.
 *
 * RBAC contract (Blueprint §10): tenant id is never read from the query string
 * or body. Every tenant-scoped operation routes through this helper.
 */
export function tenantScope(request: FastifyRequest): string {
  const tenantId = request.tenantContext?.tenantId;
  if (!tenantId) {
    throw new NotFoundException();
  }
  return tenantId;
}

/**
 * Returns the principal id of the authenticated caller. Throws when no
 * principal is bound — the audience guard should already have prevented
 * unauthenticated access, so this is a defense-in-depth check.
 */
export function callerPrincipalId(request: FastifyRequest): string {
  const principalId = request.principal?.id;
  if (!principalId) {
    throw new NotFoundException();
  }
  return principalId;
}

export function optionalTenantScope(request: FastifyRequest): string | null {
  return request.tenantContext?.tenantId ?? null;
}
