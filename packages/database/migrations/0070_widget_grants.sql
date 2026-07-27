-- 0070_widget_grants.sql
-- Fase 5.5 (rencana-100-persen): the widget module is gaining a
-- Postgres-backed repository. 0040_public_table_rls.sql granted
-- SELECT/INSERT/UPDATE on public.widgets and public.widget_sessions for
-- chai_app_runtime, chai_worker_runtime, but WidgetRepository has a
-- deleteWidget method (a real DELETE) that 0040 never anticipated. Grant it.
--
-- CONTEXT for the SECURITY DEFINER functions below: widget.controller.ts's
-- session routes (listSessions/getSession/updateSession/createSession) are a
-- deliberately public, unauthenticated widget runtime for anonymous website
-- visitors -- "no tenant scope, no principal" per its own comment, matching
-- authz mapping rule 5. WidgetRepository.listSessions/getSession/updateSession
-- therefore take no tenantId at all: the caller genuinely has none.
--
-- widgets/widget_sessions.tenant_id is NOT NULL and both carry the ordinary
-- direct tenant_isolation policy (tenant_id = chai.current_tenant_id()) from
-- 0040 -- there is no NULL-tenant edge case like quarantine. But a caller with
-- no tenant context cannot set app.tenant_id before reading, so the FIRST read
-- (discovering which tenant owns a widget/session) cannot go through that
-- policy either. These two narrow SECURITY DEFINER functions return ONLY a
-- tenant_id (uuid) -- nothing else -- so the repository can look up the
-- correct tenant and then do the actual read/write through the ordinary
-- tenant_isolation policy via withTenantTransaction, same audit path as every
-- other tenant-scoped query.

CREATE FUNCTION chai.widget_tenant_of(widget_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT tenant_id FROM public.widgets WHERE id = widget_id;
$$;

CREATE FUNCTION chai.widget_session_tenant_of(session_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT tenant_id FROM public.widget_sessions WHERE id = session_id;
$$;

REVOKE ALL ON FUNCTION chai.widget_tenant_of(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION chai.widget_session_tenant_of(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION chai.widget_tenant_of(uuid) TO chai_app_runtime;
GRANT EXECUTE ON FUNCTION chai.widget_session_tenant_of(uuid) TO chai_app_runtime;

-- This does NOT weaken isolation: the functions expose only a tenant_id
-- pointer, never row contents, and every actual read/write of widget or
-- session data still goes through the direct tenant_isolation policy with a
-- correctly-set app.tenant_id.

GRANT DELETE ON public.widgets TO chai_app_runtime, chai_worker_runtime;
