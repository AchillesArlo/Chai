SET ROLE chai_migration_owner;

-- ── Webhook Subscription ─────────────────────────────────────────────────────
-- Tenant-owned webhook endpoints that receive platform events.
-- Each subscription targets a URL, lists the events it cares about, and
-- carries a signing secret so the receiver can verify authenticity.

CREATE TABLE chai.webhook_subscription (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  url text NOT NULL,
  description text,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ["order.created","payment.completed",...]
  signing_secret text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'PAUSED', 'DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX webhook_subscription_tenant_status_idx
  ON chai.webhook_subscription(tenant_id, status);

ALTER TABLE chai.webhook_subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.webhook_subscription FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.webhook_subscription
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.webhook_subscription FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON chai.webhook_subscription TO chai_app_runtime, chai_worker_runtime;

-- ── Webhook Delivery Log ─────────────────────────────────────────────────────
-- Immutable audit trail of every delivery attempt.

CREATE TABLE chai.webhook_delivery (
  id uuid PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES chai.webhook_subscription(id),
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  response_status integer,
  response_body text,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'DELIVERED', 'FAILED', 'RETRYING')),
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX webhook_delivery_subscription_idx
  ON chai.webhook_delivery(subscription_id, created_at DESC);
CREATE INDEX webhook_delivery_tenant_idx
  ON chai.webhook_delivery(tenant_id, created_at DESC);

ALTER TABLE chai.webhook_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.webhook_delivery FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.webhook_delivery
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.webhook_delivery FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.webhook_delivery TO chai_app_runtime, chai_worker_runtime;

-- ── Marketplace Listing ──────────────────────────────────────────────────────
-- Public catalog of connectors / integrations that tenants can install.

CREATE TABLE chai.marketplace_listing (
  id uuid PRIMARY KEY,
  provider_id text NOT NULL,                -- e.g. "midtrans", "jne", "whatsapp-cloud"
  name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'connector'
    CHECK (category IN ('connector', 'automation', 'analytics', 'channel')),
  icon_url text,
  documentation_url text,
  config_schema jsonb NOT NULL DEFAULT '{}'::jsonb,  -- JSON Schema for tenant config
  version text NOT NULL DEFAULT '1.0.0',
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX marketplace_listing_provider_uidx
  ON chai.marketplace_listing(provider_id);
CREATE INDEX marketplace_listing_category_idx
  ON chai.marketplace_listing(category);

ALTER TABLE chai.marketplace_listing ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.marketplace_listing FORCE ROW LEVEL SECURITY;
-- Marketplace listings are readable by all authenticated users (cross-tenant catalog).
CREATE POLICY marketplace_listing_read ON chai.marketplace_listing
  FOR SELECT USING (true);
CREATE POLICY marketplace_listing_write ON chai.marketplace_listing
  FOR INSERT WITH CHECK (true);
CREATE POLICY marketplace_listing_update ON chai.marketplace_listing
  FOR UPDATE USING (true) WITH CHECK (true);

REVOKE ALL ON chai.marketplace_listing FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.marketplace_listing TO chai_app_runtime;

-- ── Tenant Marketplace Installation ──────────────────────────────────────────
-- Tracks which marketplace listings a tenant has installed / activated.

CREATE TABLE chai.marketplace_installation (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  listing_id uuid NOT NULL REFERENCES chai.marketplace_listing(id),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'UNINSTALLED')),
  installed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX marketplace_installation_tenant_listing_uidx
  ON chai.marketplace_installation(tenant_id, listing_id);
CREATE INDEX marketplace_installation_tenant_status_idx
  ON chai.marketplace_installation(tenant_id, status);

ALTER TABLE chai.marketplace_installation ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.marketplace_installation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.marketplace_installation
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.marketplace_installation FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.marketplace_installation TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
