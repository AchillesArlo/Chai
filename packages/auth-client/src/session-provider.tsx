'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { SessionState } from './server-auth';

const SessionContext = createContext<SessionState | null>(null);

export interface SessionProviderProps {
  state: SessionState;
  children: ReactNode;
}

export function SessionProvider({
  state,
  children,
}: SessionProviderProps): ReactNode {
  return (
    <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
  );
}

export interface UseSessionResult {
  isAuthenticated: boolean;
  principalId: string | null;
  audience: string | null;
  tenantId: string | null;
  role: string | null;
}

export function useSession(): UseSessionResult {
  const state = useContext(SessionContext);
  if (!state) {
    return {
      isAuthenticated: false,
      principalId: null,
      audience: null,
      tenantId: null,
      role: null,
    };
  }
  return {
    isAuthenticated: state.isAuthenticated,
    principalId: state.principalId,
    audience: state.audience,
    tenantId: state.tenantId,
    role: state.role,
  };
}

export { SessionContext };
