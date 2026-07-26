-- Fase 2 (R-10): payment state precedence and money immutability.
--
-- Two defects this closes:
--
-- 1. There was nothing recording WHEN the provider observed a status, so an
--    out-of-order redelivery could overwrite a newer state. `status_event_at`
--    carries the provider event time so precedence is by provider clock, not by
--    arrival order (17_PAYMENT §6.2).
-- 2. `amount_cents` and `currency` were freely updatable. Blueprint 05 §15 and
--    17_PAYMENT §6.1 require them to be immutable once a payment exists: a
--    correction is a replacement request, never an edit, otherwise the amount a
--    customer approved and the amount charged can silently diverge.
--
-- Enforced by trigger rather than by convention, because the API is not the only
-- possible writer.

SET ROLE chai_migration_owner;

ALTER TABLE chai.payment
  ADD COLUMN IF NOT EXISTS status_event_at timestamptz;

CREATE OR REPLACE FUNCTION chai.payment_money_is_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.amount_cents <> OLD.amount_cents THEN
    RAISE EXCEPTION 'PAYMENT_AMOUNT_IMMUTABLE'
      USING HINT = 'Issue a replacement payment request instead of editing the amount.';
  END IF;
  IF NEW.currency <> OLD.currency THEN
    RAISE EXCEPTION 'PAYMENT_CURRENCY_IMMUTABLE'
      USING HINT = 'Issue a replacement payment request instead of editing the currency.';
  END IF;
  IF NEW.external_id <> OLD.external_id THEN
    RAISE EXCEPTION 'PAYMENT_EXTERNAL_ID_IMMUTABLE'
      USING HINT = 'The provider reference identifies the attempt and cannot be reassigned.';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS payment_money_immutable ON chai.payment;
CREATE TRIGGER payment_money_immutable
  BEFORE UPDATE ON chai.payment
  FOR EACH ROW
  EXECUTE FUNCTION chai.payment_money_is_immutable();

RESET ROLE;
