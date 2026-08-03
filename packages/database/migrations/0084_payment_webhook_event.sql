SET ROLE chai_migration_owner;

-- Payment webhook event dedup (REQ-10-016, REQ-09-006, REQ-09-023).
--
-- decidePaymentTransition (packages/domain/src/payments/transitions.ts)
-- already protects the *data* from replay (PAID never regresses, terminal
-- states stay terminal, a same-status redelivery is IGNOREd). What is
-- missing is an explicit, queryable record of "this provider event id was
-- already received at this time" for forensics/observability, and a place
-- to reject a payload before it is even parsed against business state.
--
-- This is a pragmatic subset of the blueprint's normative
-- payment_webhook_event (05_DATA_MODEL_AND_TENANCY.md §11.7), which assumes a
-- provider_account/signature-key-version model chai.payment does not have
-- yet (that is a larger, separate modeling decision — see REQ-17-019 in the
-- remediation plan). This table covers what today's single-table payment
-- model can actually key on: tenant + provider + external id + provider
-- event id.
CREATE TABLE chai.payment_webhook_event (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  provider text NOT NULL,
  external_id text NOT NULL,
  provider_event_id text NOT NULL,
  -- Provider-claimed event time (readEventTime in
  -- postgres-payments.repository.ts). Nullable: some providers omit it, in
  -- which case verifyWebhookTimestamp already rejected the request before a
  -- row is ever written here, so a NULL row is only possible for a legacy
  -- caller that bypassed the check — kept nullable rather than widening the
  -- CHECK, since the timestamp gate lives in application code, not SQL.
  event_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  verified boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Dedup key. A provider redelivering the same event id for the same
  -- tenant+external payment is a replay (or a benign at-least-once retry);
  -- either way it must not be processed twice.
  UNIQUE (tenant_id, provider, external_id, provider_event_id)
);

CREATE INDEX payment_webhook_event_tenant_idx
  ON chai.payment_webhook_event(tenant_id, external_id);

-- RLS: same tenant-scoped pattern as chai.payment (migration 0010).
ALTER TABLE chai.payment_webhook_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.payment_webhook_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.payment_webhook_event
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.payment_webhook_event FROM PUBLIC;
GRANT SELECT, INSERT ON chai.payment_webhook_event TO chai_app_runtime;

RESET ROLE;
