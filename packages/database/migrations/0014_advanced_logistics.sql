SET ROLE chai_migration_owner;

-- Stage 4, Workstream S4-2 (FUL-02): advanced logistics.
-- Rate shopping, return portal, claims, advisory ETA predictions.

CREATE TABLE chai.shipment_rate (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  origin_warehouse text NOT NULL,
  destination text NOT NULL,
  carrier text NOT NULL,
  service_type text NOT NULL,
  rate_cents bigint NOT NULL CHECK (rate_cents >= 0),
  currency text NOT NULL DEFAULT 'IDR',
  estimated_days integer NOT NULL CHECK (estimated_days >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shipment_rate_tenant_created_idx
  ON chai.shipment_rate(tenant_id, created_at DESC);
CREATE INDEX shipment_rate_origin_dest_idx
  ON chai.shipment_rate(tenant_id, origin_warehouse, destination);

ALTER TABLE chai.shipment_rate ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.shipment_rate FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.shipment_rate
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.shipment_rate FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.shipment_rate TO chai_app_runtime, chai_worker_runtime;

CREATE TABLE chai.return_request (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  original_shipment_id uuid REFERENCES chai.shipment(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED')),
  return_tracking text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX return_request_tenant_created_idx
  ON chai.return_request(tenant_id, created_at DESC);
CREATE INDEX return_request_shipment_idx
  ON chai.return_request(tenant_id, original_shipment_id);

ALTER TABLE chai.return_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.return_request FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.return_request
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.return_request FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.return_request TO chai_app_runtime, chai_worker_runtime;

CREATE TABLE chai.claim (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  shipment_id uuid REFERENCES chai.shipment(id),
  claim_type text NOT NULL
    CHECK (claim_type IN ('DAMAGED', 'LOST', 'WRONG_ITEM')),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED')),
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX claim_tenant_created_idx
  ON chai.claim(tenant_id, created_at DESC);
CREATE INDEX claim_shipment_idx
  ON chai.claim(tenant_id, shipment_id);

ALTER TABLE chai.claim ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.claim FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.claim
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.claim FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.claim TO chai_app_runtime, chai_worker_runtime;

-- ponytail: advisory heuristic ETA, not a carrier SLA. Confidence is coarse.
CREATE TABLE chai.eta_prediction (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  shipment_id uuid NOT NULL REFERENCES chai.shipment(id),
  predicted_date date NOT NULL,
  confidence text NOT NULL
    CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX eta_prediction_tenant_shipment_idx
  ON chai.eta_prediction(tenant_id, shipment_id, created_at DESC);

ALTER TABLE chai.eta_prediction ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.eta_prediction FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.eta_prediction
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.eta_prediction FROM PUBLIC;
GRANT SELECT, INSERT ON chai.eta_prediction TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
