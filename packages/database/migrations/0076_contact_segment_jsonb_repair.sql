-- Repairs jsonb written double-encoded by ${JSON.stringify(...)} in
-- apps/api/src/modules/contact-segment/postgres-contact-segment.repository.ts.
--
-- Same defect as 0072-0075: `${JSON.stringify(value)}::jsonb` stores a jsonb
-- SCALAR STRING instead of an object. It stayed invisible to JS readers
-- because mapRow() already calls the defensive parseJson() helper in that
-- file, which re-parses a string value -- so a double encode was quietly
-- undone by a double decode.
SET ROLE chai_migration_owner;

UPDATE chai.contact_segment
SET filter_rules = (filter_rules #>> '{}')::jsonb
WHERE jsonb_typeof(filter_rules) = 'string';

RESET ROLE;
