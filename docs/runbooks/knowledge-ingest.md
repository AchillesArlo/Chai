# Runbook — Knowledge Ingest

**Severity:** medium (search quality degradation, not a live outage)
**Owner:** knowledge on-call

## Overview

`chai.knowledge_document` stores tenant-scoped docs for retrieval-augmented
chat. A doc moves through `status`:

- `INGESTING` — chunking/embedding in progress (transitional; the current mock
  adapter inserts straight to READY, real embedder will use this state).
- `READY` — searchable; `chunk_ids` populated.
- `FAILED` — ingest threw; `last_error`-equivalent is in app logs (no error
  column on this table — check worker logs, not the row).

Columns that matter for ops: `id`, `tenant_id`, `knowledge_base_id`, `title`,
`status`, `chunk_ids`, `embedding`, `created_at`, `updated_at`.

## Failure modes

- **Stuck INGESTING** — embedder hung or worker died mid-ingest. Row never
  reaches READY; search excludes it. No background sweeper exists yet.
- **FAILED doc** — ingest threw on chunking/embedding. Doc is invisible to
  retrieval; re-ingest required after fixing root cause.
- **Stale search results** — `READY` doc with empty `chunk_ids` (ingest wrote
  the row but never the chunks), or `embedding` NULL. Search returns the doc
  but retrieval scores are wrong.
- **Wrong tenant / kb** — doc landed under the wrong `knowledge_base_id`;
  search misses it entirely. Check `tenant_id` + `knowledge_base_id` first.

## Triage commands

```sql
-- Doc counts by status (all tenants)
SELECT status, count(*) AS n
FROM chai.knowledge_document
GROUP BY status
ORDER BY n DESC;

-- Stuck INGESTING (no sweeper; these need manual reset)
SELECT id, tenant_id, knowledge_base_id, title,
       now() - updated_at AS stuck_for
FROM chai.knowledge_document
WHERE status = 'INGESTING'
ORDER BY updated_at
LIMIT 50;

-- Recent FAILED docs
SELECT id, tenant_id, knowledge_base_id, title, updated_at
FROM chai.knowledge_document
WHERE status = 'FAILED'
ORDER BY updated_at DESC
LIMIT 50;

-- READY but malformed (empty chunk_ids or NULL embedding — search risk)
SELECT id, tenant_id, knowledge_base_id, title,
       cardinality(chunk_ids) AS chunk_count,
       embedding IS NULL AS no_embedding
FROM chai.knowledge_document
WHERE status = 'READY'
  AND (cardinality(chunk_ids) = 0 OR embedding IS NULL)
ORDER BY updated_at DESC
LIMIT 50;
```

## Recovery

### Reset stuck INGESTING → re-ingest

```sql
UPDATE chai.knowledge_document
SET status = 'FAILED', updated_at = now()
WHERE id = '<doc-uuid>' AND status = 'INGESTING';
```

Then trigger a re-ingest through the API (`POST` to the knowledge ingest
endpoint with the same `knowledge_base_id` + `text`), which inserts a fresh
READY row. Do not flip directly to READY — the chunks/embedding were never
written.

### Retry FAILED doc

Same path: leave the FAILED row for audit, re-ingest via the API to get a new
READY doc. Delete the FAILED row only if it confuses the listing UI:

```sql
DELETE FROM chai.knowledge_document
WHERE id = '<doc-uuid>' AND status = 'FAILED';
```

### Fix READY-but-malformed

Demote to FAILED and re-ingest so chunks/embedding repopulate:

```sql
UPDATE chai.knowledge_document
SET status = 'FAILED', updated_at = now()
WHERE id = '<doc-uuid>'
  AND status = 'READY'
  AND (cardinality(chunk_ids) = 0 OR embedding IS NULL);
```

## SLO

Ingest latency: `created_at` → `updated_at` for a doc reaching READY.
Target p95 < 30s once the real embedder lands. `# ponytail:` SLO numbers
pending the real embedding adapter (S2-3 wiring); the mock adapter writes
synchronously so latencies are meaningless until then.

## Abort / escalate

- If FAILED docs cluster around one `knowledge_base_id` or one tenant, suspect
  a payload/content issue before infrastructure. Inspect `title` + `source`.
- If `READY` docs are widespread-malformed, the embedder is dropping writes —
  page the S2-3 owner and stop new ingest until `chunk_ids`/`embedding` are
  confirmed populating.

## Evidence

Record: incident time, tenant, `knowledge_base_id`, doc IDs touched, counts by
status before/after, embedder adapter in use (mock vs real).
