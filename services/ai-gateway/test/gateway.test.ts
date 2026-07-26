import { createMockAiAdapter, type KnowledgeDocument } from '@chai/connectors/mock-ai';
import { describe, expect, it, vi } from 'vitest';

import { createAiGateway } from '../src';

const TENANT_A = '01890f47-9b3c-7cc2-98e8-123456789207';
const TENANT_B = '01890f47-9b3c-7cc2-98e8-123456789208';

function document(partial: Partial<KnowledgeDocument> & { tenantId: string }): KnowledgeDocument {
  return {
    chunkIds: [`${partial.id ?? 'doc'}-chunk`],
    id: partial.id ?? 'doc-1',
    knowledgeBaseId: partial.knowledgeBaseId ?? 'kb-clinic',
    tenantId: partial.tenantId,
    text: partial.text ?? 'Klinik buka Senin sampai Sabtu, pukul 09.00 hingga 17.00.',
  };
}

describe('AI gateway', () => {
  it('resolves model alias and returns content', async () => {
    const adapter = createMockAiAdapter();
    const gateway = createAiGateway({
      adapter,
      aliases: { 'chai.default': 'gpt-4o-mini' },
    });

    const result = await gateway.complete({
      conversationId: 'conv-1',
      tenantId: TENANT_A,
      messages: [{ content: 'hello', role: 'user' }],
      model: 'chai.default',
    });

    expect(result.model).toBe('gpt-4o-mini');
    expect(result.content).toBeTruthy();
  });

  it('filters out blocked tools from proposals', async () => {
    const adapter = {
      complete: vi.fn().mockResolvedValue({
        citations: [],
        content: 'ok',
        model: 'chai.default',
        safeFallback: false,
        toolProposals: [
          { parameters: { amount: 100 }, tool: 'booking.create' },
          { parameters: { amount: 100 }, tool: 'payment.refund' },
        ],
        traceId: 'trace-1',
      }),
    };

    const gateway = createAiGateway({
      adapter: adapter as never,
      blockedTools: ['payment.refund'],
    });

    const result = await gateway.complete({
      conversationId: 'conv-1',
      tenantId: TENANT_A,
      messages: [{ content: 'bantu dong', role: 'user' }],
      model: 'chai.default',
    });

    expect(result.toolProposals.map((p) => p.tool)).toEqual(['booking.create']);
  });

  it('returns tool proposals unchanged when no blocklist', async () => {
    const adapter = {
      complete: vi.fn().mockResolvedValue({
        citations: [],
        content: 'ok',
        model: 'chai.default',
        safeFallback: false,
        toolProposals: [
          { parameters: {}, tool: 'booking.create' },
          { parameters: {}, tool: 'payment.refund' },
        ],
        traceId: 'trace-1',
      }),
    };

    const gateway = createAiGateway({
      adapter: adapter as never,
    });

    const result = await gateway.complete({
      conversationId: 'conv-1',
      tenantId: TENANT_A,
      messages: [{ content: 'hi', role: 'user' }],
      model: 'chai.default',
    });

    expect(result.toolProposals).toHaveLength(2);
  });
});

describe('knowledge base retrieval', () => {
  it('retrieves documents scoped by tenant', async () => {
    const adapter = createMockAiAdapter();
    adapter.ingestDocument(document({ tenantId: TENANT_A, knowledgeBaseId: 'kb-clinic', text: 'Klinik buka Senin-Jumat' }));
    adapter.ingestDocument(document({ tenantId: TENANT_B, knowledgeBaseId: 'kb-clinic', text: 'Clinic opens Monday-Friday' }));

    const docsA = await adapter.retrieve(TENANT_A, ['kb-clinic'], 5);
    const docsB = await adapter.retrieve(TENANT_B, ['kb-clinic'], 5);

    expect(docsA).toHaveLength(1);
    expect(docsB).toHaveLength(1);
    expect(docsA[0]?.tenantId).toBe(TENANT_A);
    expect(docsB[0]?.tenantId).toBe(TENANT_B);
  });
});

