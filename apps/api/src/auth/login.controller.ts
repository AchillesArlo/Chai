import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import {
  type Audience,
  type ClientRole,
  extractBearerToken,
  type MfaState,
  SESSION_POLICIES,
  verifyAccessToken,
  verifyRefreshToken,
  type Principal,
  type TokenConfig,
} from '@chai/auth';
import {
  authenticateCredentials,
} from '@chai/auth/server';
import {
  LoginRequestSchema,
  RefreshRequestSchema,
} from '@chai/contracts';

import { LoginBodyDto, RefreshBodyDto } from './auth.dto';
import {
  CredentialStoreToken,
  type CredentialStore as ApiCredentialStore,
} from './credential-store.di';
import type { RefreshTokenStore } from './refresh-token-store';
import { RefreshTokenStoreToken } from './refresh-token-store.di';
import { issueSessionResponse, type LoginResponseBody } from './session-tokens';
import { TOKEN_CONFIG_TOKEN, type TokenConfigProvider } from './token-config.di';

const LOGIN_AUDIENCE_META = 'login-audience';

function failLogin(): never {
  // ponytail: single message — never reveal whether email exists or is locked.
  throw new UnauthorizedException('Invalid email or password');
}

async function performLogin(
  body: unknown,
  audience: Audience,
  credentialStore: ApiCredentialStore,
  refreshTokenStore: RefreshTokenStore,
  tokenConfig: TokenConfig,
): Promise<LoginResponseBody> {
  const parsed = LoginRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnauthorizedException('Invalid email or password');
  }

  const result = await authenticateCredentials({
    audience,
    email: parsed.data.email,
    password: parsed.data.password,
    store: credentialStore,
  });

  if (!result.ok) {
    failLogin();
  }

  let principal = result.principal;
  // A confirmed MFA factor means the password is only the first factor: issue a
  // partial session (mfaState REQUIRED) that owner guards reject until the TOTP
  // step-up endpoint verifies a code. mfaState is derived from the store, never
  // from client input.
  if (
    principal.kind === 'USER' &&
    (await credentialStore.mfaChallengeRequired(principal.id))
  ) {
    principal = { ...principal, mfaState: 'REQUIRED' };
  }

  return issueSessionResponse(principal, tokenConfig, refreshTokenStore);
}

@Controller('auth')
export class OwnerLoginController {
  constructor(
    @Inject(CredentialStoreToken)
    private readonly credentialStore: ApiCredentialStore,
    @Inject(RefreshTokenStoreToken)
    private readonly refreshTokenStore: RefreshTokenStore,
    @Inject(TOKEN_CONFIG_TOKEN)
    private readonly tokenConfigProvider: TokenConfigProvider,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginBodyDto): Promise<LoginResponseBody> {
    return performLogin(
      body,
      'owner-console',
      this.credentialStore,
      this.refreshTokenStore,
      this.tokenConfigProvider(),
    );
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: RefreshBodyDto): Promise<LoginResponseBody> {
    return performRefresh(
      body,
      this.tokenConfigProvider(),
      this.refreshTokenStore,
      'owner-console',
    );
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: FastifyRequest): Promise<void> {
    await performLogout(
      request,
      this.tokenConfigProvider(),
      this.refreshTokenStore,
      'owner-console',
    );
  }
}

@Controller('api/client/v1/auth')
export class ClientLoginController {
  constructor(
    @Inject(CredentialStoreToken)
    private readonly credentialStore: ApiCredentialStore,
    @Inject(RefreshTokenStoreToken)
    private readonly refreshTokenStore: RefreshTokenStore,
    @Inject(TOKEN_CONFIG_TOKEN)
    private readonly tokenConfigProvider: TokenConfigProvider,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginBodyDto): Promise<LoginResponseBody> {
    return performLogin(
      body,
      'client-portal',
      this.credentialStore,
      this.refreshTokenStore,
      this.tokenConfigProvider(),
    );
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: RefreshBodyDto): Promise<LoginResponseBody> {
    return performRefresh(
      body,
      this.tokenConfigProvider(),
      this.refreshTokenStore,
      'client-portal',
    );
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: FastifyRequest): Promise<void> {
    await performLogout(
      request,
      this.tokenConfigProvider(),
      this.refreshTokenStore,
      'client-portal',
    );
  }
}

