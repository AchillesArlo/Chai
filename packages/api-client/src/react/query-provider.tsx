'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * Default QueryClient configuration
 */
const defaultQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      gcTime: 5 * 60_000, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Props for QueryProvider
 */
interface QueryProviderProps {
  children: ReactNode;
  queryClient?: QueryClient;
}

/**
 * React Query provider wrapper
 */
export function QueryProvider({ children, queryClient = defaultQueryClient }: QueryProviderProps) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/**
 * Create custom QueryClient with overrides
 */
export function createQueryClient(overrides?: Partial<ConstructorParameters<typeof QueryClient>[0]>): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      ...overrides,
    },
  });
}
