-- 0031_connector_config.sql
-- GAP-022: Connector configuration and secret ownership

CREATE TABLE IF NOT EXISTS connector_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  connector_type VARCHAR(100) NOT NULL, -- 'whatsapp', 'telegram', 'instagram', 'payment_gateway', 'logistics_provider'
  connector_provider VARCHAR(100) NOT NULL, -- 'twilio', 'meta', 'stripe', 'midtrans', etc.
  name VARCHAR(255) NOT NULL,
  description TEXT,
  config_schema JSONB NOT NULL DEFAULT '{}',
  config_values_encrypted BYTEA, -- encrypted configuration values
  config_hash VARCHAR(64) NOT NULL, -- hash for change detection
  status VARCHAR(50) NOT NULL DEFAULT 'inactive', -- 'active', 'inactive', 'error', 'testing'
  last_tested_at TIMESTAMPTZ,
  last_error TEXT,
  created_by UUID NOT NULL,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connector_tenant ON connector_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_connector_type ON connector_configs(connector_type);
CREATE INDEX IF NOT EXISTS idx_connector_provider ON connector_configs(connector_provider);
CREATE INDEX IF NOT EXISTS idx_connector_status ON connector_configs(status);

CREATE TABLE IF NOT EXISTS connector_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_config_id UUID NOT NULL REFERENCES connector_configs(id) ON DELETE CASCADE,
  secret_key VARCHAR(255) NOT NULL, -- 'api_key', 'webhook_secret', 'auth_token', etc.
  secret_value_encrypted BYTEA NOT NULL,
  secret_version INTEGER NOT NULL DEFAULT 1,
  rotated_at TIMESTAMPTZ,
  rotated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(connector_config_id, secret_key, secret_version)
);

CREATE INDEX IF NOT EXISTS idx_connector_secrets_config ON connector_secrets(connector_config_id);
