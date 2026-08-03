import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';

import { RECENT_AUTH_ROUTES, assertRecentAuthentication } from '../src/guards/high-risk';

/**
 * REQ-10-005: recent-auth coverage.
 *
 * RECENT_AUTH_ROUTES (guards/high-risk.ts) is the source-of-truth inventory
 * of sensitive routes that must re-prove the caller's credential rather than
 * trust a merely-live session. This test proves the inventory is not just a
 * comment: every listed route's handler file actually calls
 * assertRecentAuthentication, so removing the call without updating the
 * inventory (or vice versa) fails the build.
 */

const ROUTE_TO_FILE: Record<string, string> = {
  'DELETE /api/client/v1/team/:id': 'modules/iam/iam.controller.ts',
  'DELETE /api/owner/v1/connector-config/secrets/:id':
    'modules/connector-config/connector-config.controller.ts',
  'POST /api/client/v1/payments/:id/refunds':
    'modules/advanced-payments/advanced-payments.controller.ts',
  'POST /api/client/v1/subscriptions':
    'modules/advanced-payments/advanced-payments.controller.ts',
  'POST /api/owner/v1/connector-config/configs/:id/secrets':
    'modules/connector-config/connector-config.controller.ts',
  'POST /api/owner/v1/enterprise/audit-export-config':
    'modules/enterprise/enterprise.controller.ts',
  'POST /api/client/v1/payments/reconciliations/:id/resolve':
    'modules/advanced-payments/advanced-payments.controller.ts',
};

describe('recent-auth route inventory', () => {
  it('maps every inventoried route to a controller file', () => {
    for (const entry of RECENT_AUTH_ROUTES) {
      expect(ROUTE_TO_FILE).toHaveProperty(entry.route);
    }
  });

  it('every inventoried route calls assertRecentAuthentication in its file', async () => {
    const sourceRoot = join(process.cwd(), 'src');
    const filesChecked = new Set<string>();
    for (const entry of RECENT_AUTH_ROUTES) {
      const relativeFile = ROUTE_TO_FILE[entry.route];
      expect(relativeFile).toBeDefined();
      if (!relativeFile || filesChecked.has(relativeFile)) {
        continue;
      }
      filesChecked.add(relativeFile);
      const source = await readFile(join(sourceRoot, relativeFile), 'utf8');
      expect(source).toContain('assertRecentAuthentication(request)');
    }
  });

  it('rejects a principal whose authenticatedAt is outside the recent-auth window', () => {
    const stale = {
      principal: {
        audience: 'client-portal',
        authenticatedAt: new Date(Date.now() - 60 * 60 * 1000),
        id: 'user-1',
        kind: 'USER',
        status: 'ACTIVE',
      },
    } as unknown as FastifyRequest;

    expect(() => assertRecentAuthentication(stale)).toThrow();
  });

  it('accepts a principal authenticated within the recent-auth window', () => {
    const fresh = {
      principal: {
        audience: 'client-portal',
        authenticatedAt: new Date(),
        id: 'user-1',
        kind: 'USER',
        status: 'ACTIVE',
      },
    } as unknown as FastifyRequest;

    expect(() => assertRecentAuthentication(fresh)).not.toThrow();
  });

  it('rejects a request with no principal at all', () => {
    const anonymous = {} as unknown as FastifyRequest;
    expect(() => assertRecentAuthentication(anonymous)).toThrow();
  });
});
