SET ROLE chai_migration_owner;

-- Message Template
CREATE TABLE chai.message_template (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  name text NOT NULL,
  language text NOT NULL DEFAULT 'id',
  category text NOT NULL DEFAULT 'UTILITY'
    CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED')),
  body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX message_template_tenant_status_idx ON chai.message_template(tenant_id, status);
CREATE UNIQUE INDEX message_template_tenant_name_lang_uidx ON chai.message_template(tenant_id, name, language);

ALTER TABLE chai.message_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.message_template FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.message_template
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.message_template FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.message_template TO chai_app_runtime, chai_worker_runtime;

-- Notification
CREATE TABLE chai.notification (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('IN_APP', 'EMAIL', 'PUSH')),
  title text NOT NULL,
  body text NOT NULL,
  channel text,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notification_tenant_user_idx ON chai.notification(tenant_id, user_id, created_at DESC);
CREATE INDEX notification_status_idx ON chai.notification(status);

ALTER TABLE chai.notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.notification FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.notification
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.notification FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.notification TO chai_app_runtime, chai_worker_runtime;

-- Contact Segment
CREATE TABLE chai.contact_segment (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  name text NOT NULL,
  description text,
  filter_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  member_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contact_segment_tenant_idx ON chai.contact_segment(tenant_id);

ALTER TABLE chai.contact_segment ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.contact_segment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.contact_segment
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.contact_segment FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.contact_segment TO chai_app_runtime, chai_worker_runtime;

-- Message Routing Rule
CREATE TABLE chai.message_routing_rule (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  name text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_channel text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX message_routing_rule_tenant_idx ON chai.message_routing_rule(tenant_id, is_active);

ALTER TABLE chai.message_routing_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.message_routing_rule FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.message_routing_rule
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.message_routing_rule FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.message_routing_rule TO chai_app_runtime;

-- Rate Limit Config
CREATE TABLE chai.rate_limit_config (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  endpoint_pattern text NOT NULL,
  max_requests integer NOT NULL DEFAULT 60,
  window_seconds integer NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rate_limit_config_tenant_idx ON chai.rate_limit_config(tenant_id);

ALTER TABLE chai.rate_limit_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.rate_limit_config FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.rate_limit_config
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.rate_limit_config FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.rate_limit_config TO chai_app_runtime;

-- Widget Session
CREATE TABLE chai.widget_session (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  contact_id uuid REFERENCES chai.contact(id),
  conversation_id uuid REFERENCES chai.conversation(id),
  page_url text,
  referrer text,
  user_agent text,
  ip_address text,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'CLOSED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX widget_session_tenant_idx ON chai.widget_session(tenant_id);
CREATE INDEX widget_session_contact_idx ON chai.widget_session(contact_id);

ALTER TABLE chai.widget_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.widget_session FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.widget_session
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.widget_session FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.widget_session TO chai_app_runtime, chai_worker_runtime;

-- Deferred from 0024: chai.campaign.message_template_id could not declare its FK
-- inline because chai.message_template is created in this migration.
ALTER TABLE chai.campaign
  ADD CONSTRAINT campaign_message_template_fk
  FOREIGN KEY (message_template_id) REFERENCES chai.message_template(id);

RESET ROLE;
