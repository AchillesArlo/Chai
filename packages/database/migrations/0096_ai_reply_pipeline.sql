-- 0096_ai_reply_pipeline.sql
-- FASE 31: automatic AI reply pipeline (workers/inbox-dispatcher).
--
-- Two changes, both serving the reply pipeline that consumes `message.received`:
--
--  1. chai.ai_reply_setting -- a per-tenant, per-channel kill switch for AI
--     replies. FASE 31 decision 5: every channel may receive AI replies by
--     default (no row = enabled), but a tenant must be able to switch AI off for
--     ONE channel account without touching any other channel or tenant. This is
--     the cross-process, per-channel layer that complements the process-global
--     'ai-reply' provider in packages/connectors/src/kill-switch.ts (env/owner).
--
--  2. A SELECT grant on chai.membership for chai_worker_runtime. The escalation
--     path (guardrail block / budget exceeded) files an in-app notification to
--     the tenant owner (CLIENT_OWNER membership). Migration 0001 granted
--     chai.membership to chai_app_runtime only. RLS on chai.membership
--     (ENABLE + FORCE, tenant_isolation) still scopes this read to the worker's
--     own tenant context, so it never becomes a cross-tenant read path -- it
--     widens visibility by exactly the worker's own tenant rows.

SET ROLE chai_migration_owner;

CREATE TABLE chai.ai_reply_setting (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  channel_account_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, channel_account_id)
);

CREATE INDEX ai_reply_setting_tenant_channel_idx
  ON chai.ai_reply_setting(tenant_id, channel_account_id);

ALTER TABLE chai.ai_reply_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.ai_reply_setting FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.ai_reply_setting
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.ai_reply_setting FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.ai_reply_setting
  TO chai_app_runtime, chai_worker_runtime;

-- See header note 2: worker resolves the tenant owner to notify on escalation.
GRANT SELECT ON chai.membership TO chai_worker_runtime;

RESET ROLE;
