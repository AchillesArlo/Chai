import { describe, it, expect, beforeEach } from 'vitest';

import type {
  ToolRegistry,
  TenantPolicyStore} from '../src/tool-execution';
import {
  ToolExecutionEngine,
  createToolRegistry,
  createTenantPolicyStore,
} from '../src/tool-execution';

/**
 * Stand-in for a decision the policy engine produced. The engine refuses to run
 * without one, which is what makes the policy path mandatory (R-11).
 */
function allow(tool: string) {
  return { kind: 'ALLOW' as const, risk: 'LOW' as const, tool };
}
describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = createToolRegistry();
  });

  it('registers and retrieves a tool', () => {
    registry.register(
      { description: 'Create booking', name: 'booking.create', parameters: {} },
      async () => 'booked'
    );

    const entry = registry.get('booking.create');
    expect(entry).not.toBeNull();
    expect(entry?.definition.name).toBe('booking.create');
  });

  it('returns null for unregistered tool', () => {
    expect(registry.get('unknown')).toBeNull();
  });

  it('lists all tool names', () => {
    registry.register({ description: 'a', name: 'tool.a', parameters: {} }, async () => 1);
    registry.register({ description: 'b', name: 'tool.b', parameters: {} }, async () => 2);

    const names = registry.list();
    expect(names).toHaveLength(2);
    expect(names).toContain('tool.a');
    expect(names).toContain('tool.b');
  });

  it('checks if tool exists', () => {
    registry.register({ description: 'a', name: 'tool.a', parameters: {} }, async () => 1);
    expect(registry.has('tool.a')).toBe(true);
    expect(registry.has('tool.b')).toBe(false);
  });
});

/**
 * Stand-in for a decision the policy engine produced. The engine refuses to run
 * without one, which is what makes the policy path mandatory (R-11).
 */
describe('TenantPolicyStore', () => {
  let store: TenantPolicyStore;

  beforeEach(() => {
    store = createTenantPolicyStore();
  });

  it('returns empty policy for unknown tenant', () => {
    const policy = store.get('tenant-1');
    expect(policy.tenantId).toBe('tenant-1');
    expect(policy.allowlist).toHaveLength(0);
    expect(policy.blockedTools).toHaveLength(0);
  });

  it('allows all tools when allowlist is empty', () => {
    const result = store.isAllowed('tenant-1', 'any.tool');
    expect(result.allowed).toBe(true);
  });

  it('blocks tools in blocklist', () => {
    store.set({
      allowlist: [],
      blockedTools: ['payment.refund'],
      tenantId: 'tenant-1',
    });

    const result = store.isAllowed('tenant-1', 'payment.refund');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('blocked');
  });

  it('allows only tools in allowlist when set', () => {
    store.set({
      allowlist: ['booking.create'],
      blockedTools: [],
      tenantId: 'tenant-1',
    });

    expect(store.isAllowed('tenant-1', 'booking.create').allowed).toBe(true);
    expect(store.isAllowed('tenant-1', 'booking.delete').allowed).toBe(false);
  });

  it('blocklist takes precedence over allowlist', () => {
    store.set({
      allowlist: ['booking.create'],
      blockedTools: ['booking.create'],
      tenantId: 'tenant-1',
    });

    expect(store.isAllowed('tenant-1', 'booking.create').allowed).toBe(false);
  });
});

/**
 * Stand-in for a decision the policy engine produced. The engine refuses to run
 * without one, which is what makes the policy path mandatory (R-11).
 */
describe('ToolExecutionEngine', () => {
  let engine: ToolExecutionEngine;
  let registry: ToolRegistry;
  let policyStore: TenantPolicyStore;

  beforeEach(() => {
    registry = createToolRegistry();
    policyStore = createTenantPolicyStore();
    engine = new ToolExecutionEngine(registry, policyStore);
  });

  it('executes allowed tool', async () => {
    registry.register(
      { description: 'Create booking', name: 'booking.create', parameters: {} },
      async (params) => ({ id: 'b-1', ...params })
    );

    const result = await engine.execute('tenant-1', 'booking.create', { slot: '10am' }, allow('booking.create'));
    expect(result.allowed).toBe(true);
    expect(result.result).toEqual({ id: 'b-1', slot: '10am' });
  });

  it('blocks execution for blocked tool', async () => {
    registry.register(
      { description: 'Refund', name: 'payment.refund', parameters: {} },
      async () => 'refunded'
    );
    policyStore.set({
      allowlist: [],
      blockedTools: ['payment.refund'],
      tenantId: 'tenant-1',
    });

    const result = await engine.execute('tenant-1', 'payment.refund', {}, allow('payment.refund'));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('blocked');
  });

  it('returns error for unregistered tool', async () => {
    const result = await engine.execute('tenant-1', 'unknown.tool', {}, allow('unknown.tool'));
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('not registered');
  });

  it('captures executor errors', async () => {
    registry.register(
      { description: 'Failing tool', name: 'fail.tool', parameters: {} },
      async () => { throw new Error('executor crashed'); }
    );

    const result = await engine.execute('tenant-1', 'fail.tool', {}, allow('fail.tool'));
    expect(result.allowed).toBe(true);
    expect(result.error).toBe('executor crashed');
  });

  it('refuses to execute without an ALLOW decision from the policy engine', async () => {
    registry.register(
      { description: 'Refund', name: 'payment.execute_refund', parameters: {} },
      async () => 'refunded'
    );

    const denied = await engine.execute(
      'tenant-1',
      'payment.execute_refund',
      {},
      {
        code: 'AI_EXECUTION_FORBIDDEN',
        kind: 'DENY',
        reason: 'critical tool',
        tool: 'payment.execute_refund',
      }
    );
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain('Policy did not allow');
  });

  it('refuses a decision issued for a different tool', async () => {
    registry.register(
      { description: 'Refund', name: 'payment.execute_refund', parameters: {} },
      async () => 'refunded'
    );

    const mismatched = await engine.execute(
      'tenant-1',
      'payment.execute_refund',
      {},
      allow('knowledge.search')
    );
    expect(mismatched.allowed).toBe(false);
    expect(mismatched.reason).toContain('issued for knowledge.search');
  });

  it('filters tool proposals against policy', () => {
    policyStore.set({
      allowlist: ['booking.create'],
      blockedTools: ['payment.refund'],
      tenantId: 'tenant-1',
    });

    const proposals = [{ name: 'booking.create' }, { name: 'payment.refund' }, { name: 'other.tool' }];
    const filtered = engine.filterProposals('tenant-1', proposals);

    expect(filtered).toHaveLength(3);
    expect(filtered[0]?.allowed).toBe(true);
    expect(filtered[1]?.allowed).toBe(false);
    expect(filtered[2]?.allowed).toBe(false);
  });
});
