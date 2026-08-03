import { describe, expect, it } from 'vitest';

import {
  decideWorkflowTransition,
  isActiveWorkflowStatus,
  isTerminalWorkflowStatus,
  type WorkflowStatus,
} from './transitions';

const ALL: readonly WorkflowStatus[] = [
  'PENDING',
  'RUNNING',
  'COMPENSATING',
  'DONE',
  'FAILED',
];

// The exact legal graph the state machine must enforce. Any pair not listed
// (and not a self-noop) must be rejected.
const LEGAL: ReadonlyArray<readonly [WorkflowStatus, WorkflowStatus]> = [
  ['PENDING', 'RUNNING'],
  ['PENDING', 'FAILED'],
  ['RUNNING', 'COMPENSATING'],
  ['RUNNING', 'DONE'],
  ['RUNNING', 'FAILED'],
  ['COMPENSATING', 'FAILED'],
];

function isLegal(from: WorkflowStatus, to: WorkflowStatus): boolean {
  return LEGAL.some(([f, t]) => f === from && t === to);
}

describe('workflow state machine — decideWorkflowTransition', () => {
  it('accepts every legal forward transition', () => {
    for (const [from, to] of LEGAL) {
      expect(decideWorkflowTransition(from, to)).toEqual({ kind: 'APPLY' });
    }
  });

  it('rejects a self-transition as NOOP', () => {
    for (const status of ALL) {
      expect(decideWorkflowTransition(status, status)).toEqual({
        kind: 'REJECT',
        reason: 'NOOP',
      });
    }
  });

  it('rejects any move out of a terminal status as TERMINAL', () => {
    for (const to of ALL) {
      if (to === 'DONE') continue;
      expect(decideWorkflowTransition('DONE', to)).toEqual({
        kind: 'REJECT',
        reason: 'TERMINAL',
      });
    }
    for (const to of ALL) {
      if (to === 'FAILED') continue;
      expect(decideWorkflowTransition('FAILED', to)).toEqual({
        kind: 'REJECT',
        reason: 'TERMINAL',
      });
    }
  });

  it('rejects illegal non-terminal moves as ILLEGAL', () => {
    // Exhaustive sweep: every ordered pair that is neither a self-noop, nor
    // out of a terminal state, nor in the legal graph, must be ILLEGAL.
    for (const from of ALL) {
      if (isTerminalWorkflowStatus(from)) continue;
      for (const to of ALL) {
        if (from === to) continue;
        if (isLegal(from, to)) continue;
        expect(decideWorkflowTransition(from, to)).toEqual({
          kind: 'REJECT',
          reason: 'ILLEGAL',
        });
      }
    }
  });

  it('never lets compensation flip back to forward progress or success', () => {
    expect(decideWorkflowTransition('COMPENSATING', 'RUNNING')).toEqual({
      kind: 'REJECT',
      reason: 'ILLEGAL',
    });
    expect(decideWorkflowTransition('COMPENSATING', 'DONE')).toEqual({
      kind: 'REJECT',
      reason: 'ILLEGAL',
    });
  });
});

describe('workflow status predicates', () => {
  it('classifies terminal statuses', () => {
    expect(isTerminalWorkflowStatus('DONE')).toBe(true);
    expect(isTerminalWorkflowStatus('FAILED')).toBe(true);
    expect(isTerminalWorkflowStatus('PENDING')).toBe(false);
    expect(isTerminalWorkflowStatus('RUNNING')).toBe(false);
    expect(isTerminalWorkflowStatus('COMPENSATING')).toBe(false);
  });

  it('classifies active (claimed, not settled) statuses', () => {
    expect(isActiveWorkflowStatus('RUNNING')).toBe(true);
    expect(isActiveWorkflowStatus('COMPENSATING')).toBe(true);
    expect(isActiveWorkflowStatus('PENDING')).toBe(false);
    expect(isActiveWorkflowStatus('DONE')).toBe(false);
    expect(isActiveWorkflowStatus('FAILED')).toBe(false);
  });
});
