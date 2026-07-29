-- Repairs jsonb columns written double-encoded by ${JSON.stringify(...)} in
-- apps/api/src/modules/marketplace/marketplace.repository.ts.
--
-- Same defect as 0072/0073: `${JSON.stringify(value)}::jsonb` stores a jsonb
-- SCALAR STRING instead of an object/array, so `jsonb_typeof(column)` reads
-- 'string' and a key/element lookup returns NULL. This table had NO Postgres
-- integration test at all before this fix -- the existing marketplace suite
-- only exercised InMemoryMarketplaceRepository -- so the bug was never even
-- exercised against a real database until now.
SET ROLE chai_migration_owner;

UPDATE chai.webhook_subscription
SET events = (events #>> '{}')::jsonb
WHERE jsonb_typeof(events) = 'string';

UPDATE chai.marketplace_listing
SET config_schema = (config_schema #>> '{}')::jsonb
WHERE jsonb_typeof(config_schema) = 'string';

UPDATE chai.marketplace_installation
SET config = (config #>> '{}')::jsonb
WHERE jsonb_typeof(config) = 'string';

RESET ROLE;
