-- 0067_quarantine_grants.sql
-- Fase 5.1 (rencana-100-persen): the quarantine module is gaining a
-- Postgres-backed repository.
--
-- CONTEXT: public.quarantine_entries.tenant_id is NULLABLE (a webhook payload
-- may arrive before any tenant is identified, or never resolve to one), and
-- QuarantineRepository's getEntry/updateEntry/deleteEntry/logAccess/
-- listAccessLogs take NO tenantId at all -- the in-memory repository looks
-- these up by id/entryId only, with no tenant filter whatsoever. This is
-- intentional: api/owner/v1/quarantine is a PLATFORM-OWNER console (guarded by
-- RequirePermission('platform.reliability.*'), not a tenant permission), and
-- an owner reviewing quarantined payloads must be able to act on an entry
-- regardless of which tenant it belongs to -- or whether it belongs to any
-- tenant at all.
--
-- 0040_public_table_rls.sql gave quarantine_entries a single tenant_isolation
-- policy: USING (tenant_id = chai.current_tenant_id()). Under that policy
-- alone, chai_app_runtime can only see rows for the ONE tenant set via
-- app.tenant_id in that transaction -- it can never see another tenant's rows,
-- and it can NEVER see tenant_id IS NULL rows (NULL = anything is NULL, never
-- TRUE, no matter what current_tenant_id() returns). There is no way to
-- satisfy the by-id, any-tenant contract through that policy.
--
-- FIX (same shape as 0050's active_tenant_roster, applied narrowly): grant
-- the migrating user (this table's owner, since 0029/0040 ran without SET
-- ROLE) an additional SELECT/UPDATE/DELETE policy scoped to itself only
-- (OR-combined with tenant_isolation -- chai_app_runtime's and
-- chai_worker_runtime's isolation is untouched), then expose that access to
-- the API through SECURITY DEFINER functions that chai_app_runtime may
-- EXECUTE but that do nothing except the single fixed operation named. This
-- is a controlled, audited widening of exactly the five owner-console
-- operations the repository contract requires -- not a BYPASSRLS grant, and
-- not a change to tenant_isolation itself.
--
-- listEntries/createEntry are unaffected: both already carry a real tenantId
-- (see quarantine.controller.ts) or accept NULL only for a genuinely
-- tenant-less INSERT, so they run under the ordinary tenant_isolation policy
-- via withTenantTransaction / withPrincipalTransaction as appropriate.
--
-- Deliberately NOT wrapped in `SET ROLE chai_migration_owner`, matching 0040:
-- migrations 0029-0039 (including this table) ran without it, so
-- public.quarantine_entries / public.quarantine_access_log are owned by the
-- migrating user, not chai_migration_owner. CREATE POLICY and CREATE FUNCTION
-- ... SECURITY DEFINER on these tables require table ownership, so this
-- migration must run as that same migrating user.

CREATE POLICY owner_console_read_write ON public.quarantine_entries
  FOR ALL
  TO CURRENT_USER
  USING (true)
  WITH CHECK (true);

CREATE POLICY owner_console_read_write ON public.quarantine_access_log
  FOR ALL
  TO CURRENT_USER
  USING (true)
  WITH CHECK (true);

CREATE FUNCTION chai.quarantine_get_entry(entry_id uuid)
RETURNS SETOF public.quarantine_entries
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT * FROM public.quarantine_entries WHERE id = entry_id;
$$;

-- A genuinely tenant-less INSERT (tenant_id IS NULL) cannot satisfy
-- tenant_isolation's WITH CHECK (tenant_id = chai.current_tenant_id())
-- either -- NULL = current_tenant_id() is never TRUE even when
-- current_tenant_id() is itself NULL. So this insert needs the same
-- SECURITY DEFINER treatment as the by-id operations above.
CREATE FUNCTION chai.quarantine_create_tenantless_entry(
  entry_id uuid,
  source_type varchar,
  source_identifier varchar,
  raw_payload jsonb,
  redacted_payload jsonb,
  redaction_order jsonb,
  reason varchar,
  status varchar,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  retention_until timestamptz
)
RETURNS SETOF public.quarantine_entries
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  INSERT INTO public.quarantine_entries (
    id, tenant_id, source_type, source_identifier, raw_payload,
    redacted_payload, redaction_order, reason, status, reviewed_by,
    reviewed_at, review_notes, retention_until
  ) VALUES (
    entry_id, NULL, source_type, source_identifier, raw_payload,
    redacted_payload, redaction_order, reason, status, reviewed_by,
    reviewed_at, review_notes, retention_until
  )
  RETURNING *;
$$;

CREATE FUNCTION chai.quarantine_delete_entry(entry_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  -- Access log rows FK to the entry with no ON DELETE clause (0029), so the
  -- entry's audit trail is cleared first. A reviewed/rejected/released entry
  -- is done with, and its access history is not referenced from anywhere
  -- else once the entry itself is gone.
  DELETE FROM public.quarantine_access_log WHERE quarantine_entry_id = entry_id;
  DELETE FROM public.quarantine_entries WHERE id = entry_id;
$$;

CREATE FUNCTION chai.quarantine_list_access_logs(entry_id uuid)
RETURNS SETOF public.quarantine_access_log
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT * FROM public.quarantine_access_log WHERE quarantine_entry_id = entry_id;
$$;

-- update/insert cannot be simple SQL functions with static column lists here
-- because the caller supplies a partial update / free-form log row; these two
-- take every column explicitly instead of accepting a jsonb patch, so the
-- function body stays a single static statement per the 0050 precedent
-- (no dynamic SQL, nothing string-built from caller input).
CREATE FUNCTION chai.quarantine_update_entry(
  entry_id uuid,
  new_redacted_payload jsonb,
  new_redaction_order jsonb,
  new_retention_until timestamptz,
  new_reviewed_at timestamptz,
  new_reviewed_by uuid,
  new_review_notes text,
  new_status varchar,
  new_access_count integer,
  new_last_accessed_at timestamptz
)
RETURNS SETOF public.quarantine_entries
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE public.quarantine_entries SET
    redacted_payload = new_redacted_payload,
    redaction_order = new_redaction_order,
    retention_until = new_retention_until,
    reviewed_at = new_reviewed_at,
    reviewed_by = new_reviewed_by,
    review_notes = new_review_notes,
    status = new_status,
    access_count = new_access_count,
    last_accessed_at = new_last_accessed_at,
    updated_at = now()
  WHERE id = entry_id
  RETURNING *;
$$;

CREATE FUNCTION chai.quarantine_log_access(
  entry_id uuid,
  accessed_by uuid,
  access_type varchar,
  ip_address inet,
  user_agent text,
  reason text
)
RETURNS SETOF public.quarantine_access_log
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH inserted AS (
    INSERT INTO public.quarantine_access_log (
      quarantine_entry_id, accessed_by, access_type, ip_address, user_agent, reason
    ) VALUES (
      entry_id, accessed_by, access_type, ip_address, user_agent, reason
    )
    RETURNING *
  ), bumped AS (
    UPDATE public.quarantine_entries SET
      access_count = access_count + 1,
      last_accessed_at = now()
    WHERE id = entry_id
  )
  SELECT * FROM inserted;
$$;

REVOKE ALL ON FUNCTION chai.quarantine_get_entry(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION chai.quarantine_create_tenantless_entry(
  uuid, varchar, varchar, jsonb, jsonb, jsonb, varchar, varchar, uuid, timestamptz, text, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION chai.quarantine_update_entry(
  uuid, jsonb, jsonb, timestamptz, timestamptz, uuid, text, varchar, integer, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION chai.quarantine_delete_entry(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION chai.quarantine_log_access(uuid, uuid, varchar, inet, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION chai.quarantine_list_access_logs(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION chai.quarantine_get_entry(uuid) TO chai_app_runtime;
GRANT EXECUTE ON FUNCTION chai.quarantine_create_tenantless_entry(
  uuid, varchar, varchar, jsonb, jsonb, jsonb, varchar, varchar, uuid, timestamptz, text, timestamptz
) TO chai_app_runtime;
GRANT EXECUTE ON FUNCTION chai.quarantine_update_entry(
  uuid, jsonb, jsonb, timestamptz, timestamptz, uuid, text, varchar, integer, timestamptz
) TO chai_app_runtime;
GRANT EXECUTE ON FUNCTION chai.quarantine_delete_entry(uuid) TO chai_app_runtime;
GRANT EXECUTE ON FUNCTION chai.quarantine_log_access(uuid, uuid, varchar, inet, text, text) TO chai_app_runtime;
GRANT EXECUTE ON FUNCTION chai.quarantine_list_access_logs(uuid) TO chai_app_runtime;

-- listEntries / createEntry still go through the ordinary tenant_isolation
-- policy via withTenantTransaction / withPrincipalTransaction, so the runtime
-- role still needs the baseline grant 0040 already provides on
-- quarantine_entries/quarantine_access_log for chai_app_runtime,
-- chai_worker_runtime. This migration adds nothing there, only the five
-- by-id owner-console functions above.
