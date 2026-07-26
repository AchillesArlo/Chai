import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;

// Auth session routes (login/refresh/logout) are caller-authenticating
// mutations, not business mutations — they cannot carry a stable idempotency
// key (a repeated login must produce a fresh session, refresh rotates). Exempt.
const IDEMPOTENCY_EXEMPT_PREFIXES = [
  '/auth/',
  '/api/client/v1/auth/',
  '/api/owner/v1/auth/',
];

function isExempt(url: string): boolean {
  return IDEMPOTENCY_EXEMPT_PREFIXES.some((prefix) => url.startsWith(prefix));
}

@Injectable()
export class IdempotencyKeyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      method: string;
      url: string;
    }>();

    if (SAFE_METHODS.has(request.method)) {
      return next.handle();
    }

    // Provider-facing service routes (e.g. channel webhooks) are verified by the
    // provider signature and deduplicated by the inbox external id, not by a
    // caller-supplied idempotency key, so they bypass the user-facing gate.
    if (request.url?.startsWith('/api/service/')) {
      return next.handle();
    }

    if (request.url && isExempt(request.url)) {
      return next.handle();
    }

    const header = request.headers['idempotency-key'];
    const key = Array.isArray(header) ? header[0] : header;
    if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required for mutations.',
      });
    }

    return next.handle();
  }
}
