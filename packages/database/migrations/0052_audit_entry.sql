-- 0052: persistent, tenant-isolated, append-only audit trail (D1).
--
-- WHY THIS EXISTS
-- The audit-immutability module persisted its hash-chained entries in a per-
-- process Map, so "immutable audit" was lost on every restart, diverged across
-- the three API replicas, and never touched RLS. Migration 0038 did create
-- `public.audit_log_entries`, but in the wrong schema, with a bare `tenant_id`
-- carrying no FK to chai.tenant, and outside the chai grant/ownership regime
-- (0040 later bolted RLS onto it as a stopgap). Rather than edit an immutable,
-- checksum-pinned migration, this adds the canonical table in `chai`, matching
-- every platform invariant (README "Invarian", 05_DATA_MODEL §14, ADR-004):
-- tenant_id REFERENCES chai.tenant, ENABLE + FORCE RLS with a default-deny
-- tenant policy, ownership by chai_migration_owner, least-privilege grants.
--
-- APPEND-ONLY IS ENFORCED, NOT ASSUMED
-- The runtime roles get SELECT + INSERT only (no UPDATE/DELETE grant), and a
-- BEFORE UPDATE/DELETE trigger raises unconditionally. The trigger is the
-- load-bearing guarantee: triggers fire even for the table owner and for a
-- superuser, so an audit row cannot be rewritten or erased by anyone on any
-- connection path -- exactly what "audit di memori melanggar semangat
-- immutability" demands.

SET ROLE chai_migration_owner;

CREATE TABLE chai.audit_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Monotonic per-cluster ordering. The hash chain is ordered by seq (not
  -- created_at, which can tie at millisecond precision), so verification is
  -- deterministic within a tenant.
  seq bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  event_type text NOT NULL,
  actor_type text NOT NULL
    CHECK (actor_type IN ('user', 'system', 'api_key', 'automation')),
  -- actor_id / resource_id / correlation_id / ip_address are free-form strings
  -- in the module contract (actor 'system-1', resource 'user-123'), so they are
  -- text, not uuid/inet: the DTO validates them as @IsString, not as ids.
  actor_id text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  action text NOT NULL
    CHECK (action IN ('create', 'update', 'delete', 'read', 'execute')),
  previous_state jsonb,
  new_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  correlation_id text,
  -- SHA-256 hex of the canonicalized entry plus the previous entry's hash.
  hash text NOT NULL,
  previous_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX audit_entry_tenant_seq_idx ON chai.audit_entry(tenant_id, seq);
CREATE INDEX audit_entry_tenant_resource_idx
  ON chai.audit_entry(tenant_id, resource_type, resource_id);
CREATE INDEX audit_entry_tenant_event_idx
  ON chai.audit_entry(tenant_id, event_type);

ALTER TABLE chai.audit_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.audit_entry FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.audit_entry
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- Append-only: reject any attempt to mutate or remove a recorded entry. This is
-- enforcement, not convention -- it fires regardless of role or granted
-- privilege, including for the table owner and a superuser.
CREATE FUNCTION chai.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'chai.audit_entry is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER audit_entry_no_update
  BEFORE UPDATE ON chai.audit_entry
  FOR EACH ROW EXECUTE FUNCTION chai.reject_audit_mutation();

CREATE TRIGGER audit_entry_no_delete
  BEFORE DELETE ON chai.audit_entry
  FOR EACH ROW EXECUTE FUNCTION chai.reject_audit_mutation();

REVOKE ALL ON chai.audit_entry FROM PUBLIC;
-- Least privilege: append + read only. No UPDATE/DELETE grant, and the trigger
-- above is the belt to that suspenders. Both the API and workers emit audit.
GRANT SELECT, INSERT ON chai.audit_entry TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
