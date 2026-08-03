SET ROLE chai_migration_owner;

ALTER TABLE chai.follow_up_job
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES chai.payment(id);

CREATE INDEX IF NOT EXISTS follow_up_job_payment_idx
  ON chai.follow_up_job(tenant_id, payment_id)
  WHERE payment_id IS NOT NULL;

RESET ROLE;
