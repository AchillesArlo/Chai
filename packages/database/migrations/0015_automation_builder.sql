SET ROLE chai_migration_owner;

CREATE TABLE chai.automation_flow (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','ACTIVE','ARCHIVED')),
  version int NOT NULL DEFAULT 1,
  definition jsonb NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chai.automation_flow_version (
  id uuid PRIMARY KEY,
  flow_id uuid NOT NULL REFERENCES chai.automation_flow(id),
  version int NOT NULL,
  definition jsonb NOT NULL,
  change_log text,
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chai.automation_simulation (
  id uuid PRIMARY KEY,
  flow_id uuid NOT NULL REFERENCES chai.automation_flow(id),
  version int,
  input jsonb,
  output jsonb,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX automation_flow_tenant_updated_idx
  ON chai.automation_flow (tenant_id, updated_at DESC);
CREATE INDEX automation_flow_version_flow_version_idx
  ON chai.automation_flow_version (flow_id, version DESC);

ALTER TABLE chai.automation_flow ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.automation_flow FORCE ROW LEVEL SECURITY;
ALTER TABLE chai.automation_flow_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.automation_flow_version FORCE ROW LEVEL SECURITY;
ALTER TABLE chai.automation_simulation ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.automation_simulation FORCE ROW LEVEL SECURITY;

CREATE POLICY automation_flow_tenant_isolation ON chai.automation_flow
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());
CREATE POLICY automation_flow_version_tenant_isolation ON chai.automation_flow_version
  USING (flow_id IN (SELECT id FROM chai.automation_flow))
  WITH CHECK (flow_id IN (SELECT id FROM chai.automation_flow));
CREATE POLICY automation_simulation_tenant_isolation ON chai.automation_simulation
  USING (flow_id IN (SELECT id FROM chai.automation_flow))
  WITH CHECK (flow_id IN (SELECT id FROM chai.automation_flow));

REVOKE ALL ON chai.automation_flow FROM PUBLIC;
REVOKE ALL ON chai.automation_flow_version FROM PUBLIC;
REVOKE ALL ON chai.automation_simulation FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.automation_flow TO chai_app_runtime, chai_worker_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.automation_flow_version TO chai_app_runtime, chai_worker_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.automation_simulation TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
