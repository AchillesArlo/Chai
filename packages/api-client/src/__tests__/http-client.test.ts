import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HttpClient } from '../http-client';
import { setAuthContext, clearAuthContext } from '../auth-context';
import { apiEventBus } from '../event-bus';
import type { AuthContext } from '../types';

describe('HttpClient', () => {
  let client: HttpClient;
  const baseUrl = 'https://api.example.com';

  beforeEach(() => {
    client = new HttpClient(baseUrl);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    clearAuthContext();
    apiEventBus.clear();
    vi.restoreAllMocks();
  });

  it('should make GET request', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 1, name: 'Test' } }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    const result = await client.get('/test');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/test',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
      })
    );
    expect(result).toEqual({ id: 1, name: 'Test' });
  });

  it('should inject Authorization header when token is available', async () => {
    const mockContext: AuthContext = {
      getAccessToken: () => 'test-token',
      getTenantId: () => null,
    };
    setAuthContext(mockContext);

    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    await client.get('/test');

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });

  it('should inject x-tenant-id header when tenant is available', async () => {
    const mockContext: AuthContext = {
      getAccessToken: () => null,
      getTenantId: () => 'tenant-123',
    };
    setAuthContext(mockContext);

    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    await client.get('/test');

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-tenant-id': 'tenant-123',
        }),
      })
    );
  });

  it('should add idempotency key for POST requests', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    await client.post('/test', { name: 'Test' });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'idempotency-key': expect.stringMatching(/^[0-9a-f-]{36}$/),
        }),
      })
    );
  });

  it('should add idempotency key for PUT requests', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    await client.put('/test', { name: 'Test' });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'idempotency-key': expect.stringMatching(/^[0-9a-f-]{36}$/),
        }),
      })
    );
  });

  it('should add idempotency key for DELETE requests', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    await client.delete('/test');

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'idempotency-key': expect.stringMatching(/^[0-9a-f-]{36}$/),
        }),
      })
    );
  });

  it('should not add idempotency key for GET requests', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    await client.get('/test');

    const callArgs = vi.mocked(fetch).mock.calls[0];
    const init = callArgs?.[1] as RequestInit;
    expect(init.headers).not.toHaveProperty('idempotency-key');
  });

  it('should throw ApiError on non-ok response', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
        },
      }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    await expect(client.get('/test')).rejects.toThrow();
  });

  it('should emit auth-error event on 401', async () => {
    const handler = vi.fn();
    apiEventBus.on('auth-error', handler);

    const mockResponse = {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        },
      }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    await expect(client.get('/test')).rejects.toThrow();
    expect(handler).toHaveBeenCalled();
  });

  it('should handle 204 No Content response', async () => {
    const mockResponse = {
      ok: true,
      status: 204,
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    const result = await client.delete('/test');

    expect(result).toBeUndefined();
  });

  it('should build URL with query parameters', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    await client.get('/test', { query: { page: 1, limit: 10, active: true } });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/test?page=1&limit=10&active=true',
      expect.any(Object)
    );
  });

  it('should retry on 5xx errors', async () => {
    const mockResponse500 = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Server error',
        },
      }),
    };
    const mockResponse200 = {
      ok: true,
      status: 200,
      json: async () => ({ data: { success: true } }),
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(mockResponse500 as Response)
      .mockResolvedValueOnce(mockResponse200 as Response);

    const result = await client.get('/test', { retry: true });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ success: true });
  }, 10000);
});
