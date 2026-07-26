'use client';

import { createHttpClient } from '@chai/api-client';
import { QueryProvider, setDefaultHttpClient } from '@chai/api-client/react';
import { SessionGuard } from '@chai/auth-client/client';
import type { ReactNode } from 'react';

/**
 * Registered at module scope, not in an effect.
 *
 * `useEffect` never runs during prerender, so any page whose first render calls
 * `useApiQuery` would throw "Default HTTP client not set" and fail `next build`.
 * Registering here means the client exists before any child renders, on the
 * server pass as well as in the browser.
 *
 * The relative `/api` base is the BFF proxy route, which injects the Bearer token
 * from the HttpOnly session cookie. It is never called during prerender —
 * react-query does not fetch on the server unless a query is explicitly
 * prefetched — so a relative base is safe here.
 */
setDefaultHttpClient(createHttpClient('/api'));

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <SessionGuard>{children}</SessionGuard>
    </QueryProvider>
  );
}
