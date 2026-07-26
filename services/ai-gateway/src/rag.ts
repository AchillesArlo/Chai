import { randomUUID } from 'node:crypto';

import type { AiCitation, KnowledgeDocument } from '@chai/connectors/mock-ai';

// ponytail: RAG pipeline with in-memory cosine similarity.
// Swap the retriever for pgvector when persistence is needed.

/**
 * RAG retrieval request.
 */
export interface RagRetrievalRequest {
  knowledgeBaseIds: string[];
  limit?: number;
  query: string;
  tenantId: string;
}

/**
 * RAG retrieval result.
 */
export interface RagRetrievalResult {
  citations: AiCitation[];
  context: string;
  retrievedDocuments: KnowledgeDocument[];
}

/**
 * Abstract retriever interface — implement with pgvector or in-memory.
 */
export interface RagRetriever {
  retrieve(request: RagRetrievalRequest): Promise<KnowledgeDocument[]>;
  index(tenantId: string, doc: KnowledgeDocument): Promise<void>;
}

/**
 * In-memory retriever using bag-of-words cosine similarity.
 * ponytail: O(n) scan per query; swap for pgvector ANN when corpus grows.
 */
export class InMemoryRagRetriever implements RagRetriever {
  private documents: Map<string, KnowledgeDocument[]> = new Map();

  async retrieve(request: RagRetrievalRequest): Promise<KnowledgeDocument[]> {
    const docs = (this.documents.get(request.tenantId) ?? []).filter(
      (d) => request.knowledgeBaseIds.length === 0 || request.knowledgeBaseIds.includes(d.knowledgeBaseId)
    );

    const queryVec = this.tokenize(request.query);
    const scored = docs
      .map((doc) => ({
        doc,
        score: this.cosineSimilarity(queryVec, this.tokenize(doc.text)),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, request.limit ?? 3);

    return scored.map((s) => s.doc);
  }

  async index(tenantId: string, doc: KnowledgeDocument): Promise<void> {
    const list = this.documents.get(tenantId) ?? [];
    list.push(doc);
    this.documents.set(tenantId, list);
  }

  /**
   * Bag-of-words tokenization with term frequency.
   */
  private tokenize(text: string): Map<string, number> {
    const tokens = text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1);
    const vec = new Map<string, number>();
    for (const token of tokens) {
      vec.set(token, (vec.get(token) ?? 0) + 1);
    }
    return vec;
  }

  /**
   * Cosine similarity between two term-frequency vectors.
   */
  private cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (const [key, val] of a) {
      normA += val * val;
      const bVal = b.get(key);
      if (bVal !== undefined) {
        dotProduct += val * bVal;
      }
    }
    for (const val of b.values()) {
      normB += val * val;
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

/**
 * Build a RAG context string from retrieved documents.
 */
export function buildRagContext(documents: KnowledgeDocument[]): string {
  if (documents.length === 0) return '';
  return documents
    .map((doc, i) => `[${i + 1}] ${doc.text}`)
    .join('\n\n');
}

/**
 * Convert retrieved documents to citations.
 */
export function documentsToCitations(
  documents: KnowledgeDocument[]
): AiCitation[] {
  return documents.map((doc) => ({
    chunkId: doc.id,
    documentId: doc.id,
    evidence: doc.text.slice(0, 200),
    knowledgeBaseId: doc.knowledgeBaseId,
    score: 1, // score assigned by retriever; simplified here
  }));
}

/**
 * Full RAG pipeline: retrieve → build context → generate citations.
 */
export async function runRagPipeline(
  retriever: RagRetriever,
  request: RagRetrievalRequest
): Promise<RagRetrievalResult> {
  const documents = await retriever.retrieve(request);
  const context = buildRagContext(documents);
  const citations = documentsToCitations(documents);

  return {
    citations,
    context,
    retrievedDocuments: documents,
  };
}

/**
 * Create a default in-memory RAG retriever.
 */
export function createInMemoryRagRetriever(): InMemoryRagRetriever {
  return new InMemoryRagRetriever();
}

/**
 * Generate a unique RAG trace ID.
 */
export function generateRagTraceId(): string {
  return randomUUID();
}
