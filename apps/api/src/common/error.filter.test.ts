import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ApiErrorFilter } from './error.filter';

interface CapturedReply {
  body: unknown;
  status: number;
}

function makeHost(
  request: Record<string, unknown>,
  captured: CapturedReply,
): ArgumentsHost {
  const reply = {
    header: () => {
      return reply;
    },
    send: (body: unknown) => {
      captured.body = body;
      return reply;
    },
    status: (code: number) => {
      captured.status = code;
      return reply;
    },
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => reply,
    }),
  } as unknown as ArgumentsHost;
}

describe('ApiErrorFilter logging', () => {
  const secretBody = { email: 'a@b.c', password: 'SuperSecret123!' };
  const request = {
    body: secretBody,
    correlationId: 'corr-42',
    headers: { authorization: 'Bearer leak-me' },
    method: 'POST',
    url: '/api/client/v1/auth/login',
  };

  it('records an unexpected 5xx with its stack so the correlationId leads somewhere', () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const captured: CapturedReply = { body: undefined, status: 0 };

    try {
      new ApiErrorFilter().catch(
        new Error('database exploded'),
        makeHost(request, captured),
      );

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const logged = errorSpy.mock.calls[0]?.join(' ') ?? '';
      // Locates the request and says what broke.
      expect(logged).toContain('corr-42');
      expect(logged).toContain('/api/client/v1/auth/login');
      expect(logged).toContain('database exploded');
      // Client still gets only the generic envelope.
      expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('never writes the request body or auth header into the log', () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const captured: CapturedReply = { body: undefined, status: 0 };

    try {
      new ApiErrorFilter().catch(new Error('boom'), makeHost(request, captured));

      const logged = errorSpy.mock.calls.flat().map(String).join(' ');
      expect(logged).not.toContain('SuperSecret123!');
      expect(logged).not.toContain('leak-me');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('does not log an expected 4xx at error level', () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const captured: CapturedReply = { body: undefined, status: 0 };

    try {
      new ApiErrorFilter().catch(
        new HttpException('Invalid email or password', HttpStatus.UNAUTHORIZED),
        makeHost(request, captured),
      );

      expect(errorSpy).not.toHaveBeenCalled();
      expect(captured.status).toBe(HttpStatus.UNAUTHORIZED);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
