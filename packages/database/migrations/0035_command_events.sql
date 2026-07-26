-- 0035_command_events.sql
-- GAP-008: Command and event lifecycle schemas

CREATE TABLE IF NOT EXISTS commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  command_type VARCHAR(255) NOT NULL,
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  correlation_id UUID,
  causation_id UUID,
  idempotency_key VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'cancelled'
  deadline TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_command_tenant ON commands(tenant_id);
CREATE INDEX IF NOT EXISTS idx_command_type ON commands(command_type);
CREATE INDEX IF NOT EXISTS idx_command_aggregate ON commands(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_command_status ON commands(status);
CREATE INDEX IF NOT EXISTS idx_command_idempotency ON commands(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_command_time ON commands(created_at);

CREATE TABLE IF NOT EXISTS domain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id UUID NOT NULL,
  aggregate_version INTEGER NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  correlation_id UUID,
  causation_id UUID,
  command_id UUID REFERENCES commands(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domain_event_tenant ON domain_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_domain_event_type ON domain_events(event_type);
CREATE INDEX IF NOT EXISTS idx_domain_event_aggregate ON domain_events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_domain_event_version ON domain_events(aggregate_type, aggregate_id, aggregate_version);
CREATE INDEX IF NOT EXISTS idx_domain_event_time ON domain_events(created_at);
CREATE INDEX IF NOT EXISTS idx_domain_event_command ON domain_events(command_id);
