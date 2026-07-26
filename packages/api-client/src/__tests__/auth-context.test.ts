import { describe, it, expect, afterEach } from 'vitest';
import { setAuthContext, getAuthContext, clearAuthContext } from '../auth-context';
import type { AuthContext } from '../types';

describe('AuthContext', () => {
  afterEach(() => {
    clearAuthContext();
  });

  it('should set and get auth context', () => {
    const mockContext: AuthContext = {
      getAccessToken: () => 'test-token',
      getTenantId: () => 'test-tenant',
    };

    setAuthContext(mockContext);
    const context = getAuthContext();

    expect(context).toBe(mockContext);
    expect(context?.getAccessToken()).toBe('test-token');
    expect(context?.getTenantId()).toBe('test-tenant');
  });

  it('should clear auth context', () => {
    const mockContext: AuthContext = {
      getAccessToken: () => 'test-token',
      getTenantId: () => 'test-tenant',
    };

    setAuthContext(mockContext);
    expect(getAuthContext()).not.toBeNull();

    clearAuthContext();
    expect(getAuthContext()).toBeNull();
  });

  it('should return null when no context is set', () => {
    expect(getAuthContext()).toBeNull();
  });
});
