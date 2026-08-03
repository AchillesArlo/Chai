-- 0086_secret_refs.sql
-- FASE 5 — Rahasia dan kredensial.
--
-- Menutup REQ-10-022, REQ-05-003, REQ-17-011, REQ-17-049, REQ-17-058,
-- REQ-09-029: secret konektor / webhook / payment provider tidak boleh
-- tersimpan plaintext di kolom DB. Kolom DB hanya menyimpan REFERENSI ke
-- SecretService (format `v1:{tenantId}:{key}:{version}`); plaintext
-- dienkripsi AES-256-GCM dan disimpan lewat SecretManager (lihat
-- apps/api/src/modules/secret/).
--
-- Perubahan:
-- 1. connector_secrets.secret_value_encrypted BYTEA -> dipertahankan sebagai
--    `secret_value_legacy_encrypted` (nullable, untuk migrasi data jika
--    diperlukan) dan kolom baru `secret_value_ref TEXT NOT NULL` menyimpan
--    referensi vault. Unique constraint diperbarui ke (config, key, ref)
--    karena version sekarang bagian dari ref.
-- 2. chai.webhook_subscription.signing_secret text -> signing_secret_ref text
--    (referensi vault). Kolom lama di-rename ke signing_secret_legacy untuk
--    transisi.
-- 3. Tabel baru chai.payment_provider_account per-tenant dengan RLS
--    default-deny (REQ-17-058): kredensial payment gateway per-tenant, bukan
--    global dari env.
--
-- CATATAN (koreksi pasca-tulis, sebelum migrasi ini pernah berhasil jalan di
-- database manapun — belum ada commit git untuk file ini): bagian 1 di bawah
-- (connector_secrets) TIDAK memakai `SET ROLE chai_migration_owner`, berbeda
-- dari bagian 2 dan 3. `connector_secrets` dibuat di 0031_connector_config.sql
-- TANPA SET ROLE (jadi dimiliki superuser koneksi migrasi), sementara
-- `chai.webhook_subscription` dibuat di 0016_marketplace_and_webhooks.sql
-- DENGAN SET ROLE (dimiliki chai_migration_owner). Mengubah connector_secrets
-- lewat chai_migration_owner gagal keras ("must be owner of table
-- connector_secrets", SQLSTATE 42501) karena role itu bukan pemiliknya.
-- Pola pemisahan ini sama dengan pelajaran 0082_jsonb_repair_effective.sql:
-- jangan SET ROLE untuk operasi pada tabel yang tidak dimiliki role itu.

-- ── 1. connector_secrets: ganti kolom plaintext-enc dengan ref ───────────────
-- TANPA SET ROLE — connector_secrets dimiliki superuser koneksi migrasi.

ALTER TABLE public.connector_secrets
  RENAME COLUMN secret_value_encrypted TO secret_value_legacy_encrypted;
ALTER TABLE public.connector_secrets
  ALTER COLUMN secret_value_legacy_encrypted DROP NOT NULL;

ALTER TABLE public.connector_secrets
  ADD COLUMN IF NOT EXISTS secret_value_ref TEXT NOT NULL DEFAULT '';

-- Unique constraint lama (config_id, key, version) tidak lagi relevan karena
-- version sekarang di-embed di ref. Ganti dengan unique (config_id, key, ref)
-- untuk mencegah duplikat ref yang sama per (config, key).
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT con.conname INTO con_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'connector_secrets'
    AND con.contype = 'u'
    AND con.conkey = (
      SELECT array_agg(attnum ORDER BY attnum)
      FROM pg_attribute
      WHERE attrelid = rel.oid
        AND attname IN ('connector_config_id', 'secret_key', 'secret_version')
    );
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.connector_secrets DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.connector_secrets
  ADD CONSTRAINT connector_secrets_config_key_ref_unique
  UNIQUE (connector_config_id, secret_key, secret_value_ref);

-- ── 2. webhook_subscription: signing_secret -> signing_secret_ref ────────────
-- chai.webhook_subscription DIMILIKI chai_migration_owner (dibuat dengan
-- SET ROLE di 0016_marketplace_and_webhooks.sql), jadi SET ROLE di sini aman.

SET ROLE chai_migration_owner;

ALTER TABLE chai.webhook_subscription
  RENAME COLUMN signing_secret TO signing_secret_legacy;
ALTER TABLE chai.webhook_subscription
  ALTER COLUMN signing_secret_legacy DROP NOT NULL;

ALTER TABLE chai.webhook_subscription
  ADD COLUMN IF NOT EXISTS signing_secret_ref TEXT;

-- ── 3. payment_provider_account per-tenant (REQ-17-058) ──────────────────────

CREATE TABLE IF NOT EXISTS chai.payment_provider_account (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  provider VARCHAR(50) NOT NULL, -- 'midtrans', 'stripe', 'xendit', etc.
  account_ref VARCHAR(255) NOT NULL, -- merchant id / account identifier (non-secret)
  secret_ref TEXT NOT NULL, -- vault reference to server_key / api_key (encrypted at-rest)
  webhook_secret_ref TEXT, -- vault reference to webhook signing secret (optional, per-provider)
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'inactive', 'suspended'
  created_by UUID NOT NULL,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, provider, account_ref)
);

CREATE INDEX IF NOT EXISTS idx_payment_provider_account_tenant
  ON chai.payment_provider_account(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_provider_account_provider
  ON chai.payment_provider_account(tenant_id, provider, status);

ALTER TABLE chai.payment_provider_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.payment_provider_account FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON chai.payment_provider_account
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.payment_provider_account FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON chai.payment_provider_account
  TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
