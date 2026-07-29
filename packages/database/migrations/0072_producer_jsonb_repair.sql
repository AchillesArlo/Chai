-- Repairs jsonb columns written double-encoded by ${JSON.stringify(...)}.
--
-- packages/domain/src/outbox/producer.ts (chai.outbox_event.payload,
-- chai.audit_log.metadata) and packages/domain/src/realtime/event-store.ts
-- (chai.realtime_event.payload) all interpolated `JSON.stringify(value)` into a
-- `${...}::jsonb` parameter. postgres-js already serialises a plain object
-- passed as a parameter when the target is jsonb, so stringifying first stored
-- a jsonb SCALAR STRING ("{\"key\":\"value\"}") instead of an object:
-- `jsonb_typeof(column)` read 'string' and `column ->> 'key'` returned NULL for
-- every key. No SQL consumer -- the analytics reader role, a GIN index, an
-- expression index -- could ever filter or index by a key inside these columns.
--
-- It stayed hidden because every JS reader (audit-log.repository.ts,
-- outbox/dispatcher.ts, realtime event-store.ts replay) casts the column
-- straight to an object type without re-parsing, so nothing on the read side
-- ever forced the string to be interpreted as JSON and fail loudly. This is the
-- same shape of bug migration 0071 already fixed for chai.follow_up_job.payload;
-- this migration is producer.ts/event-store.ts's three other columns.
--
-- chai_app_runtime/chai_worker_runtime hold no UPDATE grant on chai.audit_log or
-- chai.realtime_event (0001_foundation.sql, 0042_realtime_event.sql) --
-- deliberately, since both are meant to be append-only. This repair runs as
-- chai_migration_owner rather than loosening either grant: it corrects the
-- on-disk *encoding* of an existing value, not its meaning, so it does not
-- reopen either table to ordinary runtime mutation.
SET ROLE chai_migration_owner;

UPDATE chai.outbox_event
SET payload = (payload #>> '{}')::jsonb
WHERE jsonb_typeof(payload) = 'string';

UPDATE chai.audit_log
SET metadata = (metadata #>> '{}')::jsonb
WHERE jsonb_typeof(metadata) = 'string';

UPDATE chai.realtime_event
SET payload = (payload #>> '{}')::jsonb
WHERE jsonb_typeof(payload) = 'string';

RESET ROLE;
