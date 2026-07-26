import { issueTokens, type Principal, type TokenConfig } from '@chai/auth';

import { REALTIME_PUBLISH_SCOPE } from '../src/auth';

export const TOKEN_CONFIG: TokenConfig = {
  clockSkewSeconds: 5,
  issuer: 'chai-platform',
  secret: 'realtime-gateway-test-secret-0123456789abcdef',
};

const AUTH_TIME = new Date('2026-07-26T00:00:00.000Z');

export async function bearer(principal: Principal): Promise<string> {
  const issued = await issueTokens({ config: TOKEN_CONFIG, principal });
  return `Bearer ${issued.accessToken}`;
}

export function clientPrincipal(
  tenantId: string,
  overrides: Partial<Extract<Principal, { kind: 'USER' }>> = {},
): Principal {
  return {
    audience: 'client-portal',
    authenticatedAt: AUTH_TIME,
    id: `user-${tenantId}`,
    kind: 'USER',
    membership: { role: 'CLIENT_AGENT', status: 'ACTIVE', tenantId },
    status: 'ACTIVE',
    ...overrides,
  } as Principal;
}

export function publisherPrincipal(
  scopes: readonly string[] = [REALTIME_PUBLISH_SCOPE],
): Principal {
  return {
    audience: 'service',
    authenticatedAt: AUTH_TIME,
    id: 'outbox-dispatcher',
    kind: 'SERVICE',
    scopes,
    status: 'ACTIVE',
  };
}

export function ownerPrincipal(
  tenantId: string | null,
  expiresAt = new Date(Date.now() + 10 * 60 * 1000),
): Principal {
  return {
    audience: 'owner-console',
    authenticatedAt: AUTH_TIME,
    id: 'platform-owner',
    kind: 'USER',
    mfaState: 'ENROLLED',
    platformRole: 'PLATFORM_OWNER',
    status: 'ACTIVE',
    ...(tenantId
      ? {
          ownerTenantScope: {
            expiresAt,
            reason: 'support session',
            tenantId,
          },
        }
      : {}),
  } as Principal;
}
