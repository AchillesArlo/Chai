import { describe, expect, it } from 'vitest';

import { shouldMarkStale } from '../src/index';

describe('logistics stale detection', () => {
  it('flags shipments past the SLA window', () => {
    const last = new Date('2026-07-18T10:00:00Z');
    const now = new Date('2026-07-18T14:00:00Z');
    expect(shouldMarkStale(last, now, 3 * 60 * 60 * 1000)).toBe(true);
    expect(shouldMarkStale(last, now, 5 * 60 * 60 * 1000)).toBe(false);
  });
});
