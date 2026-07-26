SET ROLE chai_migration_owner;

CREATE TABLE chai.contact (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'MERGED', 'BLOCKED', 'ARCHIVED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX contact_tenant_status_idx ON chai.contact(tenant_id, status);

CREATE TABLE chai.contact_identity (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  contact_id uuid NOT NULL REFERENCES chai.contact(id),
  channel_account_id uuid NOT NULL,
  external_user_id text NOT NULL,
  address_normalized text,
  display_handle text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, channel_account_id, external_user_id)
);

CREATE INDEX contact_identity_contact_idx
  ON chai.contact_identity(tenant_id, contact_id);

CREATE TABLE chai.conversation (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  contact_id uuid NOT NULL REFERENCES chai.contact(id),
  channel_account_id uuid NOT NULL,
  external_thread_id text,
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'PENDING_AGENT', 'RESOLVED', 'CLOSED')),
  mode text NOT NULL DEFAULT 'AI_ACTIVE'
    CHECK (mode IN ('AI_ACTIVE', 'HUMAN_ACTIVE', 'PAUSED')),
  priority text NOT NULL DEFAULT 'NORMAL'
    CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  assignee_user_id uuid,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX conversation_tenant_status_last_idx
  ON chai.conversation(tenant_id, status, last_message_at DESC);
CREATE INDEX conversation_tenant_contact_idx
  ON chai.conversation(tenant_id, contact_id);

CREATE TABLE chai.message (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  conversation_id uuid NOT NULL REFERENCES chai.conversation(id),
  external_message_id text,
  direction text NOT NULL
    CHECK (direction IN ('INBOUND', 'OUTBOUND', 'INTERNAL')),
  sender_type text NOT NULL
    CHECK (sender_type IN ('CUSTOMER', 'AI', 'HUMAN', 'SYSTEM')),
  content_type text NOT NULL DEFAULT 'TEXT'
    CHECK (content_type IN ('TEXT', 'MEDIA', 'TEMPLATE', 'SYSTEM')),
  text_content text,
  provider_timestamp timestamptz,
  received_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, conversation_id, external_message_id)
);

CREATE INDEX message_conversation_idx
  ON chai.message(tenant_id, conversation_id, created_at);

ALTER TABLE chai.contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.contact FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.contact
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

ALTER TABLE chai.contact_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.contact_identity FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.contact_identity
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

ALTER TABLE chai.conversation ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.conversation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.conversation
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

ALTER TABLE chai.message ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.message FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.message
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.contact, chai.contact_identity, chai.conversation, chai.message FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.contact TO chai_app_runtime, chai_worker_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.contact_identity TO chai_app_runtime, chai_worker_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.conversation TO chai_app_runtime, chai_worker_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.message TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
