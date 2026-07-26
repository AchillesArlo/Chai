-- Stage 5: Observability & Metrics
-- Migration 0018: Add observability tables

SET ROLE chai_migration_owner;

-- SLI/SLO tracking
CREATE TABLE chai.service_level_indicator (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  service_name TEXT NOT NULL,
  indicator_name TEXT NOT NULL,
  target_value DECIMAL(5,4) NOT NULL, -- e.g., 0.9995 for 99.95%
  current_value DECIMAL(5,4),
  measurement_window TEXT NOT NULL DEFAULT '30d',
  status TEXT NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'warning', 'breached')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, service_name, indicator_name)
);

CREATE INDEX idx_sli_tenant ON chai.service_level_indicator(tenant_id);

ALTER TABLE chai.service_level_indicator ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.service_level_indicator FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.service_level_indicator
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- Error budget tracking
CREATE TABLE chai.error_budget (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  service_name TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  total_budget_seconds BIGINT NOT NULL,
  consumed_seconds BIGINT NOT NULL DEFAULT 0,
  remaining_seconds BIGINT GENERATED ALWAYS AS (total_budget_seconds - consumed_seconds) STORED,
  burn_rate DECIMAL(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_error_budget_tenant_period ON chai.error_budget(tenant_id, period_start);

ALTER TABLE chai.error_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.error_budget FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.error_budget
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- Incident tracking
CREATE TABLE chai.incident (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  severity TEXT NOT NULL CHECK (severity IN ('P1', 'P2', 'P3', 'P4')),
  status TEXT NOT NULL DEFAULT 'investigating' CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved', 'postmortem')),
  title TEXT NOT NULL,
  description TEXT,
  impact TEXT,
  root_cause TEXT,
  resolution TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  identified_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  -- A generated column must be immutable, so it cannot fall back to now().
  -- NULL until resolved matches the repository, which reports durationSeconds
  -- as null on create and fills it in on resolve.
  duration_seconds INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (resolved_at - started_at))::int
  ) STORED,
  created_by UUID NOT NULL REFERENCES chai.user_account(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incident_tenant_status ON chai.incident(tenant_id, status);
CREATE INDEX idx_incident_severity ON chai.incident(severity);

ALTER TABLE chai.incident ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.incident FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.incident
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- Runbook tracking
CREATE TABLE chai.runbook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  name TEXT NOT NULL,
  description TEXT,
  trigger_condition TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  auto_execute BOOLEAN NOT NULL DEFAULT false,
  last_executed_at TIMESTAMPTZ,
  execution_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_runbook_tenant ON chai.runbook(tenant_id);

ALTER TABLE chai.runbook ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.runbook FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.runbook
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- Runbook execution log
CREATE TABLE chai.runbook_execution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  runbook_id UUID NOT NULL REFERENCES chai.runbook(id),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  -- Immutable generated column; NULL until the execution completes.
  duration_seconds INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (completed_at - started_at))::int
  ) STORED,
  executed_by UUID REFERENCES chai.user_account(id),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_runbook_execution_runbook ON chai.runbook_execution(runbook_id, started_at DESC);

ALTER TABLE chai.runbook_execution ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.runbook_execution FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.runbook_execution
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

RESET ROLE;
