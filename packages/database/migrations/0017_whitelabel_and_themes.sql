SET ROLE chai_migration_owner;

-- ── Custom Domain ────────────────────────────────────────────────────────────
-- Tenant-owned custom domains for white-label client portals.

CREATE TABLE chai.custom_domain (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  domain text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'VERIFIED', 'ACTIVE', 'SUSPENDED')),
  ssl_status text NOT NULL DEFAULT 'PENDING'
    CHECK (ssl_status IN ('PENDING', 'PROVISIONING', 'ACTIVE', 'FAILED')),
  verification_token text NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX custom_domain_tenant_idx
  ON chai.custom_domain(tenant_id);
CREATE INDEX custom_domain_status_idx
  ON chai.custom_domain(status);

ALTER TABLE chai.custom_domain ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.custom_domain FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.custom_domain
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.custom_domain FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON chai.custom_domain TO chai_app_runtime;

-- ── Theme Settings ───────────────────────────────────────────────────────────
-- White-label theme configuration per tenant.

CREATE TABLE chai.theme_settings (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id) UNIQUE,
  brand_name text NOT NULL,
  logo_url text,
  favicon_url text,
  primary_color text NOT NULL DEFAULT '#3B82F6',
  secondary_color text NOT NULL DEFAULT '#10B981',
  accent_color text NOT NULL DEFAULT '#F59E0B',
  font_family text NOT NULL DEFAULT 'Inter, system-ui, sans-serif',
  custom_css text,
  header_html text,
  footer_html text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX theme_settings_tenant_idx
  ON chai.theme_settings(tenant_id);

ALTER TABLE chai.theme_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.theme_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.theme_settings
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.theme_settings FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.theme_settings TO chai_app_runtime;

RESET ROLE;
