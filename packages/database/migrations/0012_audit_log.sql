SET ROLE chai_migration_owner;

-- Tenant-scoped audit log for tracking all mutations
CREATE TABLE IF NOT EXISTS chai.audit_log (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  actor_id uuid NOT NULL REFERENCES chai.user_account(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS audit_log_tenant_created_idx
  ON chai.audit_log(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_actor_created_idx
  ON chai.audit_log(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_resource_idx
  ON chai.audit_log(resource_type, resource_id);

-- Enable RLS
ALTER TABLE chai.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.audit_log FORCE ROW LEVEL SECURITY;

-- Append-only: insert policy (drop first to avoid duplicate policy error)
DROP POLICY IF EXISTS audit_log_insert ON chai.audit_log;
CREATE POLICY audit_log_insert ON chai.audit_log
  FOR INSERT
  WITH CHECK (
    tenant_id = chai.current_tenant_id()
    AND actor_id = chai.current_principal_id()
  );

-- Read policy: users can read audit logs for their tenant
DROP POLICY IF EXISTS audit_log_select ON chai.audit_log;
CREATE POLICY audit_log_select ON chai.audit_log
  FOR SELECT
  USING (tenant_id = chai.current_tenant_id());

-- No update or delete policies (append-only)

-- Grants
REVOKE ALL ON chai.audit_log FROM PUBLIC;
GRANT INSERT, SELECT ON chai.audit_log TO chai_app_runtime;
GRANT INSERT, SELECT ON chai.audit_log TO chai_worker_runtime;
GRANT SELECT ON chai.audit_log TO chai_analytics_reader;

RESET ROLE;
