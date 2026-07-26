-- Migration 0022: Partner Ecosystem & API Versioning
-- Developer portal, API keys, versioning, and rate limiting

SET ROLE chai_migration_owner;

-- Partner / Developer registration
CREATE TABLE chai.partner (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  name TEXT NOT NULL,
  description TEXT,
  contact_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'suspended', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_partner_tenant ON chai.partner(tenant_id);

ALTER TABLE chai.partner ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.partner FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.partner
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- API Keys for partners
CREATE TABLE chai.api_key (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES chai.partner(id),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_key_partner ON chai.api_key(partner_id);
CREATE INDEX idx_api_key_prefix ON chai.api_key(key_prefix);

ALTER TABLE chai.api_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.api_key FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.api_key
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- API Version registry
CREATE TABLE chai.api_version (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'sunset')),
  release_date DATE NOT NULL,
  sunset_date DATE,
  changelog TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_version_status ON chai.api_version(status);

-- SDK registry
CREATE TABLE chai.sdk_release (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_version_id UUID NOT NULL REFERENCES chai.api_version(id),
  language TEXT NOT NULL CHECK (language IN ('python', 'nodejs', 'go', 'java', 'ruby')),
  version TEXT NOT NULL,
  package_url TEXT NOT NULL,
  repository_url TEXT,
  release_notes TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sdk_release_api_version ON chai.sdk_release(api_version_id);
CREATE INDEX idx_sdk_release_language ON chai.sdk_release(language);

-- Rate limit usage tracking
CREATE TABLE chai.rate_limit_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES chai.api_key(id),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_limit_usage_key ON chai.rate_limit_usage(api_key_id, window_start DESC);

ALTER TABLE chai.rate_limit_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.rate_limit_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.rate_limit_usage
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

RESET ROLE;
