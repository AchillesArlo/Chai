SET ROLE chai_migration_owner;

-- S5-3: Advanced Analytics & BI
-- Tenant-facing analytics with custom reports and predictive insights

-- Analytics Dashboard Configuration
CREATE TABLE chai.analytics_dashboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  name TEXT NOT NULL,
  description TEXT,
  layout JSONB NOT NULL DEFAULT '[]',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_dashboard_tenant ON chai.analytics_dashboard(tenant_id);

ALTER TABLE chai.analytics_dashboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.analytics_dashboard FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.analytics_dashboard
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- Custom Reports
CREATE TABLE chai.analytics_report (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  name TEXT NOT NULL,
  description TEXT,
  query_config JSONB NOT NULL DEFAULT '{}',
  schedule_cron TEXT,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_report_tenant ON chai.analytics_report(tenant_id);

ALTER TABLE chai.analytics_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.analytics_report FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.analytics_report
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- Report Execution History
CREATE TABLE chai.analytics_report_execution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES chai.analytics_report(id),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  result_summary JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  -- Immutable generated column; NULL until the execution completes.
  duration_ms INTEGER GENERATED ALWAYS AS (
    (EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::int
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_execution_report ON chai.analytics_report_execution(report_id, started_at DESC);

ALTER TABLE chai.analytics_report_execution ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.analytics_report_execution FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.analytics_report_execution
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- Predictive Models
CREATE TABLE chai.predictive_model (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  model_type TEXT NOT NULL CHECK (model_type IN ('churn_prediction', 'revenue_forecast', 'engagement_score')),
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  accuracy DECIMAL(5,4),
  trained_at TIMESTAMPTZ,
  model_config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_predictive_model_tenant ON chai.predictive_model(tenant_id);

ALTER TABLE chai.predictive_model ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.predictive_model FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.predictive_model
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- Prediction Results
CREATE TABLE chai.prediction_result (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES chai.predictive_model(id),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  prediction_value JSONB NOT NULL,
  confidence DECIMAL(5,4),
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prediction_result_model ON chai.prediction_result(model_id, predicted_at DESC);
CREATE INDEX idx_prediction_result_entity ON chai.prediction_result(entity_type, entity_id);

ALTER TABLE chai.prediction_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.prediction_result FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.prediction_result
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- Cohort Analysis
CREATE TABLE chai.cohort_definition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  name TEXT NOT NULL,
  description TEXT,
  criteria JSONB NOT NULL DEFAULT '{}',
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cohort_definition_tenant ON chai.cohort_definition(tenant_id);

ALTER TABLE chai.cohort_definition ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.cohort_definition FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.cohort_definition
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

RESET ROLE;
