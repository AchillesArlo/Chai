SET ROLE chai_migration_owner;

CREATE TABLE chai.lead (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  contact_id uuid NOT NULL REFERENCES chai.contact(id),
  source text NOT NULL,
  stage text NOT NULL DEFAULT 'NEW'
    CHECK (stage IN ('NEW', 'CONTACTED', 'QUALIFIED', 'BOOKED', 'LOST', 'WON')),
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'CONVERTED', 'LOST', 'ARCHIVED')),
  score integer NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  owner_user_id uuid,
  next_action_at timestamptz,
  next_action_type text,
  converted_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX lead_tenant_stage_idx ON chai.lead(tenant_id, stage);
CREATE INDEX lead_tenant_owner_idx ON chai.lead(tenant_id, owner_user_id);

CREATE TABLE chai.appointment (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  contact_id uuid NOT NULL REFERENCES chai.contact(id),
  lead_id uuid REFERENCES chai.lead(id),
  resource_id text NOT NULL,
  status text NOT NULL DEFAULT 'CONFIRMED'
    CHECK (status IN ('CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  title text NOT NULL,
  idempotency_key text NOT NULL,
  rescheduled_from uuid REFERENCES chai.appointment(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, resource_id, starts_at, idempotency_key)
);

CREATE INDEX appointment_tenant_start_idx
  ON chai.appointment(tenant_id, resource_id, starts_at);
CREATE INDEX appointment_contact_idx
  ON chai.appointment(tenant_id, contact_id);

ALTER TABLE chai.lead ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.lead FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.lead
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

ALTER TABLE chai.appointment ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.appointment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.appointment
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.lead, chai.appointment FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.lead TO chai_app_runtime, chai_worker_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.appointment TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
