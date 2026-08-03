import { Controller, Get, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import {
  PLATFORM_OWNER_PERMISSIONS,
  permissionsForRole,
} from '@chai/auth';

import { RequireAudience } from './require-audience.decorator';

@Controller('api/owner/v1/session')
@RequireAudience('owner-console')
export class OwnerSessionController {
  @Get()
  session(@Req() request: FastifyRequest) {
    const tenantId = request.tenantContext?.tenantId;
    return {
      audience: request.principal?.audience,
      hint: tenantId
        ? `Acting as owner with tenant context: ${tenantId}`
        : 'Acting as platform owner (no tenant context selected)',
      permissions: [...PLATFORM_OWNER_PERMISSIONS].sort(),
      role:
        request.principal?.kind === 'USER'
          ? request.principal.platformRole
          : undefined,
      tenantId,
    };
  }
}

@Controller('api/client/v1/session')
@RequireAudience('client-portal')
export class ClientSessionController {
  @Get()
  session(@Req() request: FastifyRequest) {
    const membership =
      request.principal?.kind === 'USER'
        ? request.principal.membership
        : undefined;
    const tenantId = request.tenantContext?.tenantId ?? membership?.tenantId;
    return {
      audience: request.principal?.audience,
      hint: membership
        ? `Authenticated as ${membership.role} in tenant ${tenantId}`
        : 'No active tenant membership found — contact support',
      permissions: membership
        ? [...permissionsForRole(membership.role)].sort()
        : [],
      role: membership?.role,
      tenantId,
    };
  }
}

