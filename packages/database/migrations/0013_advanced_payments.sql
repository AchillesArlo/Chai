SET ROLE chai_migration_owner;

CREATE TABLE chai.subscription (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  customer_id uuid NOT NULL,
  plan_id text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'PAUSED', 'CANCELLED')),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'IDR',
  billing_cycle text NOT NULL DEFAULT 'MONTHLY'
    CHECK (billing_cycle IN ('MONTHLY', 'YEARLY')),
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  provider_ref text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX subscription_tenant_idem_uidx
  ON chai.subscription(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX subscription_tenant_customer_idx
  ON chai.subscription(tenant_id, customer_id);
CREATE INDEX subscription_tenant_status_idx
  ON chai.subscription(tenant_id, status);

ALTER TABLE chai.subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.subscription FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.subscription
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.subscription FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.subscription TO chai_app_runtime, chai_worker_runtime;

CREATE TABLE chai.refund (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  payment_id uuid NOT NULL REFERENCES chai.payment(id),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  provider_ref text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX refund_tenant_idem_uidx
  ON chai.refund(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX refund_tenant_payment_idx
  ON chai.refund(tenant_id, payment_id);

ALTER TABLE chai.refund ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.refund FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.refund
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.refund FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.refund TO chai_app_runtime, chai_worker_runtime;

CREATE TABLE chai.dispute (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  payment_id uuid NOT NULL REFERENCES chai.payment(id),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'CHALLENGED'
    CHECK (status IN ('CHALLENGED', 'ACCEPTED', 'LOST')),
  provider_ref text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX dispute_tenant_idem_uidx
  ON chai.dispute(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX dispute_tenant_payment_idx
  ON chai.dispute(tenant_id, payment_id);

ALTER TABLE chai.dispute ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.dispute FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.dispute
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.dispute FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.dispute TO chai_app_runtime, chai_worker_runtime;

CREATE TABLE chai.settlement (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  provider text NOT NULL,
  gross_amount bigint NOT NULL CHECK (gross_amount >= 0),
  net_amount bigint NOT NULL CHECK (net_amount >= 0),
  fee_amount bigint NOT NULL CHECK (fee_amount >= 0),
  settled_at timestamptz NOT NULL,
  settlement_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX settlement_tenant_settled_idx
  ON chai.settlement(tenant_id, settled_at DESC);
CREATE INDEX settlement_tenant_provider_idx
  ON chai.settlement(tenant_id, provider);

ALTER TABLE chai.settlement ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.settlement FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.settlement
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.settlement FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.settlement TO chai_app_runtime, chai_worker_runtime;
GRANT SELECT ON chai.settlement TO chai_analytics_reader;

RESET ROLE;
