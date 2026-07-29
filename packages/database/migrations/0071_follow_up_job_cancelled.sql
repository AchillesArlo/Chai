-- Reminder cancellation for settled payments.
--
-- Blueprint 07_EVENTS §449 and 02_SYSTEM_ARCHITECTURE §233 require that a paid
-- payment "updates linked projections and stops reminders exactly once". The
-- follow_up_job status vocabulary had no way to express "stopped because the
-- thing it was chasing already happened": PENDING/CLAIMED/DONE/FAILED only.
--
-- Reusing DONE would be a lie in the audit trail -- DONE means the reminder was
-- delivered. A cancelled reminder was deliberately never sent, and operators
-- reading queue depth or the automation runbook must be able to tell those
-- apart. Hence a distinct terminal status.
SET ROLE chai_migration_owner;

ALTER TABLE chai.follow_up_job
  DROP CONSTRAINT follow_up_job_status_check;

ALTER TABLE chai.follow_up_job
  ADD CONSTRAINT follow_up_job_status_check
  CHECK (status IN ('PENDING', 'CLAIMED', 'DONE', 'FAILED', 'CANCELLED'));

-- Cancellation looks reminders up by the payment they chase, which lives in the
-- payload rather than a column: chai.payment carries no business reference, so a
-- foreign key is not available. This partial index keeps that lookup from
-- degrading into a full scan per settled payment.
CREATE INDEX IF NOT EXISTS follow_up_job_pending_payment_idx
  ON chai.follow_up_job (tenant_id, (payload ->> 'paymentExternalId'))
  WHERE status = 'PENDING';

-- Repairs payloads written double-encoded.
--
-- Both writers used `${JSON.stringify(payload)}`, but postgres-js already
-- serialises objects for a jsonb parameter, so stringifying first stored a jsonb
-- SCALAR STRING ("{\"kind\":\"x\"}") instead of an object. jsonb_typeof said
-- 'string', so `payload ->> 'key'` returned NULL for every key and no SQL
-- consumer could read a payload. It stayed hidden because the JS side casts the
-- value straight to Record<string, unknown>, so a double decode cancelled the
-- double encode for JS readers only.
UPDATE chai.follow_up_job
SET payload = (payload #>> '{}')::jsonb
WHERE jsonb_typeof(payload) = 'string';

RESET ROLE;
