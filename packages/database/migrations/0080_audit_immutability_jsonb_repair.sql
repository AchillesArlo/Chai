-- Repairs jsonb columns written double-encoded by ${JSON.stringify(...)} in
-- apps/api/src/modules/audit-immutability/postgres-audit-immutability.repository.ts.
--
-- Same defect as 0072-0079: `${JSON.stringify(value)}::jsonb` stores a jsonb
-- SCALAR STRING instead of an object. It stayed invisible to JS readers
-- because mapRow() already calls the defensive parseJson() helper in that
-- file, which re-parses a string value -- so a double encode was quietly
-- undone by a double decode.
--
-- SAFE FOR THE HASH CHAIN: chai.audit_entry.hash/previous_hash are `text`, not
-- jsonb (0052_audit_entry.sql), and PostgresAuditImmutabilityRepository.
-- computeHash() hashes the CALLER'S in-memory previousState/newState/metadata
-- objects at insert time, not whatever bytes previous_state/new_state/metadata
-- happen to hold on disk. This migration only rewrites the on-disk encoding of
-- those three jsonb columns; it does not touch hash, previous_hash, or any
-- other column, so no stored hash changes and verifyChain()'s recomputation
-- (which re-parses these columns through the same defensive parseJson() before
-- hashing) is unaffected either way.
SET ROLE chai_migration_owner;

UPDATE chai.audit_entry
SET previous_state = (previous_state #>> '{}')::jsonb
WHERE jsonb_typeof(previous_state) = 'string';

UPDATE chai.audit_entry
SET new_state = (new_state #>> '{}')::jsonb
WHERE jsonb_typeof(new_state) = 'string';

UPDATE chai.audit_entry
SET metadata = (metadata #>> '{}')::jsonb
WHERE jsonb_typeof(metadata) = 'string';

RESET ROLE;
