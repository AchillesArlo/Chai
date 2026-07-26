import { describe, expect, it } from 'vitest';

import { foldMetrics } from '../src/index';

describe('analytics foldMetrics', () => {
  it('sums per tenant metric name', () => {
    const totals = foldMetrics([
      { name: 'conversation.resolved', tenantId: 'a', value: 1 },
      { name: 'conversation.resolved', tenantId: 'a', value: 2 },
      { name: 'conversation.resolved', tenantId: 'b', value: 1 },
    ]);
    expect(totals.get('a:conversation.resolved')).toBe(3);
    expect(totals.get('b:conversation.resolved')).toBe(1);
  });
});
