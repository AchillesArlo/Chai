-- 0036_payment_state_machine.sql
-- GAP-016, GAP-017: Payment state machine with separate lifecycles

CREATE TABLE IF NOT EXISTS payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  order_id UUID,
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'created', -- 'created', 'pending', 'processing', 'completed', 'failed', 'cancelled', 'expired'
  payment_method VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_request_tenant ON payment_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_request_status ON payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_payment_request_order ON payment_requests(order_id);

CREATE TABLE IF NOT EXISTS payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id UUID NOT NULL REFERENCES payment_requests(id),
  tenant_id UUID NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  provider VARCHAR(100) NOT NULL,
  provider_reference VARCHAR(255),
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'initiated', -- 'initiated', 'pending', 'processing', 'succeeded', 'failed', 'cancelled', 'unknown'
  error_code VARCHAR(100),
  error_message TEXT,
  provider_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_attempt_request ON payment_attempts(payment_request_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempt_tenant ON payment_attempts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempt_status ON payment_attempts(status);
CREATE INDEX IF NOT EXISTS idx_payment_attempt_provider ON payment_attempts(provider, provider_reference);

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id UUID NOT NULL REFERENCES payment_requests(id),
  tenant_id UUID NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  reason TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'requested', -- 'requested', 'pending', 'processing', 'completed', 'failed', 'rejected'
  provider VARCHAR(100),
  provider_reference VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refund_request ON refunds(payment_request_id);
CREATE INDEX IF NOT EXISTS idx_refund_tenant ON refunds(tenant_id);
CREATE INDEX IF NOT EXISTS idx_refund_status ON refunds(status);

CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id UUID NOT NULL REFERENCES payment_requests(id),
  tenant_id UUID NOT NULL,
  dispute_id VARCHAR(255) NOT NULL,
  reason VARCHAR(100) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'opened', -- 'opened', 'under_review', 'evidence_submitted', 'won', 'lost', 'closed'
  evidence JSONB DEFAULT '[]',
  provider_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dispute_request ON disputes(payment_request_id);
CREATE INDEX IF NOT EXISTS idx_dispute_tenant ON disputes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dispute_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_dispute_id ON disputes(dispute_id);
