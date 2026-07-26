import { describe, expect, it } from 'vitest';

import { InMemoryConversationRepository } from './in-memory-conversation.repository';

/**
 * Factory path is covered by channels.module: without DATABASE_URL the
 * in-memory repository is selected. This keeps a runnable smoke check for
 * the default Stage 2 fallback.
 */
describe('conversation repository selection', () => {
  it('in-memory path remains the default when DATABASE is null', async () => {
    const repository = new InMemoryConversationRepository();
    const result = await repository.ingest({
      channelAccount: '01890f47-9b3c-7cc2-98e8-12345678930a',
      content: { contentType: 'TEXT', text: 'hi' },
      direction: 'INBOUND',
      externalEventId: 'sel-1',
      externalMessageId: 'sel-msg-1',
      externalUserId: 'user-1',
      provider: 'mock-channel',
      providerTimestamp: new Date(),
      rawReference: 'restricted://mock/1',
      tenantId: '01890f47-9b3c-7cc2-98e8-123456789203',
    });
    expect(result.created).toBe(true);
    const listed = await repository.listConversations(
      '01890f47-9b3c-7cc2-98e8-123456789203',
    );
    expect(listed).toHaveLength(1);
  });
});
