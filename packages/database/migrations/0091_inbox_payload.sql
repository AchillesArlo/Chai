-- Migration 0091: Inbound webhook payload store (T-06, FASE 29).
SET ROLE chai_migration_owner;

-- chai.inbox_event keeps only a payload_reference + integrity hash, which is
-- enough to detect a redelivery but NOT enough to rebuild the raw event a
-- worker must re-run (see workers/inbox-dispatcher/src/main.ts: "Real async
-- processing is BLOCKED on a restricted payload store"). This table is that
-- store: the verified provider event, kept per-tenant under RLS.
--
-- Human decision (2026-07-31), recorded so the rules are not re-litigated:
--   1. Storage is a jsonb column in Postgres, not an object store — every byte
--      stays inside Postgres + RLS, no new dependency.
--   2. Retention is 30 days, then automatic REDACTION (not row deletion): the
--      payload is replaced by a placeholder and `redacted_at` is stamped, so
--      the audit trail of "an event existed" survives while the personal data
--      does not. See redactExpiredInboxPayloads in @chai/domain.
--   3. Card/CVV/PIN/OTP/bank-credential fields are redacted BEFORE the first
--      write (recordInboxPayload), never stored in plaintext even for a moment.
--   4. RLS ENABLE + FORCE, because a customer message body is sensitive data.
CREATE TABLE chai.inbox_payload (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  inbox_event_id uuid NOT NULL REFERENCES chai.inbox_event(id),
  payload jsonb NOT NULL,
  -- NULL until the retention job redacts the payload; a stamped value means the
  -- `payload` column no longer holds the original event.
  redacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One payload per inbox event. A redelivery collapses on chai.inbox_event's
  -- own unique constraint upstream, so a second payload row is never attempted;
  -- this makes recordInboxPayload's ON CONFLICT DO NOTHING a belt-and-braces.
  UNIQUE (tenant_id, inbox_event_id)
);

-- Retention sweep predicate: find not-yet-redacted rows older than the window.
CREATE INDEX inbox_payload_retention_idx
  ON chai.inbox_payload (created_at)
  WHERE redacted_at IS NULL;

CREATE INDEX inbox_payload_event_idx
  ON chai.inbox_payload (tenant_id, inbox_event_id);

ALTER TABLE chai.inbox_payload ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.inbox_payload FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.inbox_payload
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.inbox_payload FROM PUBLIC;
-- app_runtime writes at the API ingest edge; worker_runtime reads to rebuild an
-- event and runs the retention redaction (UPDATE).
GRANT SELECT, INSERT, UPDATE ON chai.inbox_payload TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
