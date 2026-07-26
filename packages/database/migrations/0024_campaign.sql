SET ROLE chai_migration_owner;

-- Campaign
CREATE TABLE chai.campaign (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('BROADCAST', 'SCHEDULED', 'SEGMENTED')),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED')),
  channel text NOT NULL,
  -- FK added in 0028 once chai.message_template exists; declaring it here would
  -- reference a table that does not exist yet at this point in the chain.
  message_template_id uuid,
  target_segment jsonb,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  metrics jsonb NOT NULL DEFAULT '{"sent":0,"delivered":0,"read":0,"failed":0}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX campaign_tenant_status_idx ON chai.campaign(tenant_id, status);
CREATE INDEX campaign_scheduled_at_idx ON chai.campaign(scheduled_at);

ALTER TABLE chai.campaign ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.campaign FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.campaign
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.campaign FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.campaign TO chai_app_runtime, chai_worker_runtime;

-- Campaign Message (tracking individual messages in a campaign)
CREATE TABLE chai.campaign_message (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES chai.campaign(id),
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  contact_id uuid NOT NULL REFERENCES chai.contact(id),
  message_id uuid REFERENCES chai.message(id),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX campaign_message_campaign_idx ON chai.campaign_message(campaign_id);
CREATE INDEX campaign_message_contact_idx ON chai.campaign_message(contact_id);
CREATE INDEX campaign_message_status_idx ON chai.campaign_message(status);

ALTER TABLE chai.campaign_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.campaign_message FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.campaign_message
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.campaign_message FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.campaign_message TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
