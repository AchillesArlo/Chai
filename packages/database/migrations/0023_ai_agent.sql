SET ROLE chai_migration_owner;

-- AI Agent Profile
CREATE TABLE chai.agent_profile (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  name text NOT NULL,
  use_case text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED')),
  tone text,
  language text NOT NULL DEFAULT 'id',
  business_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  handover_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_profile_tenant_status_idx ON chai.agent_profile(tenant_id, status);

ALTER TABLE chai.agent_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.agent_profile FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.agent_profile
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.agent_profile FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.agent_profile TO chai_app_runtime, chai_worker_runtime;

-- AI Agent Session
CREATE TABLE chai.agent_session (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  agent_profile_id uuid NOT NULL REFERENCES chai.agent_profile(id),
  conversation_id uuid NOT NULL REFERENCES chai.conversation(id),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'COMPLETED', 'FAILED', 'HANDOVER')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  messages_count integer NOT NULL DEFAULT 0,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_session_tenant_status_idx ON chai.agent_session(tenant_id, status);
CREATE INDEX agent_session_agent_idx ON chai.agent_session(agent_profile_id);
CREATE INDEX agent_session_conversation_idx ON chai.agent_session(conversation_id);

ALTER TABLE chai.agent_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.agent_session FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.agent_session
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.agent_session FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.agent_session TO chai_app_runtime, chai_worker_runtime;

-- Tool Policy (AI tool permissions)
CREATE TABLE chai.tool_policy (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  agent_profile_id uuid REFERENCES chai.agent_profile(id),
  tool_name text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tool_policy_tenant_agent_idx ON chai.tool_policy(tenant_id, agent_profile_id);
CREATE UNIQUE INDEX tool_policy_tenant_agent_tool_uidx ON chai.tool_policy(tenant_id, COALESCE(agent_profile_id, '00000000-0000-0000-0000-000000000000'::uuid), tool_name);

ALTER TABLE chai.tool_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.tool_policy FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.tool_policy
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.tool_policy FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.tool_policy TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
