import { describe, expect, it, vi } from 'vitest';

import * as databaseModule from '@chai/database';
import * as domainModule from '@chai/domain';

import { createAiGateway, processAiReplyTurn } from '../src';

const TENANT_ID = '01890f47-9b3c-7cc2-98e8-123456789207';
const CONVERSATION_ID = 'conv-123';
const MESSAGE_ID = 'msg-456';

describe('processAiReplyTurn pipeline', () => {
  function setupTest() {
    const mockTx = {} as databaseModule.DatabaseTransaction;

    vi.spyOn(databaseModule, 'withTenantTransaction').mockImplementation(
      async (
        _db: unknown,
        _ctx: unknown,
        callback: (tx: databaseModule.DatabaseTransaction) => Promise<unknown>,
      ) => callback(mockTx),
    );

    const adapter = {
      complete: vi.fn().mockResolvedValue({
        citations: [],
        content: 'Halo, ada yang bisa saya bantu?',
        model: 'gpt-4o',
        safeFallback: false,
        toolProposals: [],
        traceId: 'trace-1',
      }),
    };

    const gateway = createAiGateway({ adapter: adapter as never });

    return { adapter, gateway, mockTx };
  }

  it('completes turn and records AI reply when mode is AI_ACTIVE', async () => {
    const { gateway } = setupTest();

    vi.spyOn(domainModule, 'loadAiReplyContext').mockResolvedValue({
      alreadyReplied: false,
      channelAccountId: 'chan-1',
      channelAiEnabled: true,
      customerText: 'Berapa harga produk A?',
      externalUserId: 'user-1',
      mode: 'AI_ACTIVE',
      triggerSenderType: 'CUSTOMER',
    });

    const recordSpy = vi.spyOn(domainModule, 'recordAiReply').mockResolvedValue({
      messageId: 'reply-1',
      version: 2,
    });

    const result = await processAiReplyTurn({} as never, gateway, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      tenantId: TENANT_ID,
    });

    expect(result).toBe('REPLIED');
    expect(recordSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        conversationId: CONVERSATION_ID,
        replyText: 'Halo, ada yang bisa saya bantu?',
        tenantId: TENANT_ID,
        triggerMessageId: MESSAGE_ID,
      }),
    );
  });

  it('skips when context is not found', async () => {
    const { gateway } = setupTest();

    vi.spyOn(domainModule, 'loadAiReplyContext').mockResolvedValue(null);

    const result = await processAiReplyTurn({} as never, gateway, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      tenantId: TENANT_ID,
    });

    expect(result).toBe('SKIPPED_NOT_FOUND');
  });

  it('skips when already replied', async () => {
    const { gateway } = setupTest();

    vi.spyOn(domainModule, 'loadAiReplyContext').mockResolvedValue({
      alreadyReplied: true,
      channelAccountId: 'chan-1',
      channelAiEnabled: true,
      customerText: 'Hi',
      externalUserId: 'user-1',
      mode: 'AI_ACTIVE',
      triggerSenderType: 'CUSTOMER',
    });

    const result = await processAiReplyTurn({} as never, gateway, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      tenantId: TENANT_ID,
    });

    expect(result).toBe('SKIPPED_ALREADY_REPLIED');
  });

  it('skips when triggering message is written by AI (anti-loop)', async () => {
    const { gateway } = setupTest();

    vi.spyOn(domainModule, 'loadAiReplyContext').mockResolvedValue({
      alreadyReplied: false,
      channelAccountId: 'chan-1',
      channelAiEnabled: true,
      customerText: 'AI bot message',
      externalUserId: 'user-1',
      mode: 'AI_ACTIVE',
      triggerSenderType: 'AI',
    });

    const result = await processAiReplyTurn({} as never, gateway, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      tenantId: TENANT_ID,
    });

    expect(result).toBe('SKIPPED_AI_SENDER');
  });

  it('skips when mode is HUMAN_ACTIVE', async () => {
    const { gateway } = setupTest();

    vi.spyOn(domainModule, 'loadAiReplyContext').mockResolvedValue({
      alreadyReplied: false,
      channelAccountId: 'chan-1',
      channelAiEnabled: true,
      customerText: 'Saya mau tanya',
      externalUserId: 'user-1',
      mode: 'HUMAN_ACTIVE',
      triggerSenderType: 'CUSTOMER',
    });

    const result = await processAiReplyTurn({} as never, gateway, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      tenantId: TENANT_ID,
    });

    expect(result).toBe('SKIPPED_NOT_AI_ACTIVE');
  });

  it('skips when channel AI is disabled via kill switch', async () => {
    const { gateway } = setupTest();

    vi.spyOn(domainModule, 'loadAiReplyContext').mockResolvedValue({
      alreadyReplied: false,
      channelAccountId: 'chan-1',
      channelAiEnabled: false,
      customerText: 'Hallo',
      externalUserId: 'user-1',
      mode: 'AI_ACTIVE',
      triggerSenderType: 'CUSTOMER',
    });

    const result = await processAiReplyTurn({} as never, gateway, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      tenantId: TENANT_ID,
    });

    expect(result).toBe('SKIPPED_CHANNEL_DISABLED');
  });

  it('skips when customer text is empty', async () => {
    const { gateway } = setupTest();

    vi.spyOn(domainModule, 'loadAiReplyContext').mockResolvedValue({
      alreadyReplied: false,
      channelAccountId: 'chan-1',
      channelAiEnabled: true,
      customerText: '',
      externalUserId: 'user-1',
      mode: 'AI_ACTIVE',
      triggerSenderType: 'CUSTOMER',
    });

    const result = await processAiReplyTurn({} as never, gateway, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      tenantId: TENANT_ID,
    });

    expect(result).toBe('SKIPPED_NO_TEXT');
  });

  it('escalates to human when budget is exhausted', async () => {
    const { gateway } = setupTest();

    vi.spyOn(domainModule, 'loadAiReplyContext').mockResolvedValue({
      alreadyReplied: false,
      channelAccountId: 'chan-1',
      channelAiEnabled: true,
      customerText: 'Pertanyaan pembeli',
      externalUserId: 'user-1',
      mode: 'AI_ACTIVE',
      triggerSenderType: 'CUSTOMER',
    });

    vi.spyOn(gateway, 'complete').mockResolvedValue({
      budgetExhausted: true,
      citations: [],
      content: '',
      model: 'gpt-4o',
      safeFallback: true,
      toolProposals: [],
      traceId: 'trace-1',
    });

    const escalateSpy = vi
      .spyOn(domainModule, 'escalateConversationToHuman')
      .mockResolvedValue({ escalated: true, notified: true });

    const result = await processAiReplyTurn({} as never, gateway, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      tenantId: TENANT_ID,
    });

    expect(result).toBe('ESCALATED_BUDGET');
    expect(escalateSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        auditAction: 'ai.budget_exceeded',
        conversationId: CONVERSATION_ID,
        reason: 'BUDGET_EXHAUSTED',
        tenantId: TENANT_ID,
      }),
    );
  });

  it('escalates to human when guardrail blocks response', async () => {
    const { gateway } = setupTest();

    vi.spyOn(domainModule, 'loadAiReplyContext').mockResolvedValue({
      alreadyReplied: false,
      channelAccountId: 'chan-1',
      channelAiEnabled: true,
      customerText: 'Prompt rahasia',
      externalUserId: 'user-1',
      mode: 'AI_ACTIVE',
      triggerSenderType: 'CUSTOMER',
    });

    vi.spyOn(gateway, 'complete').mockResolvedValue({
      budgetExhausted: false,
      citations: [],
      content: '',
      model: 'gpt-4o',
      safeFallback: true,
      toolProposals: [],
      traceId: 'trace-1',
    });

    const escalateSpy = vi
      .spyOn(domainModule, 'escalateConversationToHuman')
      .mockResolvedValue({ escalated: true, notified: true });

    const result = await processAiReplyTurn({} as never, gateway, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      tenantId: TENANT_ID,
    });

    expect(result).toBe('ESCALATED_GUARDRAIL');
    expect(escalateSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        auditAction: 'ai.guardrail_blocked',
        conversationId: CONVERSATION_ID,
        reason: 'GUARDRAIL_BLOCKED',
        tenantId: TENANT_ID,
      }),
    );
  });
});
