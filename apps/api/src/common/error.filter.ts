import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

const STATUS_CODES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'AUTHENTICATION_REQUIRED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

interface HttpErrorBody {
  code?: string;
  message?: string | string[];
}

function safeMessage(status: number, response: HttpErrorBody): string {
  if (typeof response.message === 'string') {
    return response.message;
  }
  if (status === HttpStatus.BAD_REQUEST) {
    return 'Request validation failed.';
  }
  if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
    return 'An unexpected server error occurred.';
  }
  return HttpStatus[status] ?? 'Request failed.';
}

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiErrorFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const response =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'An unexpected server error occurred.' };
    const body: HttpErrorBody =
      typeof response === 'string' ? { message: response } : response;

    this.logFailure(exception, request, status);

    void reply.status(status).send({
      error: {
        code: body.code ?? STATUS_CODES[status] ?? 'INTERNAL_ERROR',
        correlationId: request.correlationId,
        message: safeMessage(status, body),
        retryable:
          status === HttpStatus.TOO_MANY_REQUESTS || status >= HttpStatus.BAD_GATEWAY,
      },
    });
  }

  /**
   * Server-side record of the failure. The client only ever receives a generic
   * message plus a correlationId, so without this the correlationId pointed at
   * nothing and 5xx causes were undiagnosable from the logs (a real incident:
   * a total login outage surfaced only as an unlogged 500).
   *
   * Deliberately logs NO request body, headers, or query: those carry
   * passwords, tokens, and customer PII. Method + route + correlationId is
   * enough to locate the request, and the stack says what actually broke.
   */
  private logFailure(
    exception: unknown,
    request: FastifyRequest,
    status: number,
  ): void {
    const where = `${request.method} ${request.url} -> ${status}`;
    const correlation = `correlationId=${request.correlationId ?? 'none'}`;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `${where} ${correlation}`,
        stack ?? String(exception),
      );
      return;
    }

    // 4xx is an expected client-side outcome (validation, auth, rate limit):
    // record it at debug so normal traffic does not flood error logs, while a
    // developer chasing a specific rejection can still raise the log level.
    this.logger.debug(`${where} ${correlation}`);
  }
}
