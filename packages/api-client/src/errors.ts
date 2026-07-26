import type { ApiErrorData } from './types';

/**
 * Custom error class for API errors with structured data
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;
  public readonly correlationId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
    correlationId?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.correlationId = correlationId;

    // Error name is already set above; stack trace is captured automatically by the JS engine.
  }

  /**
   * Create ApiError from backend error envelope
   */
  static fromEnvelope(status: number, envelope: { error: ApiErrorData & { correlationId?: string } }): ApiError {
    return new ApiError(
      status,
      envelope.error.code,
      envelope.error.message,
      envelope.error.details,
      envelope.error.correlationId
    );
  }

  /**
   * Check if error is retryable (5xx or network error)
   */
  isRetryable(): boolean {
    return this.status >= 500 || this.status === 0;
  }

  /**
   * Check if error is authentication failure
   */
  isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}
