SET ROLE chai_migration_owner;

-- SSO/SAML Configuration
CREATE TABLE chai.sso_configuration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  provider TEXT NOT NULL CHECK (provider IN ('saml', 'oidc')),
  entity_id TEXT NOT NULL,
  sso_url TEXT NOT NULL,
  certificate TEXT NOT NULL,
  attribute_mapping JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, provider)
);

CREATE INDEX idx_sso_config_tenant ON chai.sso_configuration(tenant_id);

ALTER TABLE chai.sso_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.sso_configuration FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.sso_configuration
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- SCIM Provisioning
CREATE TABLE chai.scim_configuration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id) UNIQUE,
  base_url TEXT NOT NULL,
  auth_token_hash TEXT NOT NULL,
  user_sync_enabled BOOLEAN NOT NULL DEFAULT true,
  group_sync_enabled BOOLEAN NOT NULL DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scim_config_tenant ON chai.scim_configuration(tenant_id);

ALTER TABLE chai.scim_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.scim_configuration FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.scim_configuration
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- Advanced RBAC: Custom Roles
CREATE TABLE chai.custom_role (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  name TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_custom_role_tenant ON chai.custom_role(tenant_id);

ALTER TABLE chai.custom_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.custom_role FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.custom_role
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- Role Assignments
CREATE TABLE chai.role_assignment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  user_id UUID NOT NULL REFERENCES chai.user_account(id),
  role_id UUID NOT NULL REFERENCES chai.custom_role(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID NOT NULL REFERENCES chai.user_account(id),
  UNIQUE(tenant_id, user_id, role_id)
);

CREATE INDEX idx_role_assignment_tenant_user ON chai.role_assignment(tenant_id, user_id);
CREATE INDEX idx_role_assignment_tenant_role ON chai.role_assignment(tenant_id, role_id);

ALTER TABLE chai.role_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.role_assignment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.role_assignment
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- Audit Log Export Configuration
CREATE TABLE chai.audit_export_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  destination_type TEXT NOT NULL CHECK (destination_type IN ('s3', 'splunk', 'elk', 'webhook')),
  destination_config JSONB NOT NULL DEFAULT '{}',
  filter_criteria JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT false,
  last_export_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_export_config_tenant ON chai.audit_export_config(tenant_id);

ALTER TABLE chai.audit_export_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.audit_export_config FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.audit_export_config
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- Audit Export History
CREATE TABLE chai.audit_export_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  config_id UUID NOT NULL REFERENCES chai.audit_export_config(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  records_exported INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_export_history_tenant ON chai.audit_export_history(tenant_id);
CREATE INDEX idx_audit_export_history_config ON chai.audit_export_history(config_id);

ALTER TABLE chai.audit_export_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.audit_export_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.audit_export_history
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

RESET ROLE;
