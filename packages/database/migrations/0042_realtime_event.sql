-- Fase 1 (R-16 / GAP-005): durable realtime replay buffer.
--
-- The gateway previously kept its replay window in process memory, so a restart
-- lost every cursor and a second replica served a different history. Blueprint
-- 06_API §11 requires a bounded per-tenant replay window that a reconnecting
-- client can address with Last-Event-ID, which means it has to outlive the
-- process.
--
-- Retention is bounded by pruning, not by table growth: only the worker role may
-- delete, so a request-serving role can never erase a client's replay window.

SET ROLE chai_migration_owner;

CREATE TABLE chai.realtime_event (
  seq bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  event_id text NOT NULL,
  event_type text NOT NULL,
  aggregate_id text,
  version integer CHECK (version IS NULL OR version >= 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, event_id)
);

CREATE INDEX realtime_event_stream_idx
  ON chai.realtime_event(tenant_id, seq);

ALTER TABLE chai.realtime_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.realtime_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.realtime_event
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.realtime_event FROM PUBLIC;
GRANT SELECT, INSERT ON chai.realtime_event
  TO chai_app_runtime, chai_worker_runtime;
GRANT USAGE, SELECT ON SEQUENCE chai.realtime_event_seq_seq
  TO chai_app_runtime, chai_worker_runtime;
-- Pruning the replay window is maintenance work, so only the worker may delete.
GRANT DELETE ON chai.realtime_event TO chai_worker_runtime;

RESET ROLE;
