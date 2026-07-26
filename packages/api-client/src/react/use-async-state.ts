'use client';

import type { UseQueryResult, UseMutationResult } from '@tanstack/react-query';

/**
 * Async state helper for loading/empty/error states
 */
export interface AsyncState<T> {
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  isEmpty: boolean;
  data: T | undefined;
  error: Error | null;
}

/**
 * Extract async state from React Query result
 */
export function getAsyncState<T>(result: UseQueryResult<T>): AsyncState<T> {
  const isEmpty = result.isSuccess && (result.data === undefined || result.data === null || 
    (Array.isArray(result.data) && result.data.length === 0));

  return {
    isLoading: result.isLoading,
    isError: result.isError,
    isSuccess: result.isSuccess,
    isEmpty,
    data: result.data,
    error: result.error,
  };
}

/**
 * Extract async state from mutation result
 */
export function getMutationState<T>(result: UseMutationResult<T, Error, unknown>): AsyncState<T> {
  return {
    isLoading: result.isPending,
    isError: result.isError,
    isSuccess: result.isSuccess,
    isEmpty: !result.data,
    data: result.data,
    error: result.error,
  };
}

/**
 * Hook-like helper for query state
 */
export function useAsyncState<T>(result: UseQueryResult<T>): AsyncState<T> {
  return getAsyncState(result);
}
