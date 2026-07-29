-- Repairs jsonb written double-encoded by ${JSON.stringify(...)} in
-- apps/api/src/modules/template/postgres-template.repository.ts.
--
-- Same defect as 0072-0078: `${JSON.stringify(value)}::jsonb` stores a jsonb
-- SCALAR STRING instead of an array. It stayed invisible to JS readers because
-- mapTemplate() already calls the defensive parseJson() helper in that file,
-- which re-parses a string value -- so a double encode was quietly undone by a
-- double decode.
SET ROLE chai_migration_owner;

UPDATE chai.message_template
SET variables = (variables #>> '{}')::jsonb
WHERE jsonb_typeof(variables) = 'string';

RESET ROLE;
