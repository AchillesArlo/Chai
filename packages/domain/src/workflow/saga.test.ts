import { describe, expect, it } from 'vitest';

import { runSaga, type SagaStep } from './saga';

interface Ctx {
  log: string[];
}

function step(name: string, opts: { fail?: boolean; compensate?: boolean } = {}): SagaStep<Ctx> {
  return {
    name,
    execute: (ctx) => {
      if (opts.fail) throw new Error(`${name} failed`);
      ctx.log.push(`exec:${name}`);
    },
    compensate: opts.compensate === false ? undefined : (ctx) => {
      ctx.log.push(`comp:${name}`);
    },
  };
}

describe('runSaga', () => {
  it('runs every step forward and reports DONE', async () => {
    const ctx: Ctx = { log: [] };
    const result = await runSaga([step('a'), step('b'), step('c')], ctx);

    expect(result.status).toBe('DONE');
    expect(result.completedSteps).toEqual(['a', 'b', 'c']);
    expect(result.compensatedSteps).toEqual([]);
    expect(ctx.log).toEqual(['exec:a', 'exec:b', 'exec:c']);
  });

  it('unwinds completed steps in REVERSE order when a step fails mid-way', async () => {
    const ctx: Ctx = { log: [] };
    const result = await runSaga(
      [step('a'), step('b'), step('c', { fail: true }), step('d')],
      ctx,
    );

    expect(result.status).toBe('FAILED');
    expect(result.failedStep).toBe('c');
    expect(result.completedSteps).toEqual(['a', 'b']);
    // b then a — reverse of completion order. c never completed (nothing to
    // undo); d never ran.
    expect(result.compensatedSteps).toEqual(['b', 'a']);
    expect(ctx.log).toEqual(['exec:a', 'exec:b', 'comp:b', 'comp:a']);
    expect(result.compensationIncomplete).toBeFalsy();
  });

  it('does not compensate a step that never completed', async () => {
    const ctx: Ctx = { log: [] };
    const result = await runSaga([step('a', { fail: true }), step('b')], ctx);

    expect(result.status).toBe('FAILED');
    expect(result.completedSteps).toEqual([]);
    expect(result.compensatedSteps).toEqual([]);
    expect(ctx.log).toEqual([]);
  });

  it('flags compensationIncomplete when an undo itself throws, still unwinding the rest', async () => {
    const ctx: Ctx = { log: [] };
    const steps: SagaStep<Ctx>[] = [
      step('a'),
      {
        name: 'b',
        execute: (c) => {
          c.log.push('exec:b');
        },
        compensate: () => {
          throw new Error('b undo failed');
        },
      },
      step('c', { fail: true }),
    ];
    const result = await runSaga(steps, ctx);

    expect(result.status).toBe('FAILED');
    expect(result.compensationIncomplete).toBe(true);
    // b's undo threw (not recorded as compensated), but a's undo still ran.
    expect(result.compensatedSteps).toEqual(['a']);
    expect(ctx.log).toEqual(['exec:a', 'exec:b', 'comp:a']);
  });

  it('drives the observer through the full lifecycle', async () => {
    const events: string[] = [];
    const ctx: Ctx = { log: [] };
    await runSaga([step('a'), step('b', { fail: true })], ctx, {
      stepStarted: (n) => void events.push(`start:${n}`),
      stepCompleted: (n) => void events.push(`done:${n}`),
      compensationStarted: (n) => void events.push(`compensating:${n}`),
      stepCompensated: (n) => void events.push(`compensated:${n}`),
      finished: (r) => void events.push(`finished:${r.status}`),
    });

    expect(events).toEqual([
      'start:a',
      'done:a',
      'start:b',
      'compensating:b',
      'compensated:a',
      'finished:FAILED',
    ]);
  });
});
