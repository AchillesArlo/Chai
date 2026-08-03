-- Migration 0093: Durable Workflow Runs (REQ-07-010, REQ-07-011; Blueprint 07
-- §11 "Durable Workflows").
--
-- A durable workflow is a bounded, resumable saga whose status and accumulated
-- state live in ONE row, so a crashed worker can re-claim it and continue — or
-- unwind it — exactly where it stopped. This is the CLAIM-LOOP substrate
-- (FOR UPDATE SKIP LOCKED) already proven by chai.outbox_event and the payment
-- reconciler, NOT a new workflow-engine dependency: see
-- docs/plans/2026-07-27-deferred-workers-roadmap.md §2 — Temporal remains a
-- Growth-phase decision, and bounded reconcilable workflows use the claim-loop
-- the real workers already run.
--
-- `status` is the generic lifecycle (the domain state machine in
-- packages/domain/src/workflow/transitions.ts is its single source of truth).
-- `current_step` and `state` carry the workflow-type-specific sub-state (e.g. a
-- booking's REQUESTED/CREATING/CONFIRMED and the ids it must compensate).
SET ROLE chai_migration_owner;

CREATE TABLE chai.workflow_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  workflow_type text NOT NULL
    CONSTRAINT workflow_run_type_nonempty CHECK (length(workflow_type) > 0),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'RUNNING', 'COMPENSATING', 'DONE', 'FAILED')),
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_step text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The claim query scans (tenant, type, claimable status) oldest-first; this
-- index keeps the SKIP LOCKED probe off a full-table scan.
CREATE INDEX workflow_run_claim_idx
  ON chai.workflow_run (tenant_id, workflow_type, status, created_at);

ALTER TABLE chai.workflow_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.workflow_run FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON chai.workflow_run
  FOR ALL
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.workflow_run FROM PUBLIC;
-- Both runtimes: the API enqueues runs (app_runtime), the claim-loop worker
-- advances and compensates them (worker_runtime).
GRANT SELECT, INSERT, UPDATE ON chai.workflow_run TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
