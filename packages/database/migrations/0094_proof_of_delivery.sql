-- Migration 0094: Proof of Delivery (REQ-17-038; Blueprint 07
-- §11.6 "proof-of-delivery reference", 03_UX_UI masked PoD access).
--
-- Before this, delivery evidence had nowhere to live. A PoD is sensitive: it
-- carries a recipient name and a signature artifact that must NOT leak to an
-- unauthorised party. This table stores only a REFERENCE to the artifact in
-- object storage (never the bytes), keeps the PII columns nullable, and is
-- write-once evidence — captured, then only ever read. The masking, role gate,
-- short-lived-link expiry, and access audit live in
-- packages/domain/src/advanced-logistics/proof-of-delivery.ts.
SET ROLE chai_migration_owner;

CREATE TABLE chai.proof_of_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  shipment_id uuid NOT NULL REFERENCES chai.shipment(id),
  -- Reference to the artifact in object storage, never the bytes themselves.
  artifact_ref text NOT NULL
    CONSTRAINT proof_of_delivery_artifact_ref_nonempty CHECK (length(artifact_ref) > 0),
  -- PII captured at the door; masked for anyone but authorised staff.
  recipient_name text,
  signature_ref text,
  delivered_at timestamptz NOT NULL,
  captured_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX proof_of_delivery_tenant_shipment_idx
  ON chai.proof_of_delivery (tenant_id, shipment_id);

ALTER TABLE chai.proof_of_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.proof_of_delivery FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON chai.proof_of_delivery
  FOR ALL
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.proof_of_delivery FROM PUBLIC;
-- Write-once evidence: SELECT + INSERT only, no UPDATE/DELETE. A PoD is captured
-- once and thereafter read-only; there is no legitimate edit path.
GRANT SELECT, INSERT ON chai.proof_of_delivery TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
