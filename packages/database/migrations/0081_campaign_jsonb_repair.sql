-- Repairs jsonb columns written double-encoded by ${JSON.stringify(...)} in
-- apps/api/src/modules/campaign/postgres-campaign.repository.ts.
--
-- Same defect as 0072-0080: `${JSON.stringify(value)}::jsonb` stores a jsonb
-- SCALAR STRING instead of an object. It stayed invisible to JS readers
-- because mapCampaign() already calls the defensive parseJson() helper in
-- that file, which re-parses a string value -- so a double encode was
-- quietly undone by a double decode. target_segment is nullable, but
-- jsonb_typeof(NULL) is NULL (not 'string'), so the predicate below already
-- skips NULL rows correctly.
SET ROLE chai_migration_owner;

UPDATE chai.campaign
SET target_segment = (target_segment #>> '{}')::jsonb
WHERE jsonb_typeof(target_segment) = 'string';

UPDATE chai.campaign
SET metrics = (metrics #>> '{}')::jsonb
WHERE jsonb_typeof(metrics) = 'string';

RESET ROLE;
