/**
 * Shared webhook timestamp + replay-window verification (REQ-10-016,
 * REQ-09-006, REQ-09-023).
 *
 * A provider webhook signature alone proves the payload was produced by
 * someone holding the shared secret at *some* point — it never expires.
 * Without a timestamp check, a captured (or provider-redelivered) request
 * stays replayable forever. This is the single place that decides "is this
 * event too old / too far in the future to trust", so every provider
 * verifier applies the same rule instead of each carrying its own copy
 * (the same reasoning `decidePaymentTransition` documents for the state
 * machine: one copy, not a divergence waiting to happen).
 *
 * This does NOT replace per-event dedup (a `payment_webhook_event` table,
 * see migration 0083): a timestamp check rejects *stale* events; dedup
 * rejects *repeated* events inside the window. Both are needed — an event
 * replayed 10 seconds later is not stale, but it is still a replay.
 */

/**
 * Parses a provider-claimed event timestamp out of a raw JSON webhook body.
 * Callers pass the result straight to {@link verifyWebhookTimestamp}. Kept
 * here (not per-provider) so every webhook path reads the same two field
 * names instead of each guessing its own.
 */
export function readWebhookEventTime(raw: Uint8Array): Date | null {
  try {
    const body = JSON.parse(Buffer.from(raw).toString('utf8')) as {
      eventAt?: string;
      occurredAt?: string;
    };
    const value = body.eventAt ?? body.occurredAt;
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

/** Default replay window: events older or newer than this are rejected. */
export const DEFAULT_WEBHOOK_REPLAY_WINDOW_SECONDS = 5 * 60;

export interface WebhookTimestampCheck {
  ok: boolean;
  reason?: 'MISSING_TIMESTAMP' | 'TOO_OLD' | 'TOO_FAR_IN_FUTURE';
}

/**
 * Verifies a provider-supplied event timestamp is within the replay window
 * of `now`, in both directions: too old is a replay of a captured request,
 * too far in the future is a forged or clock-skewed sender either way it
 * cannot be trusted as "now".
 */
export function verifyWebhookTimestamp(
  eventAt: Date | null,
  now: Date = new Date(),
  windowSeconds: number = DEFAULT_WEBHOOK_REPLAY_WINDOW_SECONDS,
): WebhookTimestampCheck {
  if (!eventAt || Number.isNaN(eventAt.getTime())) {
    return { ok: false, reason: 'MISSING_TIMESTAMP' };
  }
  const ageSeconds = (now.getTime() - eventAt.getTime()) / 1000;
  if (ageSeconds > windowSeconds) {
    return { ok: false, reason: 'TOO_OLD' };
  }
  if (ageSeconds < -windowSeconds) {
    return { ok: false, reason: 'TOO_FAR_IN_FUTURE' };
  }
  return { ok: true };
}
