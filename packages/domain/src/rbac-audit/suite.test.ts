import { describe, it, expect, beforeEach } from 'vitest';

import type {
  RbacAuditSuite} from './suite';
import {
  createRbacAuditSuite,
  getRbacAuditSuite,
  resetRbacAuditSuite,
  type RbacEndpoint,
} from './suite';

describe('RbacAuditSuite', () => {
  let suite: RbacAuditSuite;

  beforeEach(() => {
    suite = createRbacAuditSuite();
  });

  function endpoint(partial: Partial<RbacEndpoint> & { path: string }): RbacEndpoint {
    return {
      audience: 'client-portal',
      description: 'Test endpoint',
      method: 'GET',
      permission: 'client.conversations.read' as never,
      ...partial,
    };
  }

  it('registers endpoints', () => {
    suite.register(endpoint({ path: '/api/conversations' }));
    expect(suite.list()).toHaveLength(1);
  });

  it('registers multiple endpoints', () => {
    suite.registerAll([
      endpoint({ path: '/api/a' }),
      endpoint({ path: '/api/b' }),
    ]);
    expect(suite.list()).toHaveLength(2);
  });

  it('prevents duplicate registration by method+path', () => {
    suite.register(endpoint({ path: '/api/a' }));
    suite.register(endpoint({ path: '/api/a', description: 'updated' }));
    expect(suite.list()).toHaveLength(1);
    expect(suite.list()[0]?.description).toBe('updated');
  });

  it('audits client-portal endpoint with role checks', () => {
    suite.register(endpoint({
      audience: 'client-portal',
      path: '/api/conversations',
      permission: 'client.conversations.read' as never,
    }));

    const [registered] = suite.list();
    if (!registered) {
      throw new Error('expected a registered endpoint to audit');
    }
    const result = suite.auditEndpoint(registered);
    expect(result.passed).toBe(true);
    expect(result.positiveTests.length + result.negativeTests.length).toBeGreaterThan(0);
  });

  it('audits owner-console endpoint with platform roles', () => {
    suite.register(endpoint({
      audience: 'owner-console',
      path: '/api/tenants',
      permission: 'platform.tenant.read' as never,
    }));

    const [registered] = suite.list();
    if (!registered) {
      throw new Error('expected a registered endpoint to audit');
    }
    const result = suite.auditEndpoint(registered);
    expect(result.passed).toBe(true);
    expect(result.positiveTests.length + result.negativeTests.length).toBeGreaterThan(0);
  });

  it('PLATFORM_OWNER has platform.tenant.read permission', () => {
    const ep = endpoint({
      audience: 'owner-console',
      path: '/api/tenants',
      permission: 'platform.tenant.read' as never,
    });
    suite.register(ep);
    expect(suite.roleHasPermission('PLATFORM_OWNER', ep)).toBe(true);
  });

  it('SUPPORT does not have platform.tenant.manage permission', () => {
    const ep = endpoint({
      audience: 'owner-console',
      path: '/api/tenants',
      permission: 'platform.tenant.manage' as never,
    });
    suite.register(ep);
    expect(suite.roleHasPermission('SUPPORT', ep)).toBe(false);
  });

  it('audits all registered endpoints', () => {
    suite.registerAll([
      endpoint({ path: '/api/a' }),
      endpoint({ path: '/api/b' }),
      endpoint({ path: '/api/c' }),
    ]);
    const results = suite.auditAll();
    expect(results).toHaveLength(3);
  });

  it('returns summary with counts', () => {
    suite.registerAll([
      endpoint({ path: '/api/a' }),
      endpoint({ path: '/api/b' }),
    ]);
    const summary = suite.summary();
    expect(summary.total).toBe(2);
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(0);
  });

  it('resets to empty', () => {
    suite.register(endpoint({ path: '/api/a' }));
    suite.reset();
    expect(suite.list()).toHaveLength(0);
  });
});

describe('RbacAuditSuite singleton', () => {
  beforeEach(() => {
    resetRbacAuditSuite();
  });

  it('returns same instance', () => {
    expect(getRbacAuditSuite()).toBe(getRbacAuditSuite());
  });

  it('reset creates new instance', () => {
    const s1 = getRbacAuditSuite();
    resetRbacAuditSuite();
    const s2 = getRbacAuditSuite();
    expect(s1).not.toBe(s2);
  });
});
