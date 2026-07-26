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
    return {
      audience: request.principal?.audience,
      permissions: [...PLATFORM_OWNER_PERMISSIONS].sort(),
      role:
        request.principal?.kind === 'USER'
          ? request.principal.platformRole
          : undefined,
      tenantId: request.tenantContext?.tenantId,
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
    return {
      audience: request.principal?.audience,
      permissions: membership
        ? [...permissionsForRole(membership.role)].sort()
        : [],
      role: membership?.role,
      tenantId: request.tenantContext?.tenantId ?? membership?.tenantId,
    };
  }
}
