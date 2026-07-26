SET ROLE chai_migration_owner;

CREATE TABLE chai.shipment (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  carrier text NOT NULL,
  tracking_number text NOT NULL,
  status text NOT NULL DEFAULT 'LINKED'
    CHECK (status IN ('LINKED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION', 'STALE')),
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX shipment_tenant_tracking_idx
  ON chai.shipment(tenant_id, tracking_number);
CREATE INDEX shipment_tenant_created_idx
  ON chai.shipment(tenant_id, created_at DESC);

ALTER TABLE chai.shipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.shipment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.shipment
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.shipment FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.shipment TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
