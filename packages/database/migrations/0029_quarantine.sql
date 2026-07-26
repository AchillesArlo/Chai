-- 0029_quarantine.sql
-- GAP-014: Raw webhook quarantine with redaction and restricted access

CREATE TABLE IF NOT EXISTS quarantine_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  source_type VARCHAR(50) NOT NULL, -- 'webhook', 'provider_event', 'unknown_payload'
  source_identifier VARCHAR(255),
  raw_payload JSONB NOT NULL,
  redacted_payload JSONB,
  redaction_order JSONB,
  reason VARCHAR(255) NOT NULL, -- 'prohibited_data', 'unknown_tenant', 'validation_failed', 'suspicious_content'
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'reviewed', 'released', 'rejected', 'expired'
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  retention_until TIMESTAMPTZ NOT NULL,
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quarantine_tenant ON quarantine_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quarantine_status ON quarantine_entries(status);
CREATE INDEX IF NOT EXISTS idx_quarantine_retention ON quarantine_entries(retention_until);
CREATE INDEX IF NOT EXISTS idx_quarantine_source ON quarantine_entries(source_type, source_identifier);

-- Audit log for quarantine access (append-only, restricted)
CREATE TABLE IF NOT EXISTS quarantine_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quarantine_entry_id UUID NOT NULL REFERENCES quarantine_entries(id),
  accessed_by UUID NOT NULL,
  access_type VARCHAR(50) NOT NULL, -- 'view', 'release', 'reject', 'export'
  ip_address INET,
  user_agent TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quarantine_access_entry ON quarantine_access_log(quarantine_entry_id);
CREATE INDEX IF NOT EXISTS idx_quarantine_access_time ON quarantine_access_log(created_at);
