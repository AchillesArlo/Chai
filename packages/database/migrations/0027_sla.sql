SET ROLE chai_migration_owner;

-- SLA Definition
CREATE TABLE chai.sla_definition (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  name text NOT NULL,
  first_response_minutes integer NOT NULL,
  resolution_minutes integer NOT NULL,
  business_hours_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sla_definition_tenant_idx ON chai.sla_definition(tenant_id);

ALTER TABLE chai.sla_definition ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.sla_definition FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.sla_definition
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.sla_definition FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.sla_definition TO chai_app_runtime;

-- SLA Breach tracking
CREATE TABLE chai.sla_breach (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  sla_definition_id uuid NOT NULL REFERENCES chai.sla_definition(id),
  ticket_id uuid NOT NULL REFERENCES chai.ticket(id),
  breach_type text NOT NULL CHECK (breach_type IN ('FIRST_RESPONSE', 'RESOLUTION')),
  breached_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sla_breach_tenant_idx ON chai.sla_breach(tenant_id);
CREATE INDEX sla_breach_ticket_idx ON chai.sla_breach(ticket_id);

ALTER TABLE chai.sla_breach ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.sla_breach FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.sla_breach
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.sla_breach FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.sla_breach TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
