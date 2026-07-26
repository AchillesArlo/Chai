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

import { createAuditLog } from '@chai/domain';

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

@Injectable()
export class AuditMiddleware implements NestInterceptor {
  constructor(@Inject(DATABASE) private readonly database: Database | null) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const method = request.method;

    if (!MUTATION_METHODS.has(method)) {
      return next.handle();
    }

    if (SKIP_AUDIT_PATHS.has(request.url)) {
      return next.handle();
    }

    const principal = request.principal;
    const tenantContext = request.tenantContext;

    if (!principal || !tenantContext || !this.database) {
      return next.handle();
    }

    const resourceType = extractResourceType(request.url);
    const resourceId = extractResourceId(request.url);
    const action = `${resourceType}.${method.toLowerCase()}`;

    const auditEntry = {
      id: randomUUID(),
      tenantId: tenantContext.tenantId,
      actorId: principal.id,
      action,
      resourceType,
      resourceId,
      metadata: {
        httpMethod: method,
        path: request.url,
        body: request.body,
      },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
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
}
