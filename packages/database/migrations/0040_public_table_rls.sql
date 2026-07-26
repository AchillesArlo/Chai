-- R-09: close the RLS hole on the public-schema tables introduced by
-- migrations 0029-0039.
--
-- Those migrations created tenant-scoped tables in `public` without
-- ENABLE/FORCE ROW LEVEL SECURITY and without a tenant policy, so a runtime
-- role could read or write across tenants. Blueprint 05_DATA_MODEL §14 requires
-- default-deny RLS on every tenant-owned table, and ADR-004 requires the
-- runtime roles to stay NOBYPASSRLS.
--
-- Idempotent on purpose: the tables use CREATE TABLE IF NOT EXISTS, so this
-- migration must tolerate being applied to a database where some are absent.
--
-- Deliberately NOT wrapped in `SET ROLE chai_migration_owner`: unlike 0001-0028,
-- migrations 0029-0039 ran without it, so those public tables are owned by the
-- migrating user. ALTER TABLE ... FORCE ROW LEVEL SECURITY requires ownership,
-- so this migration must run as that same user.

DO $$
DECLARE
  -- Tenant-owned tables that carry tenant_id directly.
  tenant_tables text[] := ARRAY[
    'quarantine_entries',
    'retention_policies',
    'retention_jobs',
    'connector_configs',
    'impersonation_sessions',
    'widgets',
    'widget_sessions',
    'outbox_events',
    'event_subscriptions',
    'commands',
    'domain_events',
    'payment_requests',
    'payment_attempts',
    'refunds',
    'disputes',
    'shipments',
    'shipment_events',
    'shipment_packages',
    'audit_log_entries',
    'audit_integrity_checks',
    'job_queues',
    'jobs'
  ];
  target text;
BEGIN
  FOREACH target IN ARRAY tenant_tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = target
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', target);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', target);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON public.%I '
        'USING (tenant_id = chai.current_tenant_id()) '
        'WITH CHECK (tenant_id = chai.current_tenant_id())',
        target
      );
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE ON public.%I TO chai_app_runtime, chai_worker_runtime',
        target
      );
    END IF;
  END LOOP;
END
$$;

-- Child tables with no tenant_id of their own: scoped through their parent row.
-- connector_secrets in particular holds provider credentials, so leaving it
-- unprotected would let a runtime role read another tenant's secret references.
DO $$
DECLARE
  -- child table, parent table, foreign key column on the child
  child_scopes text[][] := ARRAY[
    ARRAY['quarantine_access_log', 'quarantine_entries', 'quarantine_entry_id'],
    ARRAY['connector_secrets', 'connector_configs', 'connector_config_id'],
    ARRAY['impersonation_audit_log', 'impersonation_sessions', 'impersonation_session_id'],
    ARRAY['job_attempts', 'jobs', 'job_id']
  ];
  child text;
  parent text;
  fk text;
  index_position int;
BEGIN
  FOR index_position IN 1 .. array_length(child_scopes, 1) LOOP
    child := child_scopes[index_position][1];
    parent := child_scopes[index_position][2];
    fk := child_scopes[index_position][3];

    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = child
    ) AND EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = parent
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', child);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', child);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', child);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON public.%1$I '
        'USING (EXISTS (SELECT 1 FROM public.%2$I AS parent_row '
        '  WHERE parent_row.id = public.%1$I.%3$I '
        '    AND parent_row.tenant_id = chai.current_tenant_id())) '
        'WITH CHECK (EXISTS (SELECT 1 FROM public.%2$I AS parent_row '
        '  WHERE parent_row.id = public.%1$I.%3$I '
        '    AND parent_row.tenant_id = chai.current_tenant_id()))',
        child, parent, fk
      );
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE ON public.%I TO chai_app_runtime, chai_worker_runtime',
        child
      );
    END IF;
  END LOOP;
END
$$;
