-- 0034_outbox.sql
-- GAP-004: Outbox publisher protocol for reliable event publishing

CREATE TABLE IF NOT EXISTS outbox_events (
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
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'published', 'failed', 'expired'
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 5,
  published_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_tenant ON outbox_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox_events(status);
CREATE INDEX IF NOT EXISTS idx_outbox_aggregate ON outbox_events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_outbox_time ON outbox_events(created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_type ON outbox_events(event_type);

CREATE TABLE IF NOT EXISTS event_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  event_types TEXT[] NOT NULL, -- array of event type patterns
  endpoint_url TEXT NOT NULL,
  secret_key VARCHAR(255) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  retry_policy JSONB DEFAULT '{"maxRetries": 3, "backoffMs": 1000}',
  last_delivered_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_tenant ON event_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscription_active ON event_subscriptions(active);
