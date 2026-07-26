import { describe, expect, it } from 'vitest';

import { createChannelIngestHandler } from '../src/index';

describe('channel worker handler', () => {
  it('acknowledges claims as processed (no-op ingest path)', async () => {
    const handler = createChannelIngestHandler();
    await expect(
      handler.process({
        attempts: 0,
        externalEventId: 'ext-1',
        id: 'inbox-1',
        payloadReference: 'restricted://mock/1',
        provider: 'mock-channel',
        providerAccountId: 'acct-1',
        schemaVersion: 1,
        tenantId: 'tenant-1',
      }),
    ).resolves.toBe('processed');
  });
});
