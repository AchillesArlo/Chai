SET ROLE chai_migration_owner;

-- 0087_order_catalog.sql
-- FASE 6 — Sumber amount tepercaya (prasyarat FASE 7).
--
-- Menutup REQ-17-021 (amount dari sumber tepercaya; AI tak mengarang harga):
-- sebelum ini, CreateCheckoutBody menerima `amount` dari klien/AI apa adanya.
-- Sekarang rantai sumber amount: service_item (katalog) -> order + order_item
-- (snapshot harga immutable per-order) -> invoice -> payment (amount dihitung
-- server-side dari order_item, bukan input klien).
--
-- Blueprint: 05_DATA_MODEL_AND_TENANCY.md §11.2/11.3/11.4/11.6.
--
-- Invarian (README "Invarian"):
-- - Uang disimpan sebagai INTEGER minor units (amount_cents), bukan DECIMAL.
--   Pelanggaran = bug rilis. payment_requests (0036) memakai DECIMAL dan TIDAK
--   dipakai kode; tetap dibiarkan agar migrasi lama tidak rusak.
-- - RLS default-deny + FORCE pada setiap tabel tenant-scoped.

-- ── 1. service_item (katalog §11.2) ──────────────────────────────────────────
-- Master data produk/jasa yang dijual. Harga unit di sini bisa berubah; order
-- men snapshot harga saat order dibuat (lihat order_item.unit_price_cents).

CREATE TABLE IF NOT EXISTS chai.service_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  sku VARCHAR(100) NOT NULL, -- identifier produk stabil
  name VARCHAR(255) NOT NULL,
  description TEXT,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'archived'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_service_item_tenant
  ON chai.service_item(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_item_status
  ON chai.service_item(tenant_id, status);

ALTER TABLE chai.service_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.service_item FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.service_item
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.service_item FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.service_item TO chai_app_runtime, chai_worker_runtime;

-- ── 2. order / order_item (§11.3) ────────────────────────────────────────────
-- order = pesanan konkret. order_item = baris anak, FK ke service_item,
-- menyimpan kuantitas + SNAPSHOT harga saat order dibuat (immutable per-order).
-- Atribusi (channel/campaign/conversation/agent) di order sesuai §11.6
-- "attribution dimensions".

CREATE TABLE IF NOT EXISTS chai.order (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  contact_id UUID, -- nullable: pelanggan mungkin anonim
  external_order_id VARCHAR(255), -- id di sistem eksternal jika disinkron
  status VARCHAR(50) NOT NULL DEFAULT 'open', -- 'open', 'confirmed', 'cancelled', 'fulfilled'
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
  total_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  -- atribusi (§11.6): dimensi yang dicatat untuk analytics
  channel_id UUID,
  campaign_id UUID,
  conversation_id UUID,
  agent_id UUID,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_tenant
  ON chai.order(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_contact
  ON chai.order(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_order_status
  ON chai.order(tenant_id, status);

ALTER TABLE chai.order ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.order FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.order
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.order FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.order TO chai_app_runtime, chai_worker_runtime;

-- order_item: baris anak order. Snapshot harga immutable setelah insert.
CREATE TABLE IF NOT EXISTS chai.order_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES chai.order(id) ON DELETE CASCADE,
  service_item_id UUID REFERENCES chai.service_item(id),
  sku VARCHAR(100) NOT NULL, -- snapshot sku saat order
  name VARCHAR(255) NOT NULL, -- snapshot nama saat order
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0), -- snapshot harga
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0), -- unit_price * quantity
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id, service_item_id)
);

CREATE INDEX IF NOT EXISTS idx_order_item_order
  ON chai.order_item(order_id);
CREATE INDEX IF NOT EXISTS idx_order_item_tenant
  ON chai.order_item(tenant_id);

ALTER TABLE chai.order_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.order_item FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.order_item
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.order_item FROM PUBLIC;
GRANT SELECT, INSERT ON chai.order_item TO chai_app_runtime, chai_worker_runtime;
-- tidak ada UPDATE/DELETE: order_item immutable (snapshot harga).

