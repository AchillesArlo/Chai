/**
 * HTTP methods supported by the API client
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Configuration for API client requests
 */
export interface ApiRequestConfig {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
  retry?: boolean;
  idempotencyKey?: string;
}

/**
 * Auth context provider interface
 */
export interface AuthContext {
  getAccessToken(): string | null;
  getTenantId(): string | null;
}

/**
 * API error structure matching backend envelope
 */
export interface ApiErrorData {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Connection status for SSE
 */
export type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';

/**
 * Event types for inbox stream
 */
export type InboxEventType =
  | 'MESSAGE_RECEIVED'
  | 'CONVERSATION_UPDATED'
  | 'AGENT_ASSIGNED'
  | 'TYPING_INDICATOR';

/**
 * Inbox event payload
 */
export interface InboxEvent {
  type: InboxEventType;
  data: unknown;
  timestamp: string;
}
