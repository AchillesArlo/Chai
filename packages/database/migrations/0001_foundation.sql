DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chai_migration_owner') THEN
    CREATE ROLE chai_migration_owner NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chai_app_runtime') THEN
    CREATE ROLE chai_app_runtime NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chai_worker_runtime') THEN
    CREATE ROLE chai_worker_runtime NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chai_analytics_reader') THEN
    CREATE ROLE chai_analytics_reader NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

GRANT chai_migration_owner TO CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS chai AUTHORIZATION chai_migration_owner;
REVOKE ALL ON SCHEMA chai FROM PUBLIC;

SET ROLE chai_migration_owner;

CREATE FUNCTION chai.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE FUNCTION chai.current_principal_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.principal_id', true), '')::uuid
$$;

CREATE TABLE chai.tenant (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'SUSPENDED', 'DELETION_REQUESTED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chai.user_account (
  id uuid PRIMARY KEY,
  external_subject text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DISABLED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chai.membership (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  user_id uuid NOT NULL REFERENCES chai.user_account(id),
  role text NOT NULL CHECK (
    role IN (
      'CLIENT_OWNER',
      'CLIENT_ADMIN',
      'CLIENT_MANAGER',
      'CLIENT_AGENT',
      'CLIENT_ANALYST',
      'CLIENT_VIEWER'
    )
  ),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX membership_user_idx ON chai.membership(user_id);

CREATE TABLE chai.entitlement (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  capability_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, capability_key)
);

CREATE TABLE chai.audit_log (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  actor_id uuid NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  reason text,
  correlation_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX audit_log_tenant_created_idx
  ON chai.audit_log(tenant_id, created_at DESC);

CREATE TABLE chai.inbox_event (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  provider text NOT NULL,
  provider_account_id uuid NOT NULL,
  external_event_id text NOT NULL,
  payload_reference text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'RETRY', 'DEAD_LETTER', 'QUARANTINED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  processed_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, provider, provider_account_id, external_event_id)
);

CREATE INDEX inbox_event_dispatch_idx
  ON chai.inbox_event(status, available_at)
  WHERE status IN ('PENDING', 'RETRY');

CREATE TABLE chai.outbox_event (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  event_type text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  aggregate_version integer NOT NULL CHECK (aggregate_version >= 0),
  partition_key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'RETRY', 'DEAD_LETTER')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX outbox_event_dispatch_idx
  ON chai.outbox_event(status, available_at)
  WHERE status IN ('PENDING', 'RETRY');

CREATE TABLE chai.operation_execution (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  operation_type text NOT NULL,
  status text NOT NULL CHECK (
    status IN (
      'PROCESSING',
      'SUCCEEDED',
      'FAILED_RETRYABLE',
      'FAILED_FINAL',
      'UNKNOWN_RESULT'
    )
  ),
  provider_reference text,
  response_reference text,
  reconciled_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE chai.idempotency_record (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  audience text NOT NULL,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL CHECK (
    status IN (
      'PROCESSING',
      'SUCCEEDED',
      'FAILED_RETRYABLE',
      'FAILED_FINAL',
      'UNKNOWN_RESULT'
    )
  ),
  operation_id uuid NOT NULL,
  response_reference text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, audience, operation, idempotency_key),
  FOREIGN KEY (tenant_id, operation_id)
    REFERENCES chai.operation_execution(tenant_id, id)
);

CREATE INDEX idempotency_expiry_idx
  ON chai.idempotency_record(expires_at);

ALTER TABLE chai.tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.tenant FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.tenant
  USING (id = chai.current_tenant_id())
  WITH CHECK (id = chai.current_tenant_id());

ALTER TABLE chai.user_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.user_account FORCE ROW LEVEL SECURITY;
CREATE POLICY principal_isolation ON chai.user_account
  USING (id = chai.current_principal_id())
  WITH CHECK (id = chai.current_principal_id());

ALTER TABLE chai.membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.membership FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.membership
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

ALTER TABLE chai.entitlement ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.entitlement FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.entitlement
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

ALTER TABLE chai.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.audit_log
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

ALTER TABLE chai.inbox_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.inbox_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.inbox_event
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

ALTER TABLE chai.outbox_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.outbox_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.outbox_event
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

ALTER TABLE chai.operation_execution ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.operation_execution FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.operation_execution
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

ALTER TABLE chai.idempotency_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.idempotency_record FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.idempotency_record
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON ALL TABLES IN SCHEMA chai FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA chai FROM PUBLIC;

GRANT USAGE ON SCHEMA chai TO chai_app_runtime, chai_worker_runtime;
GRANT EXECUTE ON FUNCTION chai.current_tenant_id() TO chai_app_runtime, chai_worker_runtime;
GRANT EXECUTE ON FUNCTION chai.current_principal_id() TO chai_app_runtime, chai_worker_runtime;

GRANT SELECT, UPDATE ON chai.tenant TO chai_app_runtime;
GRANT SELECT ON chai.user_account TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON chai.membership TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON chai.entitlement TO chai_app_runtime;
GRANT SELECT, INSERT ON chai.audit_log TO chai_app_runtime, chai_worker_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.inbox_event TO chai_app_runtime, chai_worker_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.outbox_event TO chai_app_runtime, chai_worker_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.operation_execution TO chai_app_runtime, chai_worker_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.idempotency_record TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