-- ── 3. invoice (§11.4) ──────────────────────────────────────────────────────
-- Tagihan yang menagih order. total_cents = SUM(order_item.line_total_cents).
-- Immutable setelah diterbitkan (status 'issued'); pembayaran memproyeksikan
-- status kembali ke invoice via paid_at, bukan mengubah total.

CREATE TABLE IF NOT EXISTS chai.invoice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES chai.order(id),
  external_invoice_number VARCHAR(255), -- id/number di sistem eksternal
  status VARCHAR(50) NOT NULL DEFAULT 'issued', -- 'issued', 'paid', 'void', 'overdue'
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
  payment_link VARCHAR(512),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_tenant
  ON chai.invoice(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoice_order
  ON chai.invoice(tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_invoice_status
  ON chai.invoice(tenant_id, status);

ALTER TABLE chai.invoice ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.invoice FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.invoice
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.invoice FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.invoice TO chai_app_runtime, chai_worker_runtime;

-- ── 4. chai.payment: tambah order_id/invoice_id nullable (§11.6) ────────────
-- payment sekarang mereferensi invoice (atau order langsung). amount_cents
-- TIDAK lagi dari input klien — dihitung server-side dari invoice/order.
-- Kolom order_id/invoice_id nullable untuk backward-compat dengan payment
-- lama yang belum terkait order.

ALTER TABLE chai.payment
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES chai.order(id);
ALTER TABLE chai.payment
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES chai.invoice(id);

CREATE INDEX IF NOT EXISTS idx_payment_order
  ON chai.payment(tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_payment_invoice
  ON chai.payment(tenant_id, invoice_id);

-- ── 5. Trigger: order.total_cents = SUM(order_item.line_total_cents) ─────────
-- Memastikan order.total_cents selalu konsisten dengan baris order_item.
-- Money immutable: trigger menolak UPDATE yang mengubah line_total_cents
-- setelah insert (menutup REQ-17-021 dari sisi data).

CREATE OR REPLACE FUNCTION chai.recompute_order_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chai.order
  SET total_cents = (
    SELECT COALESCE(SUM(line_total_cents), 0)
    FROM chai.order_item
    WHERE order_id = COALESCE(NEW.order_id, OLD.order_id)
  ),
  updated_at = NOW()
  WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_item_total_recompute ON chai.order_item;
CREATE TRIGGER order_item_total_recompute
  AFTER INSERT OR DELETE ON chai.order_item
  FOR EACH ROW EXECUTE FUNCTION chai.recompute_order_total();

-- Immobilisasi order_item: tolak UPDATE pada unit_price_cents/quantity/
-- line_total_cents (snapshot harga immutable per-order).
CREATE OR REPLACE FUNCTION chai.order_item_is_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.unit_price_cents IS DISTINCT FROM OLD.unit_price_cents
       OR NEW.quantity IS DISTINCT FROM OLD.quantity
       OR NEW.line_total_cents IS DISTINCT FROM OLD.line_total_cents
       OR NEW.service_item_id IS DISTINCT FROM OLD.service_item_id THEN
      RAISE EXCEPTION 'order_item is immutable after insert (snapshot harga): %', TG_OP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_item_immutable ON chai.order_item;
CREATE TRIGGER order_item_immutable
  BEFORE UPDATE ON chai.order_item
  FOR EACH ROW EXECUTE FUNCTION chai.order_item_is_immutable();

-- Immobilisasi invoice.total_cents: tolak UPDATE yang mengubah total setelah
-- status 'issued' (invoice paid projection via paid_at, bukan ubah total).
CREATE OR REPLACE FUNCTION chai.invoice_total_is_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'issued' THEN
    IF NEW.total_cents IS DISTINCT FROM OLD.total_cents THEN
      RAISE EXCEPTION 'invoice.total_cents is immutable after issued: %', TG_OP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoice_total_immutable ON chai.invoice;
CREATE TRIGGER invoice_total_immutable
  BEFORE UPDATE ON chai.invoice
  FOR EACH ROW EXECUTE FUNCTION chai.invoice_total_is_immutable();

RESET ROLE;
