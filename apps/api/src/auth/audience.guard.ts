import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import type { Audience } from '@chai/auth';

import { REQUIRED_AUDIENCE } from './require-audience.decorator';

@Injectable()
export class AudienceGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Audience>(
      REQUIRED_AUDIENCE,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (!request.principal) {
      throw new UnauthorizedException();
    }
    if (request.principal.audience !== required) {
      throw new ForbiddenException();
    }
    if (request.principal.status !== 'ACTIVE') {
      throw new ForbiddenException();
    }
    if (required === 'owner-console') {
      if (
        request.principal.kind !== 'USER' ||
        request.principal.platformRole !== 'PLATFORM_OWNER'
      ) {
        throw new ForbiddenException();
      }
      if (request.principal.mfaState !== 'ENROLLED') {
        throw new UnauthorizedException({
          code: 'MFA_REQUIRED',
          message: 'Multi-factor authentication is required.',
        });
      }
    }
    if (
      required === 'client-portal' &&
      (request.principal.kind !== 'USER' ||
        request.principal.membership?.status !== 'ACTIVE')
    ) {
      throw new ForbiddenException();
    }
    // Internal machine surfaces: only a workload identity may pass, never a
    // user session (blueprint 06_API §1, 10_SECURITY §7).
    if (required === 'service' && request.principal.kind !== 'SERVICE') {
      throw new ForbiddenException();
    }
    return true;
  }
}
