-- 0057_drop_state_machine_facades.sql
-- D2: remove the redundant public-schema facade tables abandoned by the deleted
-- in-memory API modules (outbox, command-event, payment-state-machine,
-- shipment-state-machine, job-queue).
--
-- Each duplicated an authoritative chai.* pipeline and was never wired to it —
-- the API modules that owned these tables were in-memory only, so nothing ever
-- read or wrote them in production:
--   public.outbox_events / event_subscriptions        -> chai.outbox_event (0001) + packages/broker + workers/outbox-dispatcher
--   public.commands / domain_events                    -> chai.outbox_event via commitBusinessMutation + chai.idempotency_record (0041)
--   public.payment_requests / payment_attempts / refunds / disputes
--                                                      -> chai.payment (0010, integer minor units) + decidePaymentTransition + payment-worker
--   public.shipments / shipment_events / shipment_packages
--                                                      -> chai.shipment (0011) + logistics-worker
--   public.job_queues / jobs / job_attempts            -> inbox/outbox dispatchers + chai.follow_up_job (0008) + Temporal + DLQ
--
-- public.payment_requests/payment_attempts/refunds/disputes stored money as
-- DECIMAL(15,2): a standing violation of the integer-minor-units invariant and
-- a second source of truth for payment status. Dropping them removes both.
--
-- Not wrapped in SET ROLE chai_migration_owner: like 0040, these public tables
-- are owned by the migrating user, and DROP TABLE requires ownership. CASCADE
-- removes the RLS policies 0040 added and the intra-group FKs. IF EXISTS keeps
-- the migration idempotent and tolerant of databases where 0034-0039 predate a
-- partial apply.

-- Job queue (0039): job_attempts -> jobs -> job_queues
DROP TABLE IF EXISTS public.job_attempts CASCADE;
DROP TABLE IF EXISTS public.jobs CASCADE;
DROP TABLE IF EXISTS public.job_queues CASCADE;

-- Shipment state machine (0037): events/packages -> shipments
DROP TABLE IF EXISTS public.shipment_events CASCADE;
DROP TABLE IF EXISTS public.shipment_packages CASCADE;
DROP TABLE IF EXISTS public.shipments CASCADE;

-- Payment state machine (0036): attempts/refunds/disputes -> payment_requests
DROP TABLE IF EXISTS public.payment_attempts CASCADE;
DROP TABLE IF EXISTS public.refunds CASCADE;
DROP TABLE IF EXISTS public.disputes CASCADE;
DROP TABLE IF EXISTS public.payment_requests CASCADE;

-- Command/event lifecycle (0035): domain_events -> commands
DROP TABLE IF EXISTS public.domain_events CASCADE;
DROP TABLE IF EXISTS public.commands CASCADE;

-- Outbox facade (0034)
DROP TABLE IF EXISTS public.outbox_events CASCADE;
DROP TABLE IF EXISTS public.event_subscriptions CASCADE;
