import { describe, expect, it } from 'vitest';

import type {
  ActionNode,
  ConditionNode,
  FlowDefinition,
  FlowExecutionContext,
  TriggerNode,
} from './flow-types';
import { executeFlow, type FlowEngineHandlers } from './flow-engine';

function trigger(): TriggerNode {
  return { id: 't1', type: 'trigger', trigger: 'onMessageReceived', config: {} };
}

function action(id: string, payload: Record<string, unknown>): ActionNode {
  return { id, type: 'action', action: 'sendMessage', config: payload };
}

function condition(id: string, passed: boolean): ConditionNode {
  return { id, type: 'condition', condition: 'checkKeyword', config: { passed } };
}

function context(input: Record<string, unknown> = {}): FlowExecutionContext {
  return {
    tenantId: 'tenant-1',
    trigger: 'onMessageReceived',
    input,
    variables: { ...input },
  };
}

const handlers: FlowEngineHandlers = {
  actions: {
    sendMessage: (node) => ({ sent: true, template: node.config['template'] ?? 'default' }),
  },
  conditions: {
    checkKeyword: (node) => node.config['passed'] === true,
  },
};

describe('executeFlow', () => {
  it('runs trigger → action → completion', () => {
    const def: FlowDefinition = {
      id: 'f1',
      version: 1,
      nodes: [trigger(), action('a1', { template: 'hello' })],
      edges: [{ from: 't1', to: 'a1' }],
    };
    const result = executeFlow(def, context(), handlers);
    expect(result.status).toBe('COMPLETED');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.nodeId).toBe('a1');
  });

  it('skips when trigger type does not match context', () => {
    const def: FlowDefinition = {
      id: 'f2',
      version: 1,
      nodes: [trigger(), action('a1', {})],
      edges: [{ from: 't1', to: 'a1' }],
    };
    const ctx: FlowExecutionContext = {
      tenantId: 'tenant-1',
      trigger: 'onLeadCreated',
      input: {},
      variables: {},
    };
    const result = executeFlow(def, ctx, handlers);
    expect(result.status).toBe('SKIPPED');
    expect(result.steps).toEqual([]);
  });

  it('branches true path on condition pass', () => {
    const def: FlowDefinition = {
      id: 'f3',
      version: 1,
      nodes: [trigger(), condition('c1', true), action('yes', {}), action('no', {})],
      edges: [
        { from: 't1', to: 'c1' },
        { from: 'c1', to: 'yes', branch: 'true' },
        { from: 'c1', to: 'no', branch: 'false' },
      ],
    };
    const result = executeFlow(def, context(), handlers);
    expect(result.status).toBe('COMPLETED');
    expect(result.steps.map((s) => s.nodeId)).toEqual(['c1', 'yes']);
  });

  it('branches false path on condition fail', () => {
    const def: FlowDefinition = {
      id: 'f4',
      version: 1,
      nodes: [trigger(), condition('c1', false), action('yes', {}), action('no', {})],
      edges: [
        { from: 't1', to: 'c1' },
        { from: 'c1', to: 'yes', branch: 'true' },
        { from: 'c1', to: 'no', branch: 'false' },
      ],
    };
    const result = executeFlow(def, context(), handlers);
    expect(result.steps.map((s) => s.nodeId)).toEqual(['c1', 'no']);
  });

  it('fails when an action handler is missing', () => {
    const def: FlowDefinition = {
      id: 'f5',
      version: 1,
      nodes: [trigger(), { id: 'a1', type: 'action', action: 'createLead', config: {} }],
      edges: [{ from: 't1', to: 'a1' }],
    };
    const result = executeFlow(def, context(), handlers);
    expect(result.status).toBe('FAILED');
    expect(result.steps[0]?.status).toBe('FAILED');
  });

  it('merges action output into context variables', () => {
    const def: FlowDefinition = {
      id: 'f6',
      version: 1,
      nodes: [trigger(), action('a1', { template: 'hi' })],
      edges: [{ from: 't1', to: 'a1' }],
    };
    const ctx = context();
    executeFlow(def, ctx, handlers);
    expect(ctx.variables['sent']).toBe(true);
  });
});
