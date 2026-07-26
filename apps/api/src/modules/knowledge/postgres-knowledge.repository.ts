import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
} from '@chai/database';
import type { KnowledgeDocument } from '@chai/connectors/mock-ai';

import {
  DATABASE,
  SERVICE_PRINCIPAL_ID,
} from '../../database/database.module';
import {
  DEFAULT_EVIDENCE_THRESHOLD,
  KnowledgeRepository,
  toExcerpt,
  type RetrieveOptions,
  type RetrievedEvidence,
} from './knowledge.repository';

interface KnowledgeDocumentRow {
  chunk_ids: string[];
  content: string;
  id: string;
  knowledge_base_id: string;
  tenant_id: string;
  title: string;
}

// ponytail: retrieve returns recent docs per KB; keyword ILIKE search is
// deferred until the port grows a query argument.
@Injectable()
export class PostgresKnowledgeRepository extends KnowledgeRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async ingest(
    tenantId: string,
    input: { knowledgeBaseId: string; text: string },
  ): Promise<KnowledgeDocument> {
    const id = randomUUID();
    const chunkIds = [`${randomUUID()}-chunk`];
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        await tx`
          INSERT INTO chai.knowledge_document (
            id, tenant_id, knowledge_base_id, title, content, source, status, chunk_ids
          ) VALUES (
            ${id}, ${tenantId}, ${input.knowledgeBaseId},
            ${input.text.slice(0, 200)}, ${input.text},
            'manual', 'READY', ${chunkIds}
          )
        `;
        return {
          chunkIds,
          id,
          knowledgeBaseId: input.knowledgeBaseId,
          tenantId,
          text: input.text,
        };
      },
    );
  }

  override async list(
    tenantId: string,
    knowledgeBaseId?: string,
  ): Promise<KnowledgeDocument[]> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        const rows: KnowledgeDocumentRow[] = knowledgeBaseId
          ? await tx`
              SELECT id, tenant_id, knowledge_base_id, title, content, chunk_ids
              FROM chai.knowledge_document
              WHERE tenant_id = ${tenantId}
                AND knowledge_base_id = ${knowledgeBaseId}
              ORDER BY created_at DESC
            `
          : await tx`
              SELECT id, tenant_id, knowledge_base_id, title, content, chunk_ids
              FROM chai.knowledge_document
              WHERE tenant_id = ${tenantId}
              ORDER BY created_at DESC
            `;
        return rows.map((row) => this.mapDocument(row));
      },
    );
  }

  override async retrieve(
    tenantId: string,
    options: RetrieveOptions,
  ): Promise<RetrievedEvidence[]> {
    const limit = options.limit ?? 3;
    const minScore = options.minScore ?? DEFAULT_EVIDENCE_THRESHOLD;
    if (options.query.trim().length === 0) {
      return [];
    }

    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      async (tx) => {
        // Full-text relevance, not recency: `websearch_to_tsquery` tolerates
        // ordinary customer phrasing, and `ts_rank` gives the score the evidence
        // threshold is applied to (08_AI §12).
        const rows: Array<KnowledgeDocumentRow & { score: number }> = await tx`
          SELECT
            id, tenant_id, knowledge_base_id, title, content, chunk_ids,
            ts_rank(
              to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, '')),
              websearch_to_tsquery('simple', ${options.query})
            ) AS score
          FROM chai.knowledge_document
          WHERE tenant_id = ${tenantId}
            AND knowledge_base_id = ANY(${options.knowledgeBaseIds}::text[])
            AND status = 'READY'
            AND to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
                @@ websearch_to_tsquery('simple', ${options.query})
          ORDER BY score DESC, created_at DESC
          LIMIT ${Math.max(1, Math.trunc(limit))}::int
        `;

        return rows
          .filter((row) => Number(row.score) >= minScore)
          .map((row) => {
            const document = this.mapDocument(row);
            return {
              citation: {
                documentId: document.id,
                excerpt: toExcerpt(document.text),
                knowledgeBaseId: document.knowledgeBaseId,
              },
              document,
              score: Number(row.score),
            };
          });
      },
    );
  }

  private mapDocument(row: KnowledgeDocumentRow): KnowledgeDocument {
    return {
      chunkIds: row.chunk_ids,
      id: row.id,
      knowledgeBaseId: row.knowledge_base_id,
      tenantId: row.tenant_id,
      text: row.content,
    };
  }
}
