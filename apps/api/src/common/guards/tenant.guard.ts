import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

/**
 * Guards routes that require a tenant context. The context is resolved by
 * TenantContextInterceptor from the authenticated principal's token — never
 * from a client-supplied header or query param (Blueprint §10 RBAC contract).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (!request.principal) {
      throw new UnauthorizedException('Authentication required');
    }
    const tenantId = request.tenantContext?.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Tenant context required');
    }
    return true;
  }
}
