import type { TokenConfig } from '@chai/auth';

const DEFAULT_ISSUER = 'chai-platform';

function requireSecret(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value || value.trim().length < 32) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        `${key} must be set to a value of at least 32 characters in production`,
      );
    }
    // ponytail: dev/test fallback. Rotated before any real deployment.
    return `dev-secret-please-rotate-${key.toLowerCase()}-0123456789abcdef`;
  }
  return value;
}

export function loadTokenConfig(env: NodeJS.ProcessEnv = process.env): TokenConfig {
  return {
    issuer: env.AUTH_TOKEN_ISSUER ?? DEFAULT_ISSUER,
    secret: requireSecret(env, 'AUTH_TOKEN_SECRET'),
    clockSkewSeconds: 5,
  };
}
