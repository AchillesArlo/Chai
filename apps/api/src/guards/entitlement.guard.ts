import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import { EntitlementService } from '../modules/entitlements/entitlement.service';
import { REQUIRED_ENTITLEMENT } from './require-entitlement.decorator';

/**
 * Enforces per-tenant capability entitlements server-side.
 *
 * Runs after tenancy resolution, so it always has a tenant to evaluate against.
 * A route with no `@RequireEntitlement` is untouched, which keeps core surfaces
 * reachable for every tenant.
 */
@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(EntitlementService)
    private readonly entitlements: EntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(
      REQUIRED_ENTITLEMENT,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const tenantId = resolveTenantId(request);
    if (!tenantId) {
      // No resolvable tenant means the capability cannot be evaluated, so refuse.
      throw new ForbiddenException({
        capability: required,
        code: 'FEATURE_NOT_ENABLED',
      });
    }

    if (!(await this.entitlements.isEnabled(tenantId, required))) {
      throw new ForbiddenException({
        capability: required,
        code: 'FEATURE_NOT_ENABLED',
      });
    }
    return true;
  }
}

/**
 * Resolves the tenant without depending on `TenantContextInterceptor`.
 *
 * Nest runs guards BEFORE interceptors, so `request.tenantContext` is not
 * populated yet at this point. The principal already carries the tenant, and the
 * interceptor still performs the full validation afterwards — this only needs
 * enough to decide which tenant's capabilities to read.
 */
function resolveTenantId(request: FastifyRequest): string | undefined {
  if (request.tenantContext?.tenantId) {
    return request.tenantContext.tenantId;
  }
  const principal = request.principal;
  if (principal?.kind === 'USER' && principal.audience === 'client-portal') {
    return principal.membership?.tenantId;
  }
  if (principal?.kind === 'USER' && principal.audience === 'owner-console') {
    return principal.ownerTenantScope?.tenantId;
  }
  if (principal?.kind === 'SERVICE') {
    return principal.tenantId;
  }
  return undefined;
}
