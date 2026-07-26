import type { Audience } from './audiences';
import type {
  MembershipStatus,
  MfaState,
  PlatformRole,
  Principal,
  PrincipalKind,
  PrincipalStatus,
} from './roles';
import { SESSION_POLICIES } from './session-policy';

/**
 * JWT-like signed token using Web Crypto HMAC-SHA256.
 * ponytail: Web Crypto API is stdlib (no jose dep). Compact JWS-style format:
 * base64url(header).base64url(payload).base64url(signature).
 */

export interface TokenClaims {
  sub: string;
  aud: Audience;
  iss: string;
  iat: number;
  exp: number;
  jti: string;
  tokenType?: string;
  tenantId?: string;
  role?: string;
  /**
   * Trust facts carried explicitly so the resource server never has to
   * fabricate them. A verifier that cannot read a fact here MUST fail closed
   * (blueprint 10_SECURITY §5, §7): a missing `platformRole` is not an owner,
   * a missing `mfaState` is not enrolled, and a missing `authTime` is stale.
   */
  kind?: PrincipalKind;
  platformRole?: PlatformRole;
  mfaState?: MfaState;
  principalStatus?: PrincipalStatus;
  membershipStatus?: MembershipStatus;
  scopes?: readonly string[];
  /**
   * Explicitly selected, expiring tenant context for a platform owner. Absent
   * means the owner has no cross-tenant read at all (10_SECURITY §6).
   */
  ownerTenantScope?: {
    expiresAt: number;
    reason: string;
    tenantId: string;
  };
  /** Seconds since epoch of the actual credential presentation (OIDC auth_time). */
  authTime?: number;
  /** Seconds since epoch of the last account recovery, for the cooldown window. */
  recoveredAt?: number;
}

export interface TokenConfig {
  issuer: string;
  secret: string;
  /**
   * Optional clock skew tolerance in seconds for exp/nbf validation.
   */
  clockSkewSeconds?: number;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  expiresIn: number;
}

const TOKEN_TYPE_ACCESS = 'access';
const TOKEN_TYPE_REFRESH = 'refresh';

function base64UrlEncode(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function tryBase64UrlDecode(input: string): Uint8Array | null {
  try {
    return base64UrlDecode(input);
  } catch {
    return null;
  }
}

function base64UrlEncodeString(value: string): string {
  return base64UrlEncode(new TextEncoder().encode(value));
}

function base64UrlDecodeString(value: string): string {
  return new TextDecoder().decode(base64UrlDecode(value));
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload) as BufferSource,
  );
  return base64UrlEncode(signature);
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function generateJti(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function lifetimeFor(audience: Audience): {
  access: number;
  refresh: number;
} {
  if (audience === 'owner-console') {
    return {
      access: SESSION_POLICIES.owner.accessTokenLifetimeSeconds,
      refresh: SESSION_POLICIES.owner.absoluteLifetimeSeconds,
    };
  }
  if (audience === 'service') {
    // ADR-029: workload tokens are capped at 5 minutes and are not refreshable
    // as a long-lived session.
    return {
      access: SESSION_POLICIES.serviceAccessTokenLifetimeSeconds,
      refresh: SESSION_POLICIES.serviceAccessTokenLifetimeSeconds,
    };
  }
  return {
    access: SESSION_POLICIES.client.accessTokenLifetimeSeconds,
    refresh: SESSION_POLICIES.client.absoluteLifetimeSeconds,
  };
}

export interface TokenIssueInput {
  principal: Principal;
  config: TokenConfig;
  now?: number;
}

function toEpochSeconds(value: Date | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Math.floor(value.getTime() / 1000);
  return Number.isFinite(seconds) ? seconds : undefined;
}

/**
 * Copies the principal's trust facts onto the token so the resource server
 * reads them instead of assuming them. Everything here is authenticated by the
 * token signature.
 */
function trustClaims(principal: Principal): Partial<TokenClaims> {
  const shared: Partial<TokenClaims> = {
    authTime: toEpochSeconds(principal.authenticatedAt),
    kind: principal.kind satisfies PrincipalKind,
    principalStatus: principal.status satisfies PrincipalStatus,
  };
  if (principal.kind === 'SERVICE') {
    return { ...shared, scopes: principal.scopes };
  }
  return {
    ...shared,
    membershipStatus: principal.membership?.status satisfies
      | MembershipStatus
      | undefined,
    mfaState: principal.mfaState satisfies MfaState | undefined,
    ...(principal.ownerTenantScope
      ? {
          ownerTenantScope: {
            expiresAt: Math.floor(
              principal.ownerTenantScope.expiresAt.getTime() / 1000,
            ),
            reason: principal.ownerTenantScope.reason,
            tenantId: principal.ownerTenantScope.tenantId,
          },
        }
      : {}),
    platformRole: principal.platformRole satisfies PlatformRole | undefined,
    recoveredAt: toEpochSeconds(principal.recoveredAt),
  };
}

export async function issueTokens({
  principal,
  config,
  now = nowSeconds(),
}: TokenIssueInput): Promise<IssuedTokens> {
  const { access: accessTtl, refresh: refreshTtl } = lifetimeFor(
    principal.audience,
  );
  const accessExp = now + accessTtl;
  const refreshExp = now + refreshTtl;
  const role =
    principal.kind === 'USER' ? principal.membership?.role : undefined;
  const tenantId =
    principal.kind === 'USER' ? principal.membership?.tenantId : principal.tenantId;

  const accessClaims: TokenClaims = {
    sub: principal.id,
    aud: principal.audience,
    iss: config.issuer,
    iat: now,
    exp: accessExp,
    jti: generateJti(),
    role,
    tenantId,
    ...trustClaims(principal),
  };
  const refreshClaims: TokenClaims = {
    ...accessClaims,
    exp: refreshExp,
    jti: generateJti(),
    tokenType: TOKEN_TYPE_REFRESH,
  };

  const accessToken = await encodeToken(accessClaims as unknown as Record<string, unknown>, config.secret);
  const refreshToken = await encodeToken(refreshClaims as unknown as Record<string, unknown>, config.secret);

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: accessExp,
    refreshTokenExpiresAt: refreshExp,
    expiresIn: accessTtl,
  };
}

