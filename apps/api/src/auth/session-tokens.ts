import {
  type Audience,
  issueTokens,
  type Principal,
  type TokenConfig,
} from '@chai/auth';

import { REFRESH_TOKEN_STORE } from './refresh-token-store';

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

function principalSummary(principal: Principal): LoginResponseBody['principal'] {
  return {
    audience: principal.audience,
    principalId: principal.id,
    role: principal.kind === 'USER' ? principal.membership?.role : undefined,
    tenantId:
      principal.kind === 'USER' ? principal.membership?.tenantId : principal.tenantId,
  };
}

function extractJti(refreshToken: string): string {
  const parts = refreshToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed refresh token');
  }
  const payload = JSON.parse(
    Buffer.from(parts[1] as string, 'base64').toString('utf8'),
  ) as { jti?: string };
  if (!payload.jti) {
    throw new Error('Missing jti');
  }
  return payload.jti;
}

/**
 * Mints access + refresh tokens for a principal and records the refresh jti so
 * logout/refresh-rotation can revoke it. Shared by the login controller and the
 * MFA step-up endpoint so both mint sessions identically.
 */
export async function issueSessionResponse(
  principal: Principal,
  tokenConfig: TokenConfig,
): Promise<LoginResponseBody> {
  const tokens = await issueTokens({ config: tokenConfig, principal });
  REFRESH_TOKEN_STORE.record({
    expiresAt: tokens.refreshTokenExpiresAt,
    jti: extractJti(tokens.refreshToken),
    principalId: principal.id,
    revoked: false,
  });
  return {
    accessToken: tokens.accessToken,
    expiresIn: tokens.expiresIn,
    principal: principalSummary(principal),
    refreshToken: tokens.refreshToken,
    tokenType: 'Bearer',
  };
}
