import { describe, it, expect, beforeEach } from 'vitest';
import { AuditMiddleware } from '../src/middleware/audit.middleware';
import type { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import type { FastifyRequest } from 'fastify';
import type { UserPrincipal } from '@chai/auth';

import type { Database } from '@chai/database';

describe('AuditMiddleware', () => {
  let mockDb: Database;
  let auditLogs: string[][];
  let middleware: AuditMiddleware;

  beforeEach(() => {
    auditLogs = [];
    mockDb = {
      begin: async (callback: (tx: { query: (text: string, params: string[]) => Promise<unknown[]> }) => Promise<unknown>) => {
        const mockTx = {
          query: async (text: string, params: string[]) => {
            if (text.includes('INSERT INTO chai.audit_log')) {
              auditLogs.push(params);
            }
            return [];
          },
        };
        return callback(mockTx);
      },
    } as unknown as Database;
    middleware = new AuditMiddleware(mockDb);
  });

  function createMockContext(request: Partial<FastifyRequest>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request as FastifyRequest,
      }),
    } as unknown as ExecutionContext;
  }

  function createMockCallHandler(): CallHandler {
    return {
      handle: () => of({ success: true }),
    };
  }

  const mockUserPrincipal: UserPrincipal = {
    id: 'user-1',
    kind: 'USER',
    audience: 'client-portal',
    authenticatedAt: new Date(),
    status: 'ACTIVE',
  };

  it('should create audit log entry for mutation requests (POST/PUT/PATCH/DELETE)', async () => {
    const req = {
      method: 'POST',
      url: '/api/client/v1/leads',
      principal: mockUserPrincipal,
      tenantContext: { principalId: 'user-1', tenantId: 'tenant-1' },
      body: { name: 'John Doe', email: 'john@example.com' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'vitest' },
    };

    const ctx = createMockContext(req);
    const handler = createMockCallHandler();

    await new Promise((resolve) => {
      middleware.intercept(ctx, handler).subscribe({
        complete: () => resolve(true),
      });
    });

    // Wait microtask for tap async side effect
    await new Promise((r) => setTimeout(r, 50));

    expect(auditLogs).toHaveLength(1);
    const logMetadata = JSON.parse(String(auditLogs[0]?.[8]));
    expect(logMetadata.httpMethod).toBe('POST');
    expect(logMetadata.path).toBe('/api/client/v1/leads');
  });

  it('should NOT create audit log entry for read requests (GET)', async () => {
    const req = {
      method: 'GET',
      url: '/api/client/v1/leads',
      principal: mockUserPrincipal,
      tenantContext: { principalId: 'user-1', tenantId: 'tenant-1' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'vitest' },
    };

    const ctx = createMockContext(req);
    const handler = createMockCallHandler();

    await new Promise((resolve) => {
      middleware.intercept(ctx, handler).subscribe({
        complete: () => resolve(true),
      });
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(auditLogs).toHaveLength(0);
  });

  it('should NOT create audit log entry for skipped auth paths', async () => {
    const req = {
      method: 'POST',
      url: '/auth/login',
      principal: mockUserPrincipal,
      tenantContext: { principalId: 'user-1', tenantId: 'tenant-1' },
      body: { password: 'secret' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'vitest' },
    };

    const ctx = createMockContext(req);
    const handler = createMockCallHandler();

    await new Promise((resolve) => {
      middleware.intercept(ctx, handler).subscribe({
        complete: () => resolve(true),
      });
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(auditLogs).toHaveLength(0);
  });

  it('should record cross-tenant metadata for owner cross-tenant access', async () => {
    const ownerPrincipal: UserPrincipal = {
      id: 'owner-1',
      kind: 'USER',
      audience: 'owner-console',
      authenticatedAt: new Date(),
      status: 'ACTIVE',
      platformRole: 'PLATFORM_OWNER',
      ownerTenantScope: {
        tenantId: 'tenant-target',
        reason: 'Investigating support ticket #1234',
        expiresAt: new Date(Date.now() + 60000),
      },
    };

    const req = {
      method: 'POST',
      url: '/api/client/v1/leads',
      principal: ownerPrincipal,
      tenantContext: { principalId: 'owner-1', tenantId: 'tenant-target' },
      body: { action: 'update' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'vitest' },
    };

    const ctx = createMockContext(req);
    const handler = createMockCallHandler();

    await new Promise((resolve) => {
      middleware.intercept(ctx, handler).subscribe({
        complete: () => resolve(true),
      });
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(auditLogs).toHaveLength(1);
    const logMetadata = JSON.parse(String(auditLogs[0]?.[8]));
    expect(logMetadata.isCrossTenant).toBe(true);
    expect(logMetadata.crossTenantReason).toBe('Investigating support ticket #1234');
  });
});
