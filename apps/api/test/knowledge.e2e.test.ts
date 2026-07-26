import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap';

const KB = 'kb-stage1';

describe('knowledge API — ingest and retrieve', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => app.close());

  it('ingests a document and lists it for the tenant', async () => {
    const ingest = await app.inject({
      headers: {
        'idempotency-key': 'kb-ingest-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { knowledgeBaseId: KB, text: 'Jam buka Senin-Jumat 09:00-17:00' },
      url: '/api/client/v1/knowledge/documents',
    });

    expect(ingest.statusCode).toBe(201);
    const doc = ingest.json().data as { id: string; tenantId: string };
    expect(doc.id).toBeTruthy();

    const list = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: `/api/client/v1/knowledge/documents?knowledgeBaseId=${KB}`,
    });
    expect(list.statusCode).toBe(200);
    const rows = list.json().data as Array<{ id: string }>;
    expect(rows.some((row) => row.id === doc.id)).toBe(true);
  });

  it('retrieves only documents in the requested knowledge bases', async () => {
    await app.inject({
      headers: {
        'idempotency-key': 'kb-ingest-2',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { knowledgeBaseId: 'kb-other', text: 'harga promo' },
      url: '/api/client/v1/knowledge/documents',
    });

    const response = await app.inject({
      headers: {
        'idempotency-key': 'kb-retrieve-1',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: { knowledgeBaseIds: [KB], limit: 5, query: 'jam buka' },
      url: '/api/client/v1/knowledge/retrieve',
    });

    expect(response.statusCode).toBe(200);
    const rows = response.json().data as Array<{
      citation: { documentId: string; excerpt: string };
      document: { knowledgeBaseId: string };
      score: number;
    }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.document.knowledgeBaseId === KB)).toBe(true);
    // Every hit is evidence: it has a score and something to cite.
    expect(rows.every((row) => row.score > 0)).toBe(true);
    expect(rows.every((row) => row.citation.excerpt.length > 0)).toBe(true);
  });

  it('returns no evidence for a question the corpus does not answer', async () => {
    const response = await app.inject({
      headers: {
        'idempotency-key': 'kb-retrieve-2',
        'x-test-subject': 'local|client-owner',
      },
      method: 'POST',
      payload: {
        knowledgeBaseIds: [KB],
        query: 'bagaimana cara mengganti oli mesin diesel',
      },
      url: '/api/client/v1/knowledge/retrieve',
    });

    expect(response.statusCode).toBe(200);
    // "No evidence" is an honest outcome, not an empty-ish guess.
    expect(response.json().data).toEqual([]);
  });

  it('rejects unauthenticated access', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/client/v1/knowledge/documents',
    });
    expect(response.statusCode).toBe(401);
  });
});
