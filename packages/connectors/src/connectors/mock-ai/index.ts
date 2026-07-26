import { randomUUID } from 'node:crypto';

export interface AiCompletionRequest {
  conversationId: string;
  model: string;
  messages: Array<{ content: string; role: 'system' | 'user' | 'assistant' }>;
  retrievalScope?: { knowledgeBaseIds: string[]; tenantId: string };
  tenantId: string;
}

export interface AiCitation {
  chunkId: string;
  documentId: string;
  evidence: string;
  knowledgeBaseId: string;
  score: number;
}

export interface AiToolProposal {
  parameters: Record<string, unknown>;
  tool: string;
}

export interface AiTokenUsage {
  completionTokens: number;
  costUsd: number;
  promptTokens: number;
  totalTokens: number;
}

export interface AiCompletionResult {
  citations: AiCitation[];
  content: string;
  model: string;
  safeFallback: boolean;
  toolProposals: AiToolProposal[];
  traceId: string;
  usage?: AiTokenUsage;
}

export interface KnowledgeDocument {
  chunkIds: string[];
  id: string;
  knowledgeBaseId: string;
  tenantId: string;
  text: string;
}

/**
 * Sandbox model adapter used by the AI gateway and its tests. Deterministic,
 * tenant-isolated retrieval, and always-safe fallback so slices that depend on
 * AI behavior (conversation replies, evidence, tool policy) are exercised
 * without a real provider.
 */
export function createMockAiAdapter() {
  const documentsByTenant = new Map<string, KnowledgeDocument[]>();

  return {
    ingestDocument(document: KnowledgeDocument): void {
      const list = documentsByTenant.get(document.tenantId) ?? [];
      list.push(document);
      documentsByTenant.set(document.tenantId, list);
    },

    async retrieve(tenantId: string, knowledgeBaseIds: string[], limit = 3): Promise<KnowledgeDocument[]> {
      const list = documentsByTenant.get(tenantId) ?? [];
      return list
        .filter((document) => knowledgeBaseIds.includes(document.knowledgeBaseId))
        .slice(0, limit);
    },

    async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
      const citations: AiCitation[] = [];
      if (request.retrievalScope) {
        const documents = await this.retrieve(
          request.retrievalScope.tenantId,
          request.retrievalScope.knowledgeBaseIds,
        );
        for (const document of documents) {
          citations.push({
            chunkId: document.chunkIds[0] ?? `${document.id}-chunk`,
            documentId: document.id,
            evidence: document.text.slice(0, 80),
            knowledgeBaseId: document.knowledgeBaseId,
            score: 0.92,
          });
        }
      }
      const lastUser = [...request.messages].reverse().find((message) => message.role === 'user');
      const content = lastUser
        ? `[${request.model}] ${citations.length > 0 ? 'Berdasarkan knowledge base' : 'Tanpa konteks'}: ${lastUser.content}`
        : `[${request.model}] ready`;

      return {
        citations,
        content,
        model: request.model,
        safeFallback: false,
        toolProposals: [],
        traceId: randomUUID(),
      };
    },
  };
}

export type MockAiAdapter = ReturnType<typeof createMockAiAdapter>;
