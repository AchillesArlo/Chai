-- Carries the W3C trace context across the outbox boundary.
--
-- Without it a trace stops at the API transaction: the worker that performs the
-- external effect starts a brand-new trace, so the one thing an operator needs
-- during an incident -- "which request caused this failed delivery?" -- cannot be
-- answered. Nullable because events written before this migration have none, and
-- because a trace context is diagnostic data: a missing one must never block a
-- business event from being appended.
ALTER TABLE chai.outbox_event
  ADD COLUMN IF NOT EXISTS traceparent text;

-- W3C traceparent is a fixed-shape header: version-traceid-spanid-flags.
-- Rejecting anything else keeps a malformed value from silently breaking the
-- dispatcher's context extraction.
ALTER TABLE chai.outbox_event
  ADD CONSTRAINT outbox_event_traceparent_shape
  CHECK (
    traceparent IS NULL
    OR traceparent ~ '^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$'
  );