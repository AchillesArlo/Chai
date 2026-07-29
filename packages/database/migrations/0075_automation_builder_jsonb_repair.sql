-- Repairs jsonb columns written double-encoded by ${JSON.stringify(...)} in
-- apps/api/src/modules/automation-builder/automation-builder.repository.ts and
-- packages/domain/src/automation/versioning.ts.
--
-- Same defect as 0072-0074. `input`/`output` on chai.automation_simulation are
-- nullable, but jsonb_typeof(NULL) is NULL (not 'string'), so the predicate
-- below already skips NULL rows correctly without a separate NULL guard.
SET ROLE chai_migration_owner;

UPDATE chai.automation_flow
SET definition = (definition #>> '{}')::jsonb
WHERE jsonb_typeof(definition) = 'string';

UPDATE chai.automation_flow_version
SET definition = (definition #>> '{}')::jsonb
WHERE jsonb_typeof(definition) = 'string';

UPDATE chai.automation_simulation
SET input = (input #>> '{}')::jsonb
WHERE jsonb_typeof(input) = 'string';

UPDATE chai.automation_simulation
SET output = (output #>> '{}')::jsonb
WHERE jsonb_typeof(output) = 'string';

RESET ROLE;
