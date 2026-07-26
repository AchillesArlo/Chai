SET ROLE chai_migration_owner;

-- Ticket (customer support)
CREATE TABLE chai.ticket (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  contact_id uuid REFERENCES chai.contact(id),
  conversation_id uuid REFERENCES chai.conversation(id),
  subject text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED')),
  assigned_to uuid,
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  sla_definition_id uuid,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ticket_tenant_status_idx ON chai.ticket(tenant_id, status);
CREATE INDEX ticket_tenant_priority_idx ON chai.ticket(tenant_id, priority);
CREATE INDEX ticket_assigned_to_idx ON chai.ticket(assigned_to);
CREATE INDEX ticket_contact_idx ON chai.ticket(contact_id);

ALTER TABLE chai.ticket ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.ticket FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.ticket
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.ticket FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.ticket TO chai_app_runtime, chai_worker_runtime;

-- Ticket Comment
CREATE TABLE chai.ticket_comment (
  id uuid PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES chai.ticket(id),
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  author_id uuid NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ticket_comment_ticket_idx ON chai.ticket_comment(ticket_id, created_at);

ALTER TABLE chai.ticket_comment ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.ticket_comment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.ticket_comment
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.ticket_comment FROM PUBLIC;
GRANT SELECT, INSERT ON chai.ticket_comment TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
