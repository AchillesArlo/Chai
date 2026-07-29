-- Repairs jsonb columns written double-encoded by ${JSON.stringify(...)} in
-- apps/api/src/modules/ai-agent/postgres-ai-agent.repository.ts.
--
-- Same defect as 0072: `${JSON.stringify(value)}::jsonb` stores a jsonb SCALAR
-- STRING instead of an object, so `jsonb_typeof(column)` reads 'string' and
-- `column ->> 'key'` returns NULL for every key. It stayed invisible to JS
-- readers because `mapProfile`/`mapSession`/`mapToolPolicy` already call the
-- defensive `parseJson()` helper in that file, which re-parses a string value --
-- so a double encode was quietly undone by a double decode.
SET ROLE chai_migration_owner;

UPDATE chai.agent_profile
SET business_rules = (business_rules #>> '{}')::jsonb
WHERE jsonb_typeof(business_rules) = 'string';

UPDATE chai.agent_profile
SET handover_policy = (handover_policy #>> '{}')::jsonb
WHERE jsonb_typeof(handover_policy) = 'string';

UPDATE chai.agent_session
SET context = (context #>> '{}')::jsonb
WHERE jsonb_typeof(context) = 'string';

UPDATE chai.tool_policy
SET constraints = (constraints #>> '{}')::jsonb
WHERE jsonb_typeof(constraints) = 'string';

RESET ROLE;
