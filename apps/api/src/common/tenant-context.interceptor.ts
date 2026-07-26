import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  NotFoundException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Observable } from 'rxjs';

import { SESSION_POLICIES } from '@chai/auth';
import { TenantIdSchema } from '@chai/contracts';

function selectedTenantId(request: FastifyRequest): string | undefined {
  const header = request.headers['x-tenant-id'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    return undefined;
  }

  const tenantId = TenantIdSchema.safeParse(value);
  if (!tenantId.success) {
    throw new BadRequestException({
      code: 'INVALID_TENANT_CONTEXT',
      message: 'The selected tenant context is invalid.',
    });
  }
  return tenantId.data;
}

function principalTenantId(request: FastifyRequest): string | undefined {
  const principal = request.principal;
  if (principal?.kind === 'SERVICE' && principal.audience === 'service') {
    return principal.tenantId;
  }
  if (principal?.kind === 'USER' && principal.audience === 'client-portal') {
    return principal.membership?.tenantId;
  }
  return undefined;
}

function hasCurrentOwnerScope(
  request: FastifyRequest,
  selectedTenant: string,
): boolean {
  const principal = request.principal;
  if (
    principal?.kind !== 'USER' ||
    principal.audience !== 'owner-console' ||
    principal.status !== 'ACTIVE' ||
    principal.platformRole !== 'PLATFORM_OWNER' ||
    principal.mfaState !== 'ENROLLED' ||
    principal.ownerTenantScope?.tenantId !== selectedTenant ||
    !principal.ownerTenantScope.reason.trim() ||
    principal.ownerTenantScope.expiresAt.getTime() <= Date.now()
  ) {
    return false;
  }

  const millisecondsSinceAuthentication =
    Date.now() - principal.authenticatedAt.getTime();
  return (
    millisecondsSinceAuthentication >= 0 &&
    millisecondsSinceAuthentication <=
      SESSION_POLICIES.recentAuthenticationSeconds * 1_000
  );
}

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (!request.principal) {
      return next.handle();
    }

    const selectedTenant = selectedTenantId(request);
    const scopedTenant = principalTenantId(request);
    const ownerSelectionAllowed =
      selectedTenant !== undefined &&
      hasCurrentOwnerScope(request, selectedTenant);
    if (selectedTenant && scopedTenant !== selectedTenant && !ownerSelectionAllowed) {
      throw new NotFoundException();
    }

    const tenantId = selectedTenant ?? scopedTenant;
    if (!tenantId) {
      return next.handle();
    }

    request.tenantContext = {
      principalId: request.principal.id,
      tenantId,
    };
    return next.handle();
  }
}