async function encodeToken(
  claims: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const header = base64UrlEncodeString(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  );
  const payload = base64UrlEncodeString(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const signature = await sign(signingInput, secret);
  return `${signingInput}.${signature}`;
}

export type TokenVerifyError =
  | 'MALFORMED'
  | 'INVALID_SIGNATURE'
  | 'EXPIRED'
  | 'NOT_YET_VALID'
  | 'WRONG_TYPE';

export interface TokenVerifyResult {
  ok: boolean;
  claims?: TokenClaims;
  error?: TokenVerifyError;
}

export async function verifyAccessToken(
  token: string,
  config: TokenConfig,
  now = nowSeconds(),
): Promise<TokenVerifyResult> {
  return verifyToken(token, config.secret, config, TOKEN_TYPE_ACCESS, now);
}

export async function verifyRefreshToken(
  token: string,
  config: TokenConfig,
  now = nowSeconds(),
): Promise<TokenVerifyResult> {
  return verifyToken(token, config.secret, config, TOKEN_TYPE_REFRESH, now);
}

async function verifyToken(
  token: string,
  secret: string,
  config: TokenConfig,
  expectedType: string,
  now: number,
): Promise<TokenVerifyResult> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, error: 'MALFORMED' };
  }
  const [header, payload, signature] = parts as [string, string, string];
  const signingInput = `${header}.${payload}`;

  const signatureBytes = tryBase64UrlDecode(signature);
  if (!signatureBytes) {
    return { ok: false, error: 'MALFORMED' };
  }
  const key = await importHmacKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes as BufferSource,
    new TextEncoder().encode(signingInput) as BufferSource,
  );
  if (!valid) {
    return { ok: false, error: 'INVALID_SIGNATURE' };
  }

  let claims: TokenClaims & { tokenType?: string };
  try {
    claims = JSON.parse(base64UrlDecodeString(payload)) as TokenClaims & {
      tokenType?: string;
    };
  } catch {
    return { ok: false, error: 'MALFORMED' };
  }

  if (claims.iss !== config.issuer) {
    return { ok: false, error: 'INVALID_SIGNATURE' };
  }

  const skew = config.clockSkewSeconds ?? 5;
  if (claims.exp + skew < now) {
    return { ok: false, error: 'EXPIRED' };
  }
  if (typeof claims.iat === 'number' && claims.iat - skew > now) {
    return { ok: false, error: 'NOT_YET_VALID' };
  }

  if (expectedType === TOKEN_TYPE_REFRESH) {
    if (claims.tokenType !== TOKEN_TYPE_REFRESH) {
      return { ok: false, error: 'WRONG_TYPE' };
    }
  } else if (claims.tokenType === TOKEN_TYPE_REFRESH) {
    return { ok: false, error: 'WRONG_TYPE' };
  }

  return { ok: true, claims };
}

export function extractBearerToken(
  header: string | undefined | null,
): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!/^Bearer\s+\S+/i.test(trimmed)) return null;
  return trimmed.slice(trimmed.toLowerCase().indexOf('bearer') + 7).trim();
}

export function decodeTokenUnsafe(token: string): TokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(base64UrlDecodeString(parts[1] as string)) as TokenClaims;
  } catch {
    return null;
  }
}
