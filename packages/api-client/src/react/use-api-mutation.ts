'use client';

import { useMutation, type UseMutationOptions, type UseMutationResult } from '@tanstack/react-query';
import type { ApiRequestConfig, HttpMethod } from '../types';
import { getDefaultHttpClient } from './use-api-query';

/**
 * Mutation variables type
 */
type MutationVariables = {
  body?: unknown;
  config?: Omit<ApiRequestConfig, 'method' | 'body'>;
};

/**
 * Custom hook for API mutations with React Query
 */
export function useApiMutation<T>(
  method: Exclude<HttpMethod, 'GET'>,
  path: string,
  options?: Omit<UseMutationOptions<T, Error, MutationVariables>, 'mutationFn'>
): UseMutationResult<T, Error, MutationVariables> {
  const client = getDefaultHttpClient();

  return useMutation<T, Error, MutationVariables>({
    mutationFn: async (variables) => {
      const { body, config } = variables;
      return client.request<T>(path, { ...config, method, body });
    },
    ...options,
  });
}

/**
 * Convenience hooks for specific HTTP methods
 */
export function useApiPost<T>(path: string, options?: Omit<UseMutationOptions<T, Error, MutationVariables>, 'mutationFn'>) {
  return useApiMutation<T>('POST', path, options);
}

export function useApiPut<T>(path: string, options?: Omit<UseMutationOptions<T, Error, MutationVariables>, 'mutationFn'>) {
  return useApiMutation<T>('PUT', path, options);
}

export function useApiDelete<T>(path: string, options?: Omit<UseMutationOptions<T, Error, MutationVariables>, 'mutationFn'>) {
  return useApiMutation<T>('DELETE', path, options);
}

export function useApiPatch<T>(path: string, options?: Omit<UseMutationOptions<T, Error, MutationVariables>, 'mutationFn'>) {
  return useApiMutation<T>('PATCH', path, options);
}
