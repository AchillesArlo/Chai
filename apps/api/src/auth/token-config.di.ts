import type { TokenConfig } from '@chai/auth';

import { loadTokenConfig } from './token-config';

export const TOKEN_CONFIG_TOKEN = Symbol('TokenConfig');

export interface TokenConfigProvider {
  (): TokenConfig;
}

export function createTokenConfigProvider(): TokenConfigProvider {
  const cached = loadTokenConfig();
  return () => cached;
}
