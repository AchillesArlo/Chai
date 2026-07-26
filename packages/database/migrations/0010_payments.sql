SET ROLE chai_migration_owner;

CREATE TABLE chai.payment (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  external_id text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'IDR',
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('CREATED', 'PENDING', 'PAID', 'EXPIRED', 'FAILED', 'UNKNOWN_RESULT')),
  idempotency_key text,
  checkout_url text NOT NULL,
  expires_at timestamptz NOT NULL,
  provider text NOT NULL DEFAULT 'mock-payment',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX payment_tenant_idempotency_uidx
  ON chai.payment(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX payment_tenant_external_idx
  ON chai.payment(tenant_id, external_id);

ALTER TABLE chai.payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.payment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.payment
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.payment FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.payment TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
