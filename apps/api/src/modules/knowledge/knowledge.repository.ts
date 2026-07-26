import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  createMockAiAdapter,
  type KnowledgeDocument,
  type MockAiAdapter,
} from '@chai/connectors/mock-ai';

/**
 * One retrieved piece of evidence.
 *
 * Retrieval used to return whatever was newest, which is not evidence at all: a
 * document is only usable support for an answer if it actually matches the
 * question. Every hit therefore carries its relevance score and a citation the
 * answer can point at (08_AI §12, §13).
 */
export interface RetrievedEvidence {
  citation: { documentId: string; knowledgeBaseId: string; excerpt: string };
  document: KnowledgeDocument;
  score: number;
}

export interface RetrieveOptions {
  knowledgeBaseIds: string[];
  limit?: number;
  /** Minimum relevance below which a hit is not evidence. */
  minScore?: number;
  query: string;
}

/** Below this, a match is noise rather than support for an answer. */
export const DEFAULT_EVIDENCE_THRESHOLD = 0.05;

export abstract class KnowledgeRepository {
  abstract ingest(
    tenantId: string,
    input: { knowledgeBaseId: string; text: string },
  ): Promise<KnowledgeDocument>;

  abstract list(
    tenantId: string,
    knowledgeBaseId?: string,
  ): Promise<KnowledgeDocument[]>;

  /**
   * Relevance-ranked retrieval. Returns only hits at or above the evidence
   * threshold, so "no evidence" is an honest, expected outcome.
   */
  abstract retrieve(
    tenantId: string,
    options: RetrieveOptions,
  ): Promise<RetrievedEvidence[]>;
}

/** Shared excerpt shape so citations look the same from either repository. */
export function toExcerpt(text: string, maxLength = 240): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length <= maxLength
    ? collapsed
    : `${collapsed.slice(0, maxLength - 1)}…`;
}

@Injectable()
export class InMemoryKnowledgeRepository extends KnowledgeRepository {
  private readonly adapter: MockAiAdapter = createMockAiAdapter();
  private readonly index = new Map<string, KnowledgeDocument[]>();

  async ingest(
    tenantId: string,
    input: { knowledgeBaseId: string; text: string },
  ): Promise<KnowledgeDocument> {
    const document: KnowledgeDocument = {
      chunkIds: [`${randomUUID()}-chunk`],
      id: randomUUID(),
      knowledgeBaseId: input.knowledgeBaseId,
      tenantId,
      text: input.text,
    };
    this.adapter.ingestDocument(document);
    const list = this.index.get(tenantId) ?? [];
    list.push(document);
    this.index.set(tenantId, list);
    return document;
  }

  async list(
    tenantId: string,
    knowledgeBaseId?: string,
  ): Promise<KnowledgeDocument[]> {
    const list = this.index.get(tenantId) ?? [];
    if (!knowledgeBaseId) return [...list];
    return list.filter((doc) => doc.knowledgeBaseId === knowledgeBaseId);
  }

  async retrieve(
    tenantId: string,
    options: RetrieveOptions,
  ): Promise<RetrievedEvidence[]> {
    const limit = options.limit ?? 3;
    const minScore = options.minScore ?? DEFAULT_EVIDENCE_THRESHOLD;
    const terms = tokenize(options.query);
    if (terms.length === 0) {
      return [];
    }

    const candidates = (this.index.get(tenantId) ?? []).filter((doc) =>
      options.knowledgeBaseIds.includes(doc.knowledgeBaseId),
    );

    return candidates
      .map((document) => ({
        citation: {
          documentId: document.id,
          excerpt: toExcerpt(document.text),
          knowledgeBaseId: document.knowledgeBaseId,
        },
        document,
        score: scoreOverlap(terms, document.text),
      }))
      .filter((hit) => hit.score >= minScore)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }
}

/** Lowercased word tokens, ignoring punctuation and one-character noise. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1);
}

/**
 * Fraction of query terms present in the document.
 *
 * Deliberately simple and explainable: the database path uses Postgres
 * full-text ranking, and this in-memory double only needs to agree on the
 * *shape* of the contract — score, threshold, ordering.
 */
function scoreOverlap(terms: string[], text: string): number {
  const haystack = new Set(tokenize(text));
  const hits = terms.filter((term) => haystack.has(term)).length;
  return hits / terms.length;
}
