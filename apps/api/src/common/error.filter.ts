import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
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
}
