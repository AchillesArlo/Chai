-- Fase 2 (R-08): canonical shipment status must be able to say UNKNOWN.
--
-- The status CHECK had no fail-safe value, so an unrecognised provider code had
-- nowhere to land and the adapter mapped it to IN_TRANSIT — a parcel that may be
-- lost kept looking healthy. ADR-027 and acceptance LOG-02 require an unmapped
-- code to surface as UNKNOWN and raise a mapping alert instead.

SET ROLE chai_migration_owner;

ALTER TABLE chai.shipment
  DROP CONSTRAINT IF EXISTS shipment_status_check;

ALTER TABLE chai.shipment
  ADD CONSTRAINT shipment_status_check
  CHECK (status IN (
    'LINKED',
    'PICKED_UP',
    'IN_TRANSIT',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'EXCEPTION',
    'STALE',
    'UNKNOWN'
  ));

RESET ROLE;
