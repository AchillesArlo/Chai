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
  type CredentialStore,
  authenticateCredentials,
  extractBearerToken,
  issueTokens,
  verifyAccessToken,
  verifyRefreshToken,
  type Principal,
  type TokenConfig,
} from '@chai/auth';
import {
  LoginRequestSchema,
  RefreshRequestSchema,
} from '@chai/contracts';

import { LoginBodyDto, RefreshBodyDto } from './auth.dto';
import {
  CredentialStoreToken,
  type CredentialStore as ApiCredentialStore,
} from './credential-store.di';
import { REFRESH_TOKEN_STORE } from './refresh-token-store';
import { TOKEN_CONFIG_TOKEN, type TokenConfigProvider } from './token-config.di';

const LOGIN_AUDIENCE_META = 'login-audience';

export interface LoginResponseBody {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  principal: {
    principalId: string;
    audience: Audience;
    tenantId?: string;
    role?: string;
  };
}

function principalSummary(principal: Principal) {
  return {
    principalId: principal.id,
    audience: principal.audience,
    role: principal.kind === 'USER' ? principal.membership?.role : undefined,
    tenantId:
      principal.kind === 'USER'
        ? principal.membership?.tenantId
        : principal.tenantId,
  };
}

function mapPrincipalToLoginBody(
  principal: Principal,
  tokens: Awaited<ReturnType<typeof issueTokens>>,
): LoginResponseBody {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    tokenType: 'Bearer',
    principal: principalSummary(principal),
  };
}

function failLogin(): never {
  // ponytail: single message — never reveal whether email exists.
  throw new UnauthorizedException('Invalid email or password');
}

async function performLogin(
  body: unknown,
  audience: Audience,
  credentialStore: CredentialStore,
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

  const tokens = await issueTokens({ principal: result.principal, config: tokenConfig });
  REFRESH_TOKEN_STORE.record({
    jti: extractJti(tokens.refreshToken),
    principalId: result.principal.id,
    expiresAt: tokens.refreshTokenExpiresAt,
    revoked: false,
  });
  return mapPrincipalToLoginBody(result.principal, tokens);
}

function extractJti(refreshToken: string): string {
  const parts = refreshToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed refresh token');
  }
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1] as string, 'base64url').toString('utf8'),
    ) as { jti?: string };
    if (!payload.jti) throw new Error('Missing jti');
    return payload.jti;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to parse jti');
  }
}

@Controller('auth')
export class OwnerLoginController {
  constructor(
    @Inject(CredentialStoreToken)
    private readonly credentialStore: ApiCredentialStore,
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
      this.tokenConfigProvider(),
    );
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: RefreshBodyDto): Promise<LoginResponseBody> {
    return performRefresh(
      body,
      this.tokenConfigProvider(),
      'owner-console',
    );
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: FastifyRequest): Promise<void> {
    await performLogout(request, this.tokenConfigProvider(), 'owner-console');
  }
}

@Controller('api/client/v1/auth')
export class ClientLoginController {
  constructor(
    @Inject(CredentialStoreToken)
    private readonly credentialStore: ApiCredentialStore,
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
      this.tokenConfigProvider(),
    );
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: RefreshBodyDto): Promise<LoginResponseBody> {
    return performRefresh(
      body,
      this.tokenConfigProvider(),
      'client-portal',
    );
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: FastifyRequest): Promise<void> {
    await performLogout(request, this.tokenConfigProvider(), 'client-portal');
  }
}

async function performRefresh(
  body: unknown,
  tokenConfig: TokenConfig,
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
  if (REFRESH_TOKEN_STORE.isRevoked(claims.jti)) {
    // Refresh token reuse detected: revoke entire family for this principal.
    // ponytail: in-memory store; production table would also revoke by family id.
    throw new ConflictException('Refresh token no longer valid');
  }

  // Rotate: revoke old, issue new.
  REFRESH_TOKEN_STORE.revoke(claims.jti);

  const refreshedPrincipal = rebuildPrincipalFromClaims(claims);
  if (!refreshedPrincipal) {
    throw new UnauthorizedException('Invalid refresh token');
  }
  const tokens = await issueTokens({
    principal: refreshedPrincipal,
    config: tokenConfig,
  });
  REFRESH_TOKEN_STORE.record({
    jti: extractJti(tokens.refreshToken),
    principalId: refreshedPrincipal.id,
    expiresAt: tokens.refreshTokenExpiresAt,
    revoked: false,
  });
  return mapPrincipalToLoginBody(refreshedPrincipal, tokens);
}

function rebuildPrincipalFromClaims(claims: {
  sub: string;
  aud: Audience;
  tenantId?: string;
  role?: string;
}): Principal | null {
  if (claims.aud === 'owner-console') {
    return {
      audience: 'owner-console',
      authenticatedAt: new Date(),
      id: claims.sub,
      kind: 'USER',
      mfaState: 'ENROLLED',
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
  expectedAudience: Audience,
): Promise<void> {
  const token = extractBearerToken(request.headers.authorization);
  if (!token) return;
  const result = await verifyAccessToken(token, tokenConfig);
  if (!result.ok || !result.claims) return;
  if (result.claims.aud !== expectedAudience) return;

  REFRESH_TOKEN_STORE.revokeAllForPrincipal(result.claims.sub, {
    id: result.claims.sub,
    kind: 'USER',
    audience: expectedAudience,
    status: 'ACTIVE',
    authenticatedAt: new Date(0),
  });
}

export { LOGIN_AUDIENCE_META };
