-- Fase 2 (R-15): shipments need recorded ownership so a customer-facing lookup
-- can be verified.
--
-- A tracking number is a guessable, sequential-ish identifier. Blueprint
-- 17_PAYMENT/§7.3 and ADR-027 require an end-customer lookup to prove tenant AND
-- contact/order ownership, not merely to know the tracking number. Until now the
-- shipment row held nothing to check against, so no such verification was even
-- expressible.
--
-- Nullable on purpose: shipments linked by staff before this column existed have
-- no recorded owner, and a customer lookup against them must fail closed rather
-- than be silently allowed.

SET ROLE chai_migration_owner;

ALTER TABLE chai.shipment
  ADD COLUMN IF NOT EXISTS contact_id uuid,
  ADD COLUMN IF NOT EXISTS order_reference text;

-- Composite tenant FK: a shipment can only point at a contact in its own tenant.
ALTER TABLE chai.shipment
  DROP CONSTRAINT IF EXISTS shipment_contact_fk;
ALTER TABLE chai.shipment
  ADD CONSTRAINT shipment_contact_fk
  FOREIGN KEY (tenant_id, contact_id)
  REFERENCES chai.contact(tenant_id, id);

CREATE INDEX IF NOT EXISTS shipment_tenant_contact_idx
  ON chai.shipment(tenant_id, contact_id);

RESET ROLE;
