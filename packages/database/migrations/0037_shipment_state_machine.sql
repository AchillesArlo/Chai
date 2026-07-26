-- 0037_shipment_state_machine.sql
-- GAP-018: Shipment state machine with transition rules

CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  order_id UUID,
  tracking_number VARCHAR(255),
  carrier VARCHAR(100) NOT NULL,
  service_level VARCHAR(50),
  status VARCHAR(50) NOT NULL DEFAULT 'created', -- 'created', 'label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned', 'cancelled'
  origin_address JSONB NOT NULL,
  destination_address JSONB NOT NULL,
  weight_kg DECIMAL(10,3),
  dimensions JSONB,
  metadata JSONB DEFAULT '{}',
  estimated_delivery TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shipment_tenant ON shipments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shipment_order ON shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipment_tracking ON shipments(tracking_number);
CREATE INDEX IF NOT EXISTS idx_shipment_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipment_carrier ON shipments(carrier);

CREATE TABLE IF NOT EXISTS shipment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id),
  tenant_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL, -- 'created', 'label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'exception', 'returned'
  status VARCHAR(50) NOT NULL,
  location JSONB,
  description TEXT,
  provider_event_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipment_event_shipment ON shipment_events(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_event_tenant ON shipment_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shipment_event_type ON shipment_events(event_type);
CREATE INDEX IF NOT EXISTS idx_shipment_event_time ON shipment_events(occurred_at);

CREATE TABLE IF NOT EXISTS shipment_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id),
  tenant_id UUID NOT NULL,
  package_number INTEGER NOT NULL,
  weight_kg DECIMAL(10,3),
  dimensions JSONB,
  contents JSONB,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipment_package_shipment ON shipment_packages(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_package_tenant ON shipment_packages(tenant_id);
