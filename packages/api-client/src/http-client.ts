import { ApiError } from './errors';
import { getAuthContext } from './auth-context';
import { apiEventBus } from './event-bus';
import type { ApiRequestConfig, HttpMethod } from './types';

/**
 * Default configuration
 */
const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000] as const; // Exponential backoff

/**
 * Generate idempotency key using crypto.randomUUID
 */
function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * Check if method should have idempotency key
 */
function shouldAddIdempotencyKey(method: HttpMethod): boolean {
  return method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH';
}

/**
 * Build URL with query parameters
 */
function buildUrl(baseUrl: string, path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    }
  }
  return url.toString();
}

/**
 * Parse error response from backend
 */
async function parseErrorResponse(response: Response): Promise<ApiError> {
  try {
    const envelope = await response.json();
    if (envelope?.error) {
      return ApiError.fromEnvelope(response.status, envelope);
    }
  } catch {
    // Failed to parse JSON, create generic error
  }
  return new ApiError(response.status, 'UNKNOWN_ERROR', `HTTP ${response.status}: ${response.statusText}`);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute fetch with retry logic
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retry: boolean,
  attempt = 0
): Promise<Response> {
  try {
    const response = await fetch(url, init);

    // Retry on 5xx errors
    if (retry && response.status >= 500 && attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)] ?? RETRY_DELAYS[0]);
      return fetchWithRetry(url, init, retry, attempt + 1);
    }

    return response;
  } catch {
    // Network error - retry if allowed
    if (retry && attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)] ?? RETRY_DELAYS[0]);
      return fetchWithRetry(url, init, retry, attempt + 1);
    }

    // Create network error
    const networkError = new ApiError(0, 'NETWORK_ERROR', 'Network request failed');
    apiEventBus.emit('network-error', networkError);
    throw networkError;
  }
}

/**
 * Typed HTTP client with auto headers, retry, and error handling
 */
export class HttpClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Make HTTP request with automatic header injection
   */
  async request<T>(path: string, config: ApiRequestConfig = {}): Promise<T> {
    const {
      method = 'GET',
      headers = {},
      body,
      query,
      timeout = DEFAULT_TIMEOUT,
      retry = true,
      idempotencyKey,
    } = config;

    // Build headers
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    // Inject auth headers
    const authContext = getAuthContext();
    if (authContext) {
      const token = authContext.getAccessToken();
      if (token) {
        requestHeaders['Authorization'] = `Bearer ${token}`;
      }

      const tenantId = authContext.getTenantId();
      if (tenantId) {
        requestHeaders['x-tenant-id'] = tenantId;
      }
    }

    // Add idempotency key for mutation methods.
    // The header name is `Idempotency-Key`, which is what the API actually reads
    // (apps/api/src/common/idempotency.interceptor.ts). The previous
    // `x-idempotency-key` meant every mutation from a browser was rejected with
    // IDEMPOTENCY_KEY_REQUIRED; nothing caught it because the frontend had no
    // real mutations until the inbox reply was wired.
    if (shouldAddIdempotencyKey(method)) {
      requestHeaders['idempotency-key'] = idempotencyKey ?? generateIdempotencyKey();
    }

    // Build URL
    const url = buildUrl(this.baseUrl, path, query);

    // Prepare request init
    const init: RequestInit = {
      method,
      headers: requestHeaders,
      credentials: 'include', // Include cookies for HttpOnly auth
      signal: timeout ? AbortSignal.timeout(timeout) : undefined,
    };

    // Add body for non-GET requests
    if (body && method !== 'GET') {
      init.body = JSON.stringify(body);
    }

    // Execute request with retry
    const response = await fetchWithRetry(url, init, retry);

    // Handle error responses
    if (!response.ok) {
      const error = await parseErrorResponse(response);

      // Emit auth errors for global handling
      if (error.isAuthError()) {
        apiEventBus.emit('auth-error', error);
      } else if (error.status >= 500) {
        apiEventBus.emit('error', error);
      }

      throw error;
    }

    // Parse success response
    if (response.status === 204) {
      return undefined as T;
    }

    const envelope = await response.json();
    return envelope.data as T;
  }

  /**
   * GET request
   */
  async get<T>(path: string, config?: Omit<ApiRequestConfig, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...config, method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T>(path: string, body?: unknown, config?: Omit<ApiRequestConfig, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...config, method: 'POST', body });
  }

  /**
   * PUT request
   */
  async put<T>(path: string, body?: unknown, config?: Omit<ApiRequestConfig, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...config, method: 'PUT', body });
  }

  /**
   * DELETE request
   */
  async delete<T>(path: string, config?: Omit<ApiRequestConfig, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...config, method: 'DELETE' });
  }

  /**
   * PATCH request
   */
  async patch<T>(path: string, body?: unknown, config?: Omit<ApiRequestConfig, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...config, method: 'PATCH', body });
  }
}

/**
 * Create default HTTP client instance
 */
export function createHttpClient(baseUrl: string): HttpClient {
  return new HttpClient(baseUrl);
}
