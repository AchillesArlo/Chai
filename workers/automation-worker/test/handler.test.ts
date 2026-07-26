import { describe, expect, it } from 'vitest';

import { createFollowUpHandler } from '../src/index';

describe('automation follow-up handler', () => {
  it('acknowledges claims as processed (no-op until job schema)', async () => {
    const handler = createFollowUpHandler();
    await expect(
      handler.process({
        attempts: 0,
        externalEventId: 'follow-1',
        id: 'inbox-1',
        payloadReference: 'restricted://follow-up/1',
        provider: 'automation',
        providerAccountId: 'system',
        schemaVersion: 1,
        tenantId: 'tenant-1',
      }),
    ).resolves.toBe('processed');
  });
});
