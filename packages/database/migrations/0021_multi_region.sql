-- Migration 0021: Multi-Region Support
-- Add region-aware tables for data residency and cross-region routing

SET ROLE chai_migration_owner;

-- Tenant region configuration
CREATE TABLE chai.tenant_region (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  region TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  data_residency_policy TEXT NOT NULL DEFAULT 'standard',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, region)
);

CREATE INDEX idx_tenant_region_tenant ON chai.tenant_region(tenant_id);
CREATE INDEX idx_tenant_region_primary ON chai.tenant_region(tenant_id) WHERE is_primary = true;

ALTER TABLE chai.tenant_region ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.tenant_region FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.tenant_region
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- Region routing rules
CREATE TABLE chai.region_routing_rule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  source_region TEXT NOT NULL,
  target_region TEXT NOT NULL,
  routing_type TEXT NOT NULL CHECK (routing_type IN ('latency', 'cost', 'compliance', 'manual')),
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_region_routing_tenant ON chai.region_routing_rule(tenant_id);
CREATE INDEX idx_region_routing_active ON chai.region_routing_rule(tenant_id, is_active);

ALTER TABLE chai.region_routing_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.region_routing_rule FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.region_routing_rule
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- Cross-region replication status
CREATE TABLE chai.region_replication_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  source_region TEXT NOT NULL,
  target_region TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  last_replicated_at TIMESTAMPTZ,
  replication_lag_ms INTEGER,
  status TEXT NOT NULL CHECK (status IN ('synced', 'lagging', 'failed', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, source_region, target_region, entity_type, entity_id)
);

CREATE INDEX idx_replication_status_tenant ON chai.region_replication_status(tenant_id);
CREATE INDEX idx_replication_status_entity ON chai.region_replication_status(entity_type, entity_id);

ALTER TABLE chai.region_replication_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.region_replication_status FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.region_replication_status
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

-- Data residency compliance log
CREATE TABLE chai.data_residency_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES chai.tenant(id),
  region TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'read', 'update', 'delete', 'replicate', 'migrate')),
  compliance_check_passed BOOLEAN NOT NULL,
  violation_reason TEXT,
  performed_by UUID NOT NULL REFERENCES chai.user_account(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_residency_audit_tenant ON chai.data_residency_audit(tenant_id);
CREATE INDEX idx_residency_audit_region ON chai.data_residency_audit(region);
CREATE INDEX idx_residency_audit_entity ON chai.data_residency_audit(entity_type, entity_id);

ALTER TABLE chai.data_residency_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.data_residency_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.data_residency_audit
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

RESET ROLE;
