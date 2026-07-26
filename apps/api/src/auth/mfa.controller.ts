import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Inject,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import {
  type Principal,
} from '@chai/auth';
import {
  generateTotpSecret,
  isTotpStepReplay,
  totpAuthUri,
  verifyTotpCode,
} from '@chai/auth/server';

import { TotpCodeDto } from './auth.dto';
import {
  CredentialStoreToken,
  type CredentialStore as ApiCredentialStore,
} from './credential-store.di';
import { issueSessionResponse, type LoginResponseBody } from './session-tokens';
import { RequirePermission } from '../guards/require-permission.decorator';
import { TOKEN_CONFIG_TOKEN, type TokenConfigProvider } from './token-config.di';

const TOTP_ISSUER = 'Chai';

export interface TotpEnrollResponse {
  secret: string;
  otpauthUri: string;
}

/**
 * Owner-console MFA (TOTP). These routes intentionally carry a permission but
 * NOT `@RequireAudience('owner-console')`: the audience guard denies any owner
 * whose `mfaState !== 'ENROLLED'`, which would make enrolment unreachable
 * (chicken-and-egg). The AuthorizationGuard still confines them to platform
 * owners because `platform.access.manage` is an owner-only permission, so a
 * partial (password-only) owner session can reach step-up but a client cannot
 * reach these routes at all.
 */
@Controller('auth/mfa/totp')
export class OwnerMfaController {
  constructor(
    @Inject(CredentialStoreToken)
    private readonly credentialStore: ApiCredentialStore,
    @Inject(TOKEN_CONFIG_TOKEN)
    private readonly tokenConfigProvider: TokenConfigProvider,
  ) {}

  @Post('enroll')
  @RequirePermission('platform.access.manage')
  @HttpCode(200)
  async enroll(@Req() request: FastifyRequest): Promise<TotpEnrollResponse> {
    const principal = requireOwnerPrincipal(request);
    const secret = generateTotpSecret();
    await this.credentialStore.startTotpEnrollment(principal.id, secret);
    return {
      otpauthUri: totpAuthUri({
        accountName: principal.id,
        issuer: TOTP_ISSUER,
        secretBase32: secret,
      }),
      secret,
    };
  }

  @Post('confirm')
  @RequirePermission('platform.access.manage')
  @HttpCode(200)
  async confirm(
    @Body() body: TotpCodeDto,
    @Req() request: FastifyRequest,
  ): Promise<{ confirmed: true }> {
    const principal = requireOwnerPrincipal(request);
    const factor = await this.credentialStore.getTotpFactor(principal.id);
    if (!factor) {
      throw new BadRequestException({
        code: 'MFA_NOT_ENROLLED',
        message: 'No pending MFA enrollment to confirm.',
      });
    }
    const result = verifyTotpCode(factor.secret, body.code);
    if (
      !result.valid ||
      result.step === null ||
      isTotpStepReplay(result.step, factor.lastUsedStep)
    ) {
      throw invalidCode();
    }
    await this.credentialStore.confirmTotpFactor(principal.id, result.step);
    return { confirmed: true };
  }

  @Post('verify')
  @RequirePermission('platform.access.manage')
  @HttpCode(200)
  async verify(
    @Body() body: TotpCodeDto,
    @Req() request: FastifyRequest,
  ): Promise<LoginResponseBody> {
    const principal = requireOwnerPrincipal(request);
    const factor = await this.credentialStore.getTotpFactor(principal.id);
    if (!factor || !factor.confirmedAt) {
      throw invalidCode();
    }
    const result = verifyTotpCode(factor.secret, body.code);
    if (!result.valid || result.step === null) {
      throw invalidCode();
    }
    // Reject a code whose step was already consumed (replay), then advance the
    // watermark so this same code cannot be presented again.
    if (isTotpStepReplay(result.step, factor.lastUsedStep)) {
      throw invalidCode();
    }
    await this.credentialStore.markTotpStepUsed(principal.id, result.step);

    // mfaState becomes ENROLLED only here, off a verified DB factor — never from
    // client input. This mints a fresh session that clears the owner MFA gate.
    const upgraded: Principal = {
      audience: 'owner-console',
      authenticatedAt: new Date(),
      id: principal.id,
      kind: 'USER',
      mfaState: 'ENROLLED',
      platformRole: 'PLATFORM_OWNER',
      status: 'ACTIVE',
    };
    return issueSessionResponse(upgraded, this.tokenConfigProvider());
  }
}

function invalidCode(): UnauthorizedException {
  // Single opaque message for wrong and replayed codes alike.
  return new UnauthorizedException({
    code: 'MFA_CODE_INVALID',
    message: 'Invalid verification code.',
  });
}

function requireOwnerPrincipal(request: FastifyRequest): Principal {
  const principal = request.principal;
  if (
    !principal ||
    principal.kind !== 'USER' ||
    principal.audience !== 'owner-console' ||
    principal.platformRole !== 'PLATFORM_OWNER' ||
    principal.status !== 'ACTIVE'
  ) {
    throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
  }
  return principal;
}
