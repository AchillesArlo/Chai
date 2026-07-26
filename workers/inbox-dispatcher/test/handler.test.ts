import { describe, expect, it } from 'vitest';

import { createInboxHandler } from '../src/main';

describe('inbox dispatcher deployed handler', () => {
  it('refuses to ack an unprocessed inbox event (retry, never a silent no-op)', async () => {
    const handler = createInboxHandler();
    const result = await handler.process({
      attempts: 0,
      externalEventId: 'ext-1',
      id: 'inbox-1',
      payloadReference: 'restricted://mock/1',
      provider: 'mock-channel',
      providerAccountId: 'acct-1',
      schemaVersion: 1,
      tenantId: 'tenant-1',
    });
    // Domain ingest is applied inline at the API edge and this worker has no
    // payload store to re-run it, so the deployed handler must NOT mark the event
    // 'processed'. 'retry' routes a stray event to the DEAD_LETTER path.
    expect(result).toBe('retry');
    expect(result).not.toBe('processed');
  });
});
