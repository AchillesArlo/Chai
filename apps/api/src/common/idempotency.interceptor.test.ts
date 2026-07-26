import { BadRequestException, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { of } from 'rxjs';

import { IdempotencyKeyInterceptor } from './idempotency.interceptor';

function context(method: string, idempotencyKey?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { 'idempotency-key': idempotencyKey },
        method,
      }),
    }),
  } as ExecutionContext;
}

const next: CallHandler = { handle: () => of('ok') };

describe('IdempotencyKeyInterceptor', () => {
  it('allows safe HTTP methods without an idempotency key', () => {
    expect(() =>
      new IdempotencyKeyInterceptor().intercept(context('GET'), next),
    ).not.toThrow();
  });

  it('requires a bounded idempotency key for mutations', () => {
    const interceptor = new IdempotencyKeyInterceptor();
    expect(() => interceptor.intercept(context('POST'), next)).toThrow(
      BadRequestException,
    );
    expect(() =>
      interceptor.intercept(context('POST'), next),
    ).toThrow(/Idempotency-Key/);
    expect(() =>
      interceptor.intercept(context('POST', 'valid-command-001'), next),
    ).not.toThrow();
  });
});
