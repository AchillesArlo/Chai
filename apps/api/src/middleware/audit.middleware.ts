import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { createAuditLog, getPiiRedactionPipeline } from '@chai/domain';

import {
  DATABASE,
  SERVICE_PRINCIPAL_ID,
} from '../database/database.module';
import type { Database } from '@chai/database';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const SKIP_AUDIT_PATHS = new Set([
  '/api/health',
  '/api/openapi',
  '/api/openapi-json',
  '/api/client/v1/audit-logs',
  // Credential surfaces: never audit these bodies at all. The body redaction
  // below is the safety net, but the login/refresh/MFA payloads carry nothing
  // worth auditing beyond the fact of the attempt (already covered by the
  // auth failure counters), so the cheapest correct answer is to skip them.
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
  '/auth/mfa/totp/enroll',
  '/auth/mfa/totp/confirm',
  '/auth/mfa/totp/verify',
  '/api/client/v1/auth/login',
  '/api/client/v1/auth/refresh',
  '/api/client/v1/auth/logout',
]);

function extractResourceType(path: string): string {
  const segments = path.split('/').filter(Boolean);
  const apiIndex = segments.indexOf('v1');
  if (apiIndex >= 0 && apiIndex + 1 < segments.length) {
    return segments[apiIndex + 1] ?? 'unknown';
  }
  return 'unknown';
}

function extractResourceId(path: string): string | undefined {
  const segments = path.split('/').filter(Boolean);
  const apiIndex = segments.indexOf('v1');
  if (apiIndex >= 0 && apiIndex + 2 < segments.length) {
    const candidate = segments[apiIndex + 2];
    if (candidate && candidate !== 'qualify' && candidate.length > 0) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Strips credentials and PII out of a request body before it is persisted as
 * audit metadata, reusing the shared audit redaction pipeline (which covers
 * password/token/secret/apiKey/authorization plus email, phone, card, SSN,
 * NIK, and IP). Non-object bodies carry no field names to classify, so they
 * are dropped rather than guessed at.
 */
function redactBody(body: unknown): Record<string, unknown> | undefined {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return undefined;
  }
  return getPiiRedactionPipeline().redact(body as Record<string, unknown>).redacted;
}

@Injectable()
export class AuditMiddleware implements NestInterceptor {
  constructor(@Inject(DATABASE) private readonly database: Database | null) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const method = request.method;

    if (!MUTATION_METHODS.has(method)) {
      return next.handle();
    }

    const pathWithoutQuery = request.url.split('?')[0] ?? request.url;

    if (this.shouldSkip(pathWithoutQuery)) {
      return next.handle();
    }

    const principal = request.principal;
    const tenantContext = request.tenantContext;

    if (!principal || !tenantContext || !this.database) {
      return next.handle();
    }

    const resourceType = extractResourceType(pathWithoutQuery);
    const resourceId = extractResourceId(pathWithoutQuery);
    const action = `${resourceType}.${method.toLowerCase()}`;

    const isCrossTenant =
      principal.kind === 'USER' &&
      principal.audience === 'owner-console' &&
      Boolean(principal.ownerTenantScope?.tenantId) &&
      principal.ownerTenantScope?.tenantId === tenantContext.tenantId;

    const crossTenantReason = isCrossTenant ? principal.ownerTenantScope?.reason : undefined;

    const auditEntry = {
      id: randomUUID(),
      tenantId: tenantContext.tenantId,
      actorId: principal.id,
      action,
      resourceType,
      resourceId,
      metadata: {
        httpMethod: method,
        path: pathWithoutQuery,
        // Redacted, never raw: this metadata is PERSISTED to the audit table,
        // so an un-redacted body would store passwords, tokens, and customer
        // PII permanently in an append-only table nobody can scrub.
        body: redactBody(request.body),
        ...(isCrossTenant ? { isCrossTenant: true, crossTenantReason } : {}),
      },
      ipAddress: request.ip,
      userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
    };

    return next.handle().pipe(
      tap(async () => {
        try {
          const db = this.database;
          if (!db) return;
          // ponytail: wrap in a transaction so createAuditLog gets a DatabaseTransaction
          await db.begin(async (tx) => {
            await createAuditLog(tx, {
              ...auditEntry,
              actorId: SERVICE_PRINCIPAL_ID,
            });
          });
        } catch {
          // Audit logging failure should not break the request.
        }
      }),
    );
  }

  private shouldSkip(path: string): boolean {
    if (SKIP_AUDIT_PATHS.has(path)) {
      return true;
    }
    if (path.startsWith('/auth/') || path.startsWith('/api/client/v1/auth/')) {
      return true;
    }
    return false;
  }
}

