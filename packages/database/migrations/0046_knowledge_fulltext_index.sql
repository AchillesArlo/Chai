-- Fase 3 (R-21): knowledge retrieval must rank by relevance, not recency.
--
-- Retrieval previously ordered by `created_at DESC`, so the newest document was
-- returned regardless of whether it answered the question. Blueprint 08_AI §12
-- requires relevance ranking with an evidence threshold, and §13 requires the
-- answer to cite what it used.
--
-- The GIN index makes the full-text predicate usable at scale. `simple` rather
-- than a language configuration on purpose: the corpus is mixed Indonesian and
-- English, and `simple` avoids stemming one language incorrectly with the
-- other's rules. A pgvector hybrid is the upgrade path once embeddings are
-- populated (ADR-012).

SET ROLE chai_migration_owner;

CREATE INDEX IF NOT EXISTS knowledge_document_fulltext_idx
  ON chai.knowledge_document
  USING gin (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
  );

RESET ROLE;
