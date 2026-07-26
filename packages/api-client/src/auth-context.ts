import type { AuthContext } from './types';

/**
 * Global auth context instance
 */
let authContext: AuthContext | null = null;

/**
 * Set the global auth context provider
 */
export function setAuthContext(context: AuthContext): void {
  authContext = context;
}

/**
 * Get the current auth context
 */
export function getAuthContext(): AuthContext | null {
  return authContext;
}

/**
 * Clear auth context (for testing or logout)
 */
export function clearAuthContext(): void {
  authContext = null;
}
