-- Repairs jsonb columns written double-encoded by ${JSON.stringify(...)} in
-- apps/api/src/modules/logistics/postgres-logistics.repository.ts,
-- workers/logistics-worker/src/reconcile.ts, and
-- packages/domain/src/advanced-logistics/eta.ts.
--
-- Same defect as 0072-0076: `${JSON.stringify(value)}::jsonb` stores a jsonb
-- SCALAR STRING instead of an object/array. Both chai.shipment writers
-- (postgres-logistics.repository.ts and the logistics-worker reconciler) target
-- the same events column, so both needed the same fix; it stayed invisible to
-- JS readers because parseEvents()/mapRecord() in the repository (and
-- toRecord() in eta.ts checking `typeof === 'object'`) already tolerate a
-- string value.
SET ROLE chai_migration_owner;

UPDATE chai.shipment
SET events = (events #>> '{}')::jsonb
WHERE jsonb_typeof(events) = 'string';

UPDATE chai.eta_prediction
SET factors = (factors #>> '{}')::jsonb
WHERE jsonb_typeof(factors) = 'string';

RESET ROLE;
