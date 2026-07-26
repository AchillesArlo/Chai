import { describe, it, expect, beforeEach } from 'vitest';

import {
  createAutoAssignmentEngine,
  getAutoAssignmentEngine,
  resetAutoAssignmentEngine,
} from './engine';
import type { AgentProfile ,
  AutoAssignmentEngine} from './engine';

const TENANT = '01890f47-9b3c-7cc2-98e8-123456789207';

function agent(partial: Partial<AgentProfile> & { agentId: string }): AgentProfile {
  return {
    active: true,
    skills: [],
    tenantId: TENANT,
    ...partial,
  };
}

describe('AutoAssignmentEngine', () => {
  let engine: AutoAssignmentEngine;

  beforeEach(() => {
    engine = createAutoAssignmentEngine();
  });

  it('returns null when no agents registered', () => {
    const result = engine.assignRoundRobin({ conversationId: 'c1', tenantId: TENANT });
    expect(result.agentId).toBeNull();
    expect(result.reason).toContain('No active agents');
  });

  it('assigns to the only available agent', () => {
    engine.registerAgent(agent({ agentId: 'a1' }));
    const result = engine.assignRoundRobin({ conversationId: 'c1', tenantId: TENANT });
    expect(result.agentId).toBe('a1');
    expect(result.strategy).toBe('round-robin');
  });

  it('round-robins across multiple agents', () => {
    engine.registerAgent(agent({ agentId: 'a1' }));
    engine.registerAgent(agent({ agentId: 'a2' }));
    engine.registerAgent(agent({ agentId: 'a3' }));

    const r1 = engine.assignRoundRobin({ conversationId: 'c1', tenantId: TENANT });
    const r2 = engine.assignRoundRobin({ conversationId: 'c2', tenantId: TENANT });
    const r3 = engine.assignRoundRobin({ conversationId: 'c3', tenantId: TENANT });
    const r4 = engine.assignRoundRobin({ conversationId: 'c4', tenantId: TENANT });

    expect(r1.agentId).toBe('a1');
    expect(r2.agentId).toBe('a2');
    expect(r3.agentId).toBe('a3');
    expect(r4.agentId).toBe('a1'); // wraps around
  });

  it('skips inactive agents', () => {
    engine.registerAgent(agent({ agentId: 'a1', active: false }));
    engine.registerAgent(agent({ agentId: 'a2', active: true }));

    const result = engine.assignRoundRobin({ conversationId: 'c1', tenantId: TENANT });
    expect(result.agentId).toBe('a2');
  });

  it('isolates rosters per tenant', () => {
    engine.registerAgent(agent({ agentId: 'a1', tenantId: TENANT }));
    engine.registerAgent(agent({ agentId: 'a2', tenantId: 'tenant-b' }));

    const resultA = engine.assignRoundRobin({ conversationId: 'c1', tenantId: TENANT });
    const resultB = engine.assignRoundRobin({ conversationId: 'c1', tenantId: 'tenant-b' });

    expect(resultA.agentId).toBe('a1');
    expect(resultB.agentId).toBe('a2');
  });

  it('unregisters an agent', () => {
    engine.registerAgent(agent({ agentId: 'a1' }));
    engine.registerAgent(agent({ agentId: 'a2' }));
    engine.unregisterAgent(TENANT, 'a1');

    const result = engine.assignRoundRobin({ conversationId: 'c1', tenantId: TENANT });
    expect(result.agentId).toBe('a2');
  });
});

describe('AutoAssignmentEngine skill-based', () => {
  let engine: AutoAssignmentEngine;

  beforeEach(() => {
    engine = createAutoAssignmentEngine();
  });

  it('assigns to agent with matching skills', () => {
    engine.registerAgent(agent({ agentId: 'a1', skills: ['billing'] }));
    engine.registerAgent(agent({ agentId: 'a2', skills: ['support', 'technical'] }));

    const result = engine.assignSkillBased({
      conversationId: 'c1',
      requiredSkills: ['technical'],
      tenantId: TENANT,
    });

    expect(result.agentId).toBe('a2');
    expect(result.strategy).toBe('skill-based');
  });

  it('returns null when no agent has required skills', () => {
    engine.registerAgent(agent({ agentId: 'a1', skills: ['billing'] }));

    const result = engine.assignSkillBased({
      conversationId: 'c1',
      requiredSkills: ['technical'],
      tenantId: TENANT,
    });

    expect(result.agentId).toBeNull();
    expect(result.reason).toContain('No agents with required skills');
  });

  it('falls back to round-robin when no skills required', () => {
    engine.registerAgent(agent({ agentId: 'a1', skills: ['billing'] }));

    const result = engine.assignSkillBased({
      conversationId: 'c1',
      tenantId: TENANT,
    });

    expect(result.agentId).toBe('a1');
    expect(result.strategy).toBe('round-robin');
  });

  it('round-robins among skilled agents', () => {
    engine.registerAgent(agent({ agentId: 'a1', skills: ['technical'] }));
    engine.registerAgent(agent({ agentId: 'a2', skills: ['technical'] }));
    engine.registerAgent(agent({ agentId: 'a3', skills: ['billing'] }));

    const r1 = engine.assignSkillBased({ conversationId: 'c1', requiredSkills: ['technical'], tenantId: TENANT });
    const r2 = engine.assignSkillBased({ conversationId: 'c2', requiredSkills: ['technical'], tenantId: TENANT });
    const r3 = engine.assignSkillBased({ conversationId: 'c3', requiredSkills: ['technical'], tenantId: TENANT });

    expect(r1.agentId).toBe('a1');
    expect(r2.agentId).toBe('a2');
    expect(r3.agentId).toBe('a1'); // wraps among skilled
  });

  it('requires all skills to match', () => {
    engine.registerAgent(agent({ agentId: 'a1', skills: ['technical'] }));
    engine.registerAgent(agent({ agentId: 'a2', skills: ['technical', 'billing'] }));

    const result = engine.assignSkillBased({
      conversationId: 'c1',
      requiredSkills: ['technical', 'billing'],
      tenantId: TENANT,
    });

    expect(result.agentId).toBe('a2');
  });
});

describe('AutoAssignmentEngine.assign', () => {
  let engine: AutoAssignmentEngine;

  beforeEach(() => {
    engine = createAutoAssignmentEngine();
  });

  it('uses round-robin by default', () => {
    engine.registerAgent(agent({ agentId: 'a1' }));
    const result = engine.assign({ conversationId: 'c1', tenantId: TENANT });
    expect(result.strategy).toBe('round-robin');
  });

  it('uses skill-based when specified', () => {
    engine.registerAgent(agent({ agentId: 'a1', skills: ['x'] }));
    const result = engine.assign({ conversationId: 'c1', requiredSkills: ['x'], tenantId: TENANT }, 'skill-based');
    expect(result.strategy).toBe('skill-based');
  });
});

describe('AutoAssignmentEngine singleton', () => {
  beforeEach(() => {
    resetAutoAssignmentEngine();
  });

  it('returns same instance', () => {
    expect(getAutoAssignmentEngine()).toBe(getAutoAssignmentEngine());
  });

  it('reset creates new instance', () => {
    const e1 = getAutoAssignmentEngine();
    resetAutoAssignmentEngine();
    const e2 = getAutoAssignmentEngine();
    expect(e1).not.toBe(e2);
  });
});
