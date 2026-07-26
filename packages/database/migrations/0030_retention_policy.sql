-- 0030_retention_policy.sql
-- GAP-019: Data retention policy enforcement

CREATE TABLE IF NOT EXISTS retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  data_class VARCHAR(100) NOT NULL, -- 'conversations', 'messages', 'attachments', 'audit_logs', 'analytics', 'quarantine'
  retention_days INTEGER NOT NULL,
  deletion_method VARCHAR(50) NOT NULL DEFAULT 'soft_delete', -- 'soft_delete', 'hard_delete', 'archive'
  cascade_delete BOOLEAN DEFAULT FALSE,
  exceptions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, data_class)
);

CREATE INDEX IF NOT EXISTS idx_retention_tenant ON retention_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_retention_class ON retention_policies(data_class);

CREATE TABLE IF NOT EXISTS retention_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  data_class VARCHAR(100) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  records_processed INTEGER DEFAULT 0,
  records_deleted INTEGER DEFAULT 0,
  records_archived INTEGER DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retention_jobs_tenant ON retention_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_retention_jobs_status ON retention_jobs(status);
CREATE INDEX IF NOT EXISTS idx_retention_jobs_time ON retention_jobs(started_at);
