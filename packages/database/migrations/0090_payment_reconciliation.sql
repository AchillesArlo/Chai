-- Migration 0090: Payment Reconciliation Mismatches (REQ-17-065, Blueprint 05 §11.7)
SET ROLE chai_migration_owner;

CREATE TABLE IF NOT EXISTS chai.payment_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  payment_id uuid REFERENCES chai.payment(id),
  provider text NOT NULL,
  external_id text NOT NULL,
  discrepancy_type text NOT NULL,
  local_status text,
  provider_status text,
  local_amount_cents integer,
  provider_amount_cents integer,
  assigned_owner_id uuid,
  aging_days integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED')),
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_reconciliation_tenant_status_idx
  ON chai.payment_reconciliation (tenant_id, status, aging_days);

ALTER TABLE chai.payment_reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.payment_reconciliation FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON chai.payment_reconciliation;
CREATE POLICY tenant_isolation ON chai.payment_reconciliation
  FOR ALL
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON chai.payment_reconciliation TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
