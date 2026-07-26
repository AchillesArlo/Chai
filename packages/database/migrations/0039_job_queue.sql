-- 0039_job_queue.sql
-- GAP-025: Job queue module for background processing

CREATE TABLE IF NOT EXISTS job_queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  queue_name VARCHAR(100) NOT NULL,
  description TEXT,
  concurrency INTEGER NOT NULL DEFAULT 5,
  max_retries INTEGER NOT NULL DEFAULT 3,
  retry_delay_ms INTEGER NOT NULL DEFAULT 5000,
  timeout_ms INTEGER NOT NULL DEFAULT 300000,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_queue_tenant ON job_queues(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_queue_name ON job_queues(queue_name);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID NOT NULL REFERENCES job_queues(id),
  tenant_id UUID NOT NULL,
  job_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'cancelled', 'delayed'
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  error_stack TEXT,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_queue ON jobs(queue_id);
CREATE INDEX IF NOT EXISTS idx_job_tenant ON jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_type ON jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_job_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_job_priority ON jobs(priority DESC, scheduled_at ASC);
CREATE INDEX IF NOT EXISTS idx_job_scheduled ON jobs(scheduled_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS job_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id),
  attempt_number INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  status VARCHAR(50) NOT NULL, -- 'success', 'failed', 'timeout'
  error_message TEXT,
  error_stack TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_attempt_job ON job_attempts(job_id);
CREATE INDEX IF NOT EXISTS idx_job_attempt_time ON job_attempts(started_at);
