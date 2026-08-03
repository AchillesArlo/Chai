SET ROLE chai_migration_owner;

DROP INDEX IF EXISTS chai.payment_tenant_idempotency_uidx;

CREATE UNIQUE INDEX payment_tenant_idempotency_uidx
  ON chai.payment(
    tenant_id,
    idempotency_key,
    COALESCE(order_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(invoice_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE idempotency_key IS NOT NULL;

RESET ROLE;
