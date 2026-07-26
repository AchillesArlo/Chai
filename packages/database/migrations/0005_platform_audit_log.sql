SET ROLE chai_migration_owner;

CREATE TABLE chai.platform_audit_log (
  id uuid PRIMARY KEY,
  actor_type text NOT NULL CONSTRAINT platform_audit_log_actor_type_valid
    CHECK (actor_type IN ('USER', 'SERVICE')),
  actor_id uuid NOT NULL,
  session_reference text,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  risk text NOT NULL CONSTRAINT platform_audit_log_risk_valid
    CHECK (risk IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  before_after_reference text,
  reason text,
  source_ip inet,
  device text,
  correlation_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX platform_audit_log_occurred_idx
  ON chai.platform_audit_log(occurred_at DESC);

ALTER TABLE chai.platform_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.platform_audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_audit_insert ON chai.platform_audit_log
  FOR INSERT
  WITH CHECK (actor_id = chai.current_principal_id());

REVOKE ALL ON chai.platform_audit_log FROM PUBLIC;
GRANT INSERT ON chai.platform_audit_log TO chai_app_runtime;

RESET ROLE;
