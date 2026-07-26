/**
 * OAuth 2.0 flow for Google Calendar API.
 *
 * This module handles:
 * - Authorization URL generation
 * - Token exchange (authorization code → access/refresh tokens)
 * - Token refresh
 * - In-memory token storage (per tenant)
 *
 * For production, tokens should be persisted to a secure store.
 */

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
}

export interface GoogleOAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // Unix timestamp (seconds)
  token_type: string;
  scope: string;
}

export interface StoredTokens {
  tokens: GoogleOAuthTokens;
  tenantId: string;
  createdAt: number;
}

const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * In-memory token store keyed by tenant ID.
 * Production should persist to a secure database.
 */
const tokenStore = new Map<string, StoredTokens>();

/**
 * Generate the Google OAuth 2.0 authorization URL.
 */
export function generateAuthorizationUrl(
  config: GoogleOAuthConfig,
  tenantId: string,
  state?: string,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: (config.scopes ?? DEFAULT_SCOPES).join(' '),
    access_type: 'offline', // Required to receive a refresh token
    prompt: 'consent', // Force consent to ensure refresh token is issued
    ...(state ? { state } : { state: tenantId }),
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access and refresh tokens.
 */
export async function exchangeAuthorizationCode(
  config: GoogleOAuthConfig,
  code: string,
  tenantId: string,
): Promise<GoogleOAuthTokens> {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${error}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope: string;
  };

  const tokens: GoogleOAuthTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    token_type: data.token_type,
    scope: data.scope,
  };

  // Store tokens for this tenant.
  tokenStore.set(tenantId, {
    tokens,
    tenantId,
    createdAt: Date.now(),
  });

  return tokens;
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshAccessToken(
  config: GoogleOAuthConfig,
  tenantId: string,
): Promise<GoogleOAuthTokens> {
  const stored = tokenStore.get(tenantId);
  if (!stored?.tokens.refresh_token) {
    throw new Error(`No refresh token available for tenant ${tenantId}`);
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: stored.tokens.refresh_token,
    grant_type: 'refresh_token',
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${error}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
  };

  // Update stored tokens (refresh_token may not be re-issued).
  const updatedTokens: GoogleOAuthTokens = {
    ...stored.tokens,
    access_token: data.access_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    token_type: data.token_type,
    scope: data.scope,
  };

  tokenStore.set(tenantId, {
    tokens: updatedTokens,
    tenantId,
    createdAt: stored.createdAt,
  });

  return updatedTokens;
}

/**
 * Retrieve stored tokens for a tenant, refreshing if expired.
 */
export async function getValidTokens(
  config: GoogleOAuthConfig,
  tenantId: string,
): Promise<GoogleOAuthTokens | null> {
  const stored = tokenStore.get(tenantId);
  if (!stored) return null;

  const now = Math.floor(Date.now() / 1000);
  const bufferSeconds = 60; // Refresh 60s before expiry

  if (stored.tokens.expires_at - bufferSeconds > now) {
    return stored.tokens;
  }

  // Token expired or about to expire — refresh.
  if (stored.tokens.refresh_token) {
    return await refreshAccessToken(config, tenantId);
  }

  return null;
}

/**
 * Clear stored tokens for a tenant (e.g., on revocation).
 */
export function clearTokens(tenantId: string): void {
  tokenStore.delete(tenantId);
}

/**
 * Check if tokens exist for a tenant.
 */
export function hasTokens(tenantId: string): boolean {
  return tokenStore.has(tenantId);
}
