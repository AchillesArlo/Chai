import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import {
  type ClientRole,
  permissionsForRole,
  type Permission,
  PLATFORM_OWNER_PERMISSIONS,
} from '@chai/auth';

import { REQUIRED_PERMISSION } from './require-permission.decorator';

/** Canonical denial code from the API error contract (06_API §5). */
const PERMISSION_DENIED = { code: 'PERMISSION_DENIED' } as const;

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission>(
      REQUIRED_PERMISSION,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const principal = request.principal;
    if (!principal) {
      throw new ForbiddenException(PERMISSION_DENIED);
    }

    // Workload identities authorize by explicit scope, matching authorize() in
    // @chai/auth. Without this branch a service principal could never satisfy a
    // permission, which would push internal surfaces back to being unguarded.
    if (principal.kind === 'SERVICE') {
      if (principal.scopes.includes(required)) {
        return true;
      }
      throw new ForbiddenException(PERMISSION_DENIED);
    }

    if (principal.kind === 'USER' && principal.audience === 'owner-console') {
      if (
        principal.platformRole === 'PLATFORM_OWNER' &&
        PLATFORM_OWNER_PERMISSIONS.has(required)
      ) {
        return true;
      }
      throw new ForbiddenException(PERMISSION_DENIED);
    }

    if (
      principal.kind === 'USER' &&
      principal.audience === 'client-portal' &&
      principal.membership
    ) {
      const rolePermissions = permissionsForRole(
        principal.membership.role as ClientRole,
      );
      if (rolePermissions.has(required)) {
        return true;
      }
      throw new ForbiddenException(PERMISSION_DENIED);
    }

    throw new ForbiddenException(PERMISSION_DENIED);
  }
}
