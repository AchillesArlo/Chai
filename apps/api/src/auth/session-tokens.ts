import {
  type Audience,
  issueTokens,
  type Principal,
  type TokenConfig,
} from '@chai/auth';

import type { RefreshTokenStore } from './refresh-token-store';

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
 *
 * `existingFamilyId` is set only when this call rotates a still-valid refresh
 * token (see performRefresh in login.controller.ts): the new token joins that
 * same family so a later reuse of any earlier token in the chain revokes this
 * one too. Omitted for a fresh login (and for the MFA step-up upgrade, which
 * mints an independent session): the new token starts its own family, keyed by
 * its own jti.
 */
export async function issueSessionResponse(
  principal: Principal,
  tokenConfig: TokenConfig,
  store: RefreshTokenStore,
  existingFamilyId?: string,
): Promise<LoginResponseBody> {
  const tokens = await issueTokens({ config: tokenConfig, principal });
  const jti = extractJti(tokens.refreshToken);
  await store.record({
    expiresAt: tokens.refreshTokenExpiresAt,
    familyId: existingFamilyId ?? jti,
    jti,
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

export { extractJti };
