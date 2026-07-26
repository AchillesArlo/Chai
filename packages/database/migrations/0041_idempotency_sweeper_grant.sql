-- Fase 1 (GAP-006): the idempotency expiry sweeper needs DELETE.
--
-- Retention on chai.idempotency_record must exceed the longest provider retry
-- window, after which settled keys are removed. That sweep is maintenance work,
-- so only the worker role gets DELETE: the request-serving role must never be
-- able to forget a key and thereby allow a duplicate side effect.
--
-- Execution history (chai.operation_execution) is deliberately NOT deletable by
-- any runtime role; a superseded attempt is closed as FAILED_FINAL instead.

SET ROLE chai_migration_owner;

GRANT DELETE ON chai.idempotency_record TO chai_worker_runtime;

RESET ROLE;
