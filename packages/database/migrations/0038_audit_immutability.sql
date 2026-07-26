-- 0038_audit_immutability.sql
-- GAP-020: Audit immutability enforcement with integrity verification

CREATE TABLE IF NOT EXISTS audit_log_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  actor_type VARCHAR(50) NOT NULL, -- 'user', 'system', 'api_key', 'automation'
  actor_id UUID NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'create', 'update', 'delete', 'read', 'execute'
  previous_state JSONB,
  new_state JSONB,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  correlation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hash VARCHAR(64) NOT NULL, -- SHA-256 hash of entry + previous entry hash
  previous_hash VARCHAR(64) -- hash of previous entry for chain verification
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log_entries(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log_entries(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log_entries(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_hash ON audit_log_entries(hash);

-- Append-only enforcement: prevent updates and deletes
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log entries are immutable and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_prevent_update
  BEFORE UPDATE ON audit_log_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

CREATE TRIGGER audit_log_prevent_delete
  BEFORE DELETE ON audit_log_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- Integrity verification table
CREATE TABLE IF NOT EXISTS audit_integrity_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_by UUID NOT NULL,
  total_entries INTEGER NOT NULL,
  verified_entries INTEGER NOT NULL,
  broken_chains INTEGER NOT NULL DEFAULT 0,
  first_entry_id UUID,
  last_entry_id UUID,
  status VARCHAR(50) NOT NULL, -- 'passed', 'failed', 'partial'
  details JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_integrity_tenant ON audit_integrity_checks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_integrity_time ON audit_integrity_checks(checked_at);
