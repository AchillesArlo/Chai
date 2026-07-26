SET ROLE chai_migration_owner;

ALTER TABLE chai.inbox_event
  ADD COLUMN schema_version integer NOT NULL,
  ADD COLUMN payload_hash text NOT NULL,
  ADD CONSTRAINT inbox_event_schema_version_positive
    CHECK (schema_version > 0),
  ADD CONSTRAINT inbox_event_payload_hash_valid
    CHECK (payload_hash ~ '^sha256:[0-9a-f]{64}$');

RESET ROLE;
