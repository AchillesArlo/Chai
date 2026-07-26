export const SESSION_POLICIES = {
  client: {
    absoluteLifetimeSeconds: 43_200,
    accessTokenLifetimeSeconds: 900,
    idleTimeoutSeconds: 3_600,
  },
  owner: {
    absoluteLifetimeSeconds: 28_800,
    accessTokenLifetimeSeconds: 600,
    idleTimeoutSeconds: 1_800,
  },
  recentAuthenticationSeconds: 600,
  recoveryCooldownSeconds: 86_400,
  serviceAccessTokenLifetimeSeconds: 300,
} as const;
