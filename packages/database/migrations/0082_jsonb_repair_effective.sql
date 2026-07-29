-- Repair jsonb columns that were written double-encoded, FOR REAL this time.
--
-- WHY THIS MIGRATION EXISTS
--
-- Migrations 0071-0081 each attempted this repair with:
--
--     SET ROLE chai_migration_owner;
--     UPDATE <table> SET <col> = (<col> #>> '{}')::jsonb
--     WHERE jsonb_typeof(<col>) = 'string';
--
-- Every one of those was a SILENT NO-OP on any database that actually held
-- rows. Two independent reasons, both verified empirically against a real
-- PostgreSQL 17 container:
--
--  1. RLS. Every one of the 19 target tables is `ENABLE` + `FORCE ROW LEVEL
--     SECURITY`, and FORCE removes the table owner's implicit exemption. The
--     policies read `chai.current_tenant_id()`, which is
--     `current_setting('app.tenant_id')`. A migration sets no tenant context, so
--     the function returns NULL, the policy matches nothing, and the UPDATE
--     touches ZERO rows — without raising anything. It looks like it worked.
--
--  2. Append-only enforcement. `chai.audit_entry` additionally carries the
--     BEFORE UPDATE trigger `audit_entry_no_update` (0052_audit_entry.sql), which
--     raises unconditionally. Probed directly:
--     `chai.audit_entry is append-only: UPDATE is not permitted`.
--
-- The defect hid because integration tests run against a FRESH container: the
-- tables are empty, the UPDATE legitimately matches zero rows, and the trigger
-- never fires. Emptiness, not correctness, made those migrations pass.
--
-- HOW THIS ONE DIFFERS
--
-- It deliberately does NOT `SET ROLE chai_migration_owner`. It runs as the
-- connecting role, which for migrations is already required to be a superuser --
-- 0051_runtime_login_roles.sql documents that same requirement, since CREATE ROLE
-- and ALTER ROLE ... NOBYPASSRLS need it. A superuser bypasses RLS outright, so
-- the repair sees every tenant's rows without weakening any policy, without
-- toggling FORCE off, and without needing to enumerate tenants (which would
-- itself be blocked: chai.tenant is FORCE-protected too).
--
-- Crucially it FAILS LOUDLY instead of silently. If the connecting role cannot
-- bypass RLS, this migration raises rather than quietly repairing nothing. A
-- silent no-op is what let the previous ten look successful for a whole session.
--
-- The writers themselves were already fixed (they now pass objects to postgres-js
-- via `tx.json(...)` rather than pre-stringifying), so this only corrects rows
-- written before that fix. It is idempotent: the `jsonb_typeof(...) = 'string'`
-- predicate means a second run, or a run on already-correct data, changes nothing.

-- Guard first: never let this degrade into the silent no-op it exists to fix.
DO $$
DECLARE
  can_bypass boolean;
BEGIN
  SELECT rolsuper OR rolbypassrls INTO can_bypass
  FROM pg_roles WHERE rolname = current_user;

  IF NOT COALESCE(can_bypass, false) THEN
    RAISE EXCEPTION
      'jsonb repair needs a superuser or BYPASSRLS role, but current_user is %. '
      'Running it under an RLS-constrained role would repair ZERO rows and '
      'report success, which is the exact bug this migration fixes.', current_user;
  END IF;
END $$;

DO $$
DECLARE
  target record;
  repaired bigint;
  total bigint := 0;
BEGIN
  -- chai.audit_entry is append-only by trigger. The trigger is suspended only
  -- for this transaction and re-enabled below; a failure anywhere in this
  -- migration rolls the ALTER back with everything else, since DDL here is
  -- transactional. This rewrites the ENCODING of existing values, never their
  -- meaning, and touches no hash column -- hashes are computed by the
  -- application from in-memory objects at insert time, so the chain is unaffected.
  ALTER TABLE chai.audit_entry DISABLE TRIGGER audit_entry_no_update;

  FOR target IN
    SELECT * FROM (VALUES
      ('chai.agent_profile',           'business_rules'),
      ('chai.agent_profile',           'handover_policy'),
      ('chai.agent_session',           'context'),
      ('chai.audit_entry',             'metadata'),
      ('chai.audit_entry',             'new_state'),
      ('chai.audit_entry',             'previous_state'),
      ('chai.audit_log',               'metadata'),
      ('chai.automation_flow',         'definition'),
      ('chai.automation_flow_version', 'definition'),
      ('chai.automation_simulation',   'input'),
      ('chai.automation_simulation',   'output'),
      ('chai.campaign',                'metrics'),
      ('chai.campaign',                'target_segment'),
      ('chai.contact_segment',         'filter_rules'),
      ('chai.eta_prediction',          'factors'),
      ('chai.follow_up_job',           'payload'),
      ('chai.marketplace_installation','config'),
      ('chai.marketplace_listing',     'config_schema'),
      ('chai.message_template',        'variables'),
      ('chai.notification',            'metadata'),
      ('chai.outbox_event',            'payload'),
      ('chai.realtime_event',          'payload'),
      ('chai.shipment',                'events'),
      ('chai.tool_policy',             'constraints'),
      ('chai.webhook_subscription',    'events')
    ) AS t(table_name, column_name)
  LOOP
    EXECUTE format(
      'UPDATE %s SET %I = (%I #>> ''{}'')::jsonb WHERE jsonb_typeof(%I) = ''string''',
      target.table_name, target.column_name, target.column_name, target.column_name
    );
    GET DIAGNOSTICS repaired = ROW_COUNT;
    total := total + repaired;
    IF repaired > 0 THEN
      RAISE NOTICE 'jsonb repair: %.% -> % baris', target.table_name, target.column_name, repaired;
    END IF;
  END LOOP;

  ALTER TABLE chai.audit_entry ENABLE TRIGGER audit_entry_no_update;

  RAISE NOTICE 'jsonb repair selesai: % baris diperbaiki di 25 kolom', total;
END $$;
