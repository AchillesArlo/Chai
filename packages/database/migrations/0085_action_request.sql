SET ROLE chai_migration_owner;

-- Idempotent ActionRequest for AI/human tool execution (REQ-08-008,
-- REQ-08-021, REQ-09-034; blueprint 08_AI_AGENT_AND_KNOWLEDGE.md §15 "Tool
-- Execution Contract" step 8).
--
-- Before this table, POST /api/client/v1/actions/evaluate only returned a
-- policy decision to the caller — it never executed anything, so nothing
-- ever recorded that a tool was attempted, by whom, with what result. This
-- table is what makes a tool execution replay-safe: a caller retrying the
-- same idempotency_key gets the recorded outcome, not a second execution
-- with a possibly different side effect.

CREATE TABLE chai.action_request (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  idempotency_key text NOT NULL
    CONSTRAINT action_request_idempotency_key_nonempty CHECK (length(idempotency_key) > 0),
  tool text NOT NULL,
  origin text NOT NULL CHECK (origin IN ('ai', 'human')),
  -- The exact policy decision this request was executed under (ALLOW only —
  -- a DENY/REQUIRE_* decision never reaches this table, since the executor
  -- refuses to run without an ALLOW). Kept for audit: which risk tier and
  -- which entitlement gate applied at the moment of execution.
  risk_tier text NOT NULL CHECK (risk_tier IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  approved_by uuid,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED')),
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  -- Idempotency is scoped to tenant + the caller-supplied key: the same key
  -- can never mean two different tools or two different executions.
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX action_request_tenant_tool_idx
  ON chai.action_request(tenant_id, tool, created_at DESC);

ALTER TABLE chai.action_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.action_request FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.action_request
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.action_request FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.action_request TO chai_app_runtime;

RESET ROLE;
