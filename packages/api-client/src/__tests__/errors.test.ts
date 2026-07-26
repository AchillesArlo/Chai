import { describe, it, expect } from 'vitest';
import { ApiError } from '../errors';

describe('ApiError', () => {
  it('should create error with correct properties', () => {
    const error = new ApiError(404, 'NOT_FOUND', 'Resource not found');
    
    expect(error.status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Resource not found');
    expect(error.name).toBe('ApiError');
  });

  it('should create error from envelope', () => {
    const envelope = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: { field: 'email' },
        correlationId: 'test-correlation-id',
      },
    };

    const error = ApiError.fromEnvelope(400, envelope);
    
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Invalid input');
    expect(error.details).toEqual({ field: 'email' });
    expect(error.correlationId).toBe('test-correlation-id');
  });

  it('should identify retryable errors', () => {
    const networkError = new ApiError(0, 'NETWORK_ERROR', 'Network failed');
    const serverError = new ApiError(500, 'INTERNAL_ERROR', 'Server error');
    const clientError = new ApiError(400, 'BAD_REQUEST', 'Bad request');

    expect(networkError.isRetryable()).toBe(true);
    expect(serverError.isRetryable()).toBe(true);
    expect(clientError.isRetryable()).toBe(false);
  });

  it('should identify auth errors', () => {
    const unauthorized = new ApiError(401, 'UNAUTHORIZED', 'Not authenticated');
    const forbidden = new ApiError(403, 'FORBIDDEN', 'Access denied');
    const notFound = new ApiError(404, 'NOT_FOUND', 'Not found');

    expect(unauthorized.isAuthError()).toBe(true);
    expect(forbidden.isAuthError()).toBe(true);
    expect(notFound.isAuthError()).toBe(false);
  });
});
