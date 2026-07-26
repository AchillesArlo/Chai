-- 0033_widget.sql
-- GAP-037: Website widget contract and configuration

CREATE TABLE IF NOT EXISTS widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  widget_type VARCHAR(50) NOT NULL DEFAULT 'chat', -- 'chat', 'contact_form', 'faq', 'hybrid'
  theme JSONB NOT NULL DEFAULT '{}',
  position VARCHAR(50) DEFAULT 'bottom-right', -- 'bottom-right', 'bottom-left', 'top-right', 'top-left'
  language VARCHAR(10) DEFAULT 'id',
  greeting_message TEXT,
  offline_message TEXT,
  business_hours JSONB,
  allowed_origins TEXT[] DEFAULT '{}',
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'inactive', 'maintenance'
  embed_code TEXT,
  analytics_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_widget_tenant ON widgets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_widget_domain ON widgets(domain);
CREATE INDEX IF NOT EXISTS idx_widget_status ON widgets(status);

CREATE TABLE IF NOT EXISTS widget_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id UUID NOT NULL REFERENCES widgets(id),
  tenant_id UUID NOT NULL,
  visitor_id VARCHAR(255),
  contact_id UUID,
  conversation_id UUID,
  ip_address INET,
  user_agent TEXT,
  referrer_url TEXT,
  landing_page TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'ended', 'abandoned'
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_widget_session_widget ON widget_sessions(widget_id);
CREATE INDEX IF NOT EXISTS idx_widget_session_tenant ON widget_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_widget_session_time ON widget_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_widget_session_status ON widget_sessions(status);