async function performRefresh(
  body: unknown,
  tokenConfig: TokenConfig,
  refreshTokenStore: RefreshTokenStore,
  expectedAudience: Audience,
): Promise<LoginResponseBody> {
  const parsed = RefreshRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnauthorizedException('Invalid refresh token');
  }
  const result = await verifyRefreshToken(parsed.data.refreshToken, tokenConfig);
  if (!result.ok || !result.claims) {
    throw new UnauthorizedException('Invalid refresh token');
  }
  const claims = result.claims;
  if (claims.aud !== expectedAudience) {
    throw new UnauthorizedException('Invalid refresh token');
  }

  // Enforce idle session timeout (REQ-10-003, REQ-10-004):
  // Owner idle limit: 30m (1800s); Client idle limit: 60m (3600s).
  const idleLimitSeconds =
    expectedAudience === 'owner-console'
      ? SESSION_POLICIES.owner.idleTimeoutSeconds
      : SESSION_POLICIES.client.idleTimeoutSeconds;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof claims.iat === 'number' && nowSeconds - claims.iat > idleLimitSeconds) {
    const familyId = await refreshTokenStore.getFamilyId(claims.jti);
    if (familyId) {
      await refreshTokenStore.revokeFamily(familyId);
    }
    throw new UnauthorizedException('Session expired due to inactivity');
  }
  if (await refreshTokenStore.isRevoked(claims.jti)) {
    // Refresh token reuse detected: this jti was already rotated away (or
    // logged out) earlier, yet it is being presented again — the signal that
    // it was stolen. Revoke every token in its family, not just this one, so
    // a thief cannot keep using whichever token in the chain they hold.
    const familyId = await refreshTokenStore.getFamilyId(claims.jti);
    if (familyId) {
      await refreshTokenStore.revokeFamily(familyId);
    }
    throw new ConflictException('Refresh token no longer valid');
  }

  // Rotate: revoke old, issue new in the same family.
  const familyId = (await refreshTokenStore.getFamilyId(claims.jti)) ?? claims.jti;
  await refreshTokenStore.revoke(claims.jti);

  const refreshedPrincipal = rebuildPrincipalFromClaims(claims);
  if (!refreshedPrincipal) {
    throw new UnauthorizedException('Invalid refresh token');
  }
  return issueSessionResponse(refreshedPrincipal, tokenConfig, refreshTokenStore, familyId);
}

function rebuildPrincipalFromClaims(claims: {
  sub: string;
  aud: Audience;
  tenantId?: string;
  role?: string;
  mfaState?: MfaState;
}): Principal | null {
  if (claims.aud === 'owner-console') {
    return {
      audience: 'owner-console',
      authenticatedAt: new Date(),
      id: claims.sub,
      kind: 'USER',
      // Preserve the MFA state carried by the (signed) refresh token so a
      // rotation cannot silently upgrade a partial session to ENROLLED.
      mfaState: claims.mfaState ?? 'REQUIRED',
      platformRole: 'PLATFORM_OWNER',
      status: 'ACTIVE',
    };
  }
  if (!claims.tenantId || !claims.role) {
    return null;
  }
  return {
    audience: claims.aud,
    authenticatedAt: new Date(),
    id: claims.sub,
    kind: 'USER',
    membership: {
      role: claims.role as ClientRole,
      status: 'ACTIVE',
      tenantId: claims.tenantId,
    },
    status: 'ACTIVE',
  };
}

async function performLogout(
  request: FastifyRequest,
  tokenConfig: TokenConfig,
  refreshTokenStore: RefreshTokenStore,
  expectedAudience: Audience,
): Promise<void> {
  const token = extractBearerToken(request.headers.authorization);
  if (!token) return;
  const result = await verifyAccessToken(token, tokenConfig);
  if (!result.ok || !result.claims) return;
  if (result.claims.aud !== expectedAudience) return;

  await refreshTokenStore.revokeAllForPrincipal(result.claims.sub);
}

export { LOGIN_AUDIENCE_META };
export type { LoginResponseBody };
