import { describe, it, expect, beforeEach } from 'vitest';

import type {
  ConversationStateMachine} from '../src/conversation-state';
import {
  ConversationStateError,
  createConversationStateMachine,
  getConversationStateMachine,
  resetConversationStateMachine,
} from '../src/conversation-state';

describe('ConversationStateMachine', () => {
  let machine: ConversationStateMachine;

  beforeEach(() => {
    machine = createConversationStateMachine();
  });

  it('initializes conversation in AI_ACTIVE mode', () => {
    const state = machine.init('conv-1', 'tenant-1');
    expect(state.currentMode).toBe('AI_ACTIVE');
    expect(state.tenantId).toBe('tenant-1');
    expect(state.history).toHaveLength(0);
  });

  it('transitions from AI_ACTIVE to HUMAN_ACTIVE on ESCALATE', () => {
    machine.init('conv-1', 'tenant-1');
    const state = machine.transition('conv-1', 'ESCALATE');
    expect(state.currentMode).toBe('HUMAN_ACTIVE');
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.event).toBe('ESCALATE');
  });

  it('transitions from AI_ACTIVE to PAUSED on PAUSE', () => {
    machine.init('conv-1', 'tenant-1');
    const state = machine.transition('conv-1', 'PAUSE');
    expect(state.currentMode).toBe('PAUSED');
  });

  it('transitions from PAUSED to AI_ACTIVE on RESUME', () => {
    machine.init('conv-1', 'tenant-1');
    machine.transition('conv-1', 'PAUSE');
    const state = machine.transition('conv-1', 'RESUME');
    expect(state.currentMode).toBe('AI_ACTIVE');
  });

  it('transitions from PAUSED to HUMAN_ACTIVE on HUMAN_TAKEOVER', () => {
    machine.init('conv-1', 'tenant-1');
    machine.transition('conv-1', 'PAUSE');
    const state = machine.transition('conv-1', 'HUMAN_TAKEOVER');
    expect(state.currentMode).toBe('HUMAN_ACTIVE');
  });

  it('transitions from HUMAN_ACTIVE to AI_ACTIVE on START_AI', () => {
    machine.init('conv-1', 'tenant-1');
    machine.transition('conv-1', 'ESCALATE');
    const state = machine.transition('conv-1', 'START_AI');
    expect(state.currentMode).toBe('AI_ACTIVE');
  });

  it('throws on invalid transition', () => {
    machine.init('conv-1', 'tenant-1');
    expect(() => machine.transition('conv-1', 'RESUME')).toThrow(ConversationStateError);
  });

  it('throws on uninitialized conversation', () => {
    expect(() => machine.transition('unknown', 'ESCALATE')).toThrow(ConversationStateError);
  });

  it('checks if transition is valid', () => {
    machine.init('conv-1', 'tenant-1');
    expect(machine.canTransition('conv-1', 'ESCALATE')).toBe(true);
    expect(machine.canTransition('conv-1', 'RESUME')).toBe(false);
  });

  it('checks mode flags', () => {
    machine.init('conv-1', 'tenant-1');
    expect(machine.isAiActive('conv-1')).toBe(true);
    expect(machine.isHumanActive('conv-1')).toBe(false);
    expect(machine.isPaused('conv-1')).toBe(false);

    machine.transition('conv-1', 'ESCALATE');
    expect(machine.isAiActive('conv-1')).toBe(false);
    expect(machine.isHumanActive('conv-1')).toBe(true);

    machine.transition('conv-1', 'PAUSE');
    expect(machine.isPaused('conv-1')).toBe(true);
  });

  it('maintains history of transitions', () => {
    machine.init('conv-1', 'tenant-1');
    machine.transition('conv-1', 'ESCALATE');
    machine.transition('conv-1', 'PAUSE');
    machine.transition('conv-1', 'RESUME');

    const state = machine.getState('conv-1');
    expect(state?.history).toHaveLength(3);
    expect(state?.history[0]?.event).toBe('ESCALATE');
    expect(state?.history[2]?.event).toBe('RESUME');
  });

  it('clears state for a conversation', () => {
    machine.init('conv-1', 'tenant-1');
    machine.clear('conv-1');
    expect(machine.getState('conv-1')).toBeNull();
  });

  it('resets all state', () => {
    machine.init('conv-1', 'tenant-1');
    machine.init('conv-2', 'tenant-1');
    machine.reset();
    expect(machine.getState('conv-1')).toBeNull();
    expect(machine.getState('conv-2')).toBeNull();
  });
});

describe('ConversationStateMachine singleton', () => {
  beforeEach(() => {
    resetConversationStateMachine();
  });

  it('returns same instance on repeated calls', () => {
    const m1 = getConversationStateMachine();
    const m2 = getConversationStateMachine();
    expect(m1).toBe(m2);
  });

  it('reset creates a new instance', () => {
    const m1 = getConversationStateMachine();
    resetConversationStateMachine();
    const m2 = getConversationStateMachine();
    expect(m1).not.toBe(m2);
  });
});
