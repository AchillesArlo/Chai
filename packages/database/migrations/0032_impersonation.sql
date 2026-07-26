-- 0032_impersonation.sql
-- GAP-023: Support impersonation with audit trail

CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  impersonator_id UUID NOT NULL, -- support agent
  impersonated_user_id UUID NOT NULL, -- user being impersonated
  reason TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'ended', 'expired', 'revoked'
  ip_address INET,
  user_agent TEXT,
  max_duration_minutes INTEGER DEFAULT 60,
  requires_approval BOOLEAN DEFAULT TRUE,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_impersonation_tenant ON impersonation_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_impersonator ON impersonation_sessions(impersonator_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_impersonated ON impersonation_sessions(impersonated_user_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_status ON impersonation_sessions(status);
CREATE INDEX IF NOT EXISTS idx_impersonation_time ON impersonation_sessions(started_at);

CREATE TABLE IF NOT EXISTS impersonation_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  impersonation_session_id UUID NOT NULL REFERENCES impersonation_sessions(id),
  action VARCHAR(100) NOT NULL, -- 'view_profile', 'update_profile', 'send_message', etc.
  resource_type VARCHAR(100),
  resource_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_impersonation_audit_session ON impersonation_audit_log(impersonation_session_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_audit_time ON impersonation_audit_log(created_at);
