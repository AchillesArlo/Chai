'use client';

import { useEffect } from 'react';
import { createHttpClient } from '@chai/api-client';
import { QueryProvider, setDefaultHttpClient } from '@chai/api-client/react';
import { SessionGuard } from '@chai/auth-client/client';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    // BFF proxy at /api/[...path] injects Bearer from HttpOnly session cookie
    setDefaultHttpClient(createHttpClient('/api'));
  }, []);

  return (
    <QueryProvider>
      <SessionGuard>{children}</SessionGuard>
    </QueryProvider>
  );
}
