import { describe, expect, it } from 'vitest';

import type { FlowDefinition } from './flow-types';
import { simulateFlow } from './simulation';
import type { FlowEngineHandlers } from './flow-engine';

const handlers: FlowEngineHandlers = {
  actions: {
    sendMessage: () => ({ sent: true }),
    createLead: () => ({ leadId: 'lead-1' }),
  },
  conditions: {
    checkKeyword: (node) => node.config['keyword'] === 'urgent',
  },
};

describe('simulateFlow', () => {
  it('returns a trace with one entry per executed node', () => {
    const def: FlowDefinition = {
      id: 'f1',
      version: 1,
      nodes: [
        { id: 't1', type: 'trigger', trigger: 'onMessageReceived', config: {} },
        { id: 'c1', type: 'condition', condition: 'checkKeyword', config: { keyword: 'urgent' } },
        { id: 'a1', type: 'action', action: 'sendMessage', config: {} },
      ],
      edges: [
        { from: 't1', to: 'c1' },
        { from: 'c1', to: 'a1', branch: 'true' },
      ],
    };
    const result = simulateFlow(def, { message: 'urgent help' }, handlers);
    expect(result.status).toBe('COMPLETED');
    expect(result.trace).toHaveLength(2);
    expect(result.trace.map((s) => s.nodeId)).toEqual(['c1', 'a1']);
    expect(result.trace[0]?.label).toContain('Condition');
    expect(result.output['sent']).toBe(true);
  });

  it('records startedAt and finishedAt timestamps', () => {
    const def: FlowDefinition = {
      id: 'f2',
      version: 1,
      nodes: [
        { id: 't1', type: 'trigger', trigger: 'onLeadCreated', config: {} },
        { id: 'a1', type: 'action', action: 'createLead', config: {} },
      ],
      edges: [{ from: 't1', to: 'a1' }],
    };
    const result = simulateFlow(def, {}, handlers);
    expect(result.startedAt).toBeTruthy();
    expect(result.finishedAt).toBeTruthy();
    expect(result.trace).toHaveLength(1);
    expect(result.output['leadId']).toBe('lead-1');
  });

  it('skips trace when trigger mismatch', () => {
    const def: FlowDefinition = {
      id: 'f3',
      version: 1,
      nodes: [
        { id: 't1', type: 'trigger', trigger: 'onPaymentReceived', config: {} },
        { id: 'a1', type: 'action', action: 'sendMessage', config: {} },
      ],
      edges: [{ from: 't1', to: 'a1' }],
    };
    const result = simulateFlow(def, {}, handlers, { tenantId: 'tenant-x', trigger: 'onMessageReceived' });
    expect(result.status).toBe('SKIPPED');
    expect(result.trace).toEqual([]);
  });
});
