-- Migration 0095: link a shipment to its order (REQ-17-071, multi-package).
--
-- FASE 22. Until now chai.shipment had no structural link to chai.order: a
-- shipment recorded only a free-text order_reference (0045) used as a
-- customer-lookup proof token, not a real relationship. Multi-package
-- fulfilment needs the inverse — ONE order fanned out across MANY shipments
-- (one per package). That is expressed here as simply as possible: order_id is
-- a plain, NULLABLE column, so a single order id may appear on any number of
-- shipment rows. There is no junction table and no unique constraint on
-- order_id, so "one order, many packages" is the default and needs nothing
-- more.
--
-- Nullable on purpose: shipments linked before this column existed, and any
-- shipment a tenant never associates with an order, keep order_id NULL.
--
-- Tenant safety: the FK targets chai.order(id) only. PostgreSQL runs
-- referential-integrity checks with row security off, so the FK alone does not
-- prove same-tenant ownership. In practice the app only ever supplies an
-- order_id it first read under the tenant's own RLS scope, and every lookup
-- filters (tenant_id, order_id) through the index below. A DB-level composite
-- FK (tenant_id, order_id) would additionally require a UNIQUE key on
-- chai.order(tenant_id, id) — an order-table change deliberately left out of
-- this minimal, order-lifecycle-preserving scope (see the plan doc's FASE 22).
--
-- Out of scope (still deferred): per-item partial-fulfilment tracking (which
-- order_item ships in which package) and any change to when an order becomes
-- 'fulfilled'. That remains a larger data-model + business decision.
--
-- chai.shipment is owned by chai_migration_owner (0011); ALTER TABLE requires
-- ownership, so switch role exactly as 0045 did when it last altered this table.
SET ROLE chai_migration_owner;

ALTER TABLE chai.shipment
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES chai.order(id);

CREATE INDEX IF NOT EXISTS idx_shipment_order
  ON chai.shipment(tenant_id, order_id);

RESET ROLE;
