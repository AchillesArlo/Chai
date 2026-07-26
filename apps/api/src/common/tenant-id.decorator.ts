import {
  type ExecutionContext,
  createParamDecorator,
  NotFoundException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

/**
 * Resolves the tenant id from the authenticated principal's token via
 * request.tenantContext. Replaces @Query('tenantId') everywhere — the tenant
 * is never client-supplied (Blueprint §10 RBAC contract).
 *
 * Throws NotFoundException when no tenant context is bound, so callers route
 * to the same "not found" UX as a missing resource.
 */
export const TenantId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const tenantId = request.tenantContext?.tenantId;
    if (!tenantId) {
      throw new NotFoundException();
    }
    return tenantId;
  },
);
