SET ROLE chai_migration_owner;

CREATE TABLE chai.follow_up_job (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  conversation_id uuid REFERENCES chai.conversation(id),
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'CLAIMED', 'DONE', 'FAILED')),
  attempt integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX follow_up_job_tenant_due_pending_idx
  ON chai.follow_up_job(tenant_id, due_at)
  WHERE status = 'PENDING';

ALTER TABLE chai.follow_up_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.follow_up_job FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.follow_up_job
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.follow_up_job FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.follow_up_job TO chai_app_runtime, chai_worker_runtime;
GRANT SELECT ON chai.follow_up_job TO chai_analytics_reader;

RESET ROLE;
