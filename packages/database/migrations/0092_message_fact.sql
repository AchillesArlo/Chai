-- Migration 0092: message analytics fact table (T-07/T-08/T-09, FASE 32).
SET ROLE chai_migration_owner;

-- The first analytics fact table. Blueprint 11 asks for 18; this is the minimal
-- one that proves the pattern: a fact is written FROM AN EVENT (the FASE 30
-- consumer of `message.received`), never by scanning operational tables. That
-- separation is the point — dashboards read this table, not chai.conversation /
-- chai.message, so analytics load never competes with the transactional path.
--
-- Deliberately non-PII: it records dimensions (direction, sender, mode) and the
-- references needed to trace back under RLS, but no message body. The body
-- stays in chai.message behind tenant RLS.
CREATE TABLE chai.message_fact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  -- Outbox event id. This is the idempotency key: the FASE 30 consumer is
  -- at-least-once, so a redelivered `message.received` must not double-count.
  -- Same dedup discipline as chai.payment_webhook_event (migration 0084).
  event_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  message_id uuid NOT NULL,
  provider text NOT NULL,
  -- Conversation mode at receipt (AI_ACTIVE / HUMAN_ACTIVE / ...). Drives the
  -- bot/human source mix in MetricLineage without re-reading the conversation.
  mode text NOT NULL,
  -- True when this inbound message opened a brand-new conversation.
  conversation_created boolean NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, event_id)
);

CREATE INDEX message_fact_tenant_occurred_idx
  ON chai.message_fact (tenant_id, occurred_at);

ALTER TABLE chai.message_fact ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.message_fact FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.message_fact
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.message_fact FROM PUBLIC;
-- worker_runtime inserts from the consumer; app_runtime + analytics_reader read
-- for dashboards. No UPDATE/DELETE: a fact is immutable once recorded.
GRANT INSERT, SELECT ON chai.message_fact TO chai_worker_runtime;
GRANT SELECT ON chai.message_fact TO chai_app_runtime, chai_analytics_reader;

RESET ROLE;
