'use client';

import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import type { ApiRequestConfig } from '../types';
import type { HttpClient } from '../http-client';

/**
 * Default HTTP client instance (can be overridden)
 */
let defaultClient: HttpClient | null = null;

/**
 * Set default HTTP client for hooks
 */
export function setDefaultHttpClient(client: HttpClient): void {
  defaultClient = client;
}

/**
 * Get default HTTP client
 */
export function getDefaultHttpClient(): HttpClient {
  if (!defaultClient) {
    throw new Error('Default HTTP client not set. Call setDefaultHttpClient first.');
  }
  return defaultClient;
}

/**
 * Custom hook for API queries with React Query
 */
export function useApiQuery<T>(
  key: string | string[],
  path: string,
  config?: Omit<ApiRequestConfig, 'method'> & {
    queryOptions?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>;
  }
): UseQueryResult<T> {
  const client = getDefaultHttpClient();
  const queryKey = Array.isArray(key) ? key : [key];

  return useQuery<T>({
    queryKey,
    queryFn: () => client.get<T>(path, config),
    ...config?.queryOptions,
  });
}
