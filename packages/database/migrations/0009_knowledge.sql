SET ROLE chai_migration_owner;

CREATE TABLE chai.knowledge_document (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  knowledge_base_id text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'READY'
    CHECK (status IN ('INGESTING', 'READY', 'FAILED')),
  tags text[] NOT NULL DEFAULT '{}',
  chunk_ids text[] NOT NULL DEFAULT '{}',
  embedding jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX knowledge_document_tenant_created_idx
  ON chai.knowledge_document(tenant_id, created_at DESC);
CREATE INDEX knowledge_document_tenant_kb_idx
  ON chai.knowledge_document(tenant_id, knowledge_base_id);

ALTER TABLE chai.knowledge_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.knowledge_document FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.knowledge_document
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.knowledge_document FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.knowledge_document TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
