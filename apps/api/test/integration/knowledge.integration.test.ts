import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@chai/database';

import { API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresKnowledgeRepository } from '../../src/modules/knowledge/postgres-knowledge.repository';

describe('API Postgres knowledge repository (S2-4)', () => {
  const adminUrl = inject('adminDatabaseUrl') as string;
  const runtimeUrl = inject('runtimeDatabaseUrl') as string;
  let admin: ReturnType<typeof createDatabase>;
  let runtime: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    admin = createDatabase(adminUrl);
    runtime = createDatabase(runtimeUrl);
    await seedApiRuntime(admin);
  });

  afterAll(async () => {
    await runtime.end();
    await admin.end();
  });

  it('ingests a document, lists and retrieves it under RLS', async () => {
    const knowledge = new PostgresKnowledgeRepository(runtime);
    const knowledgeBaseId = 'kb-s2-4-int';

    const ingested = await knowledge.ingest(API_TENANT_ID, {
      knowledgeBaseId,
      text: 'Postgres knowledge persistence works for tenant isolation.',
    });
    expect(ingested.id).toBeTruthy();
    expect(ingested.knowledgeBaseId).toBe(knowledgeBaseId);
    expect(ingested.tenantId).toBe(API_TENANT_ID);
    expect(ingested.chunkIds.length).toBeGreaterThanOrEqual(1);

    const listed = await knowledge.list(API_TENANT_ID, knowledgeBaseId);
    expect(listed.some((doc) => doc.id === ingested.id)).toBe(true);
    expect(listed.every((doc) => doc.knowledgeBaseId === knowledgeBaseId)).toBe(true);

    const retrieved = await knowledge.retrieve(API_TENANT_ID, {
      knowledgeBaseIds: [knowledgeBaseId],
      limit: 5,
      query: 'tenant isolation persistence',
    });
    // Relevance-ranked, and every hit carries a citation for the answer to use.
    expect(retrieved.some((hit) => hit.document.id === ingested.id)).toBe(true);
    const hit = retrieved.find((row) => row.document.id === ingested.id);
    expect(hit?.score).toBeGreaterThan(0);
    expect(hit?.citation.documentId).toBe(ingested.id);
    expect(hit?.citation.excerpt).toContain('Postgres knowledge persistence');

    // A question the corpus does not answer must return no evidence at all.
    const unrelated = await knowledge.retrieve(API_TENANT_ID, {
      knowledgeBaseIds: [knowledgeBaseId],
      query: 'harga tiket konser di stadion',
    });
    expect(unrelated).toEqual([]);
  });

  it('isolates knowledge by tenant under RLS', async () => {
    const knowledge = new PostgresKnowledgeRepository(runtime);
    const cross = await knowledge.list(
      '01890f47-9b3c-7cc2-98e8-000000000099',
      'kb-s2-4-cross',
    );
    expect(cross).toEqual([]);
  });
});
