-- Repairs jsonb written double-encoded by ${JSON.stringify(...)} in
-- apps/api/src/modules/notification/postgres-notification.repository.ts.
--
-- Same defect as 0072-0077: `${JSON.stringify(value)}::jsonb` stores a jsonb
-- SCALAR STRING instead of an object. It stayed invisible to JS readers
-- because mapNotification() already calls the defensive parseJson() helper in
-- that file, which re-parses a string value -- so a double encode was quietly
-- undone by a double decode.
SET ROLE chai_migration_owner;

UPDATE chai.notification
SET metadata = (metadata #>> '{}')::jsonb
WHERE jsonb_typeof(metadata) = 'string';

RESET ROLE;
