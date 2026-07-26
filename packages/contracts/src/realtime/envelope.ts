import { z } from 'zod';

export const ServerSentEventSchema = z.strictObject({
  /**
   * Aggregate the event describes. Required for domain events so a client can
   * order them per aggregate; control events (see below) carry neither this nor
   * a version.
   */
  aggregateId: z.string().min(1).max(200).optional(),
  data: z.unknown(),
  event: z.string().min(1).max(100),
  id: z.string().min(1).max(200),
  /**
   * Aggregate version this event reflects. Clients apply an event only when the
   * version is newer than what they hold, and refetch otherwise (06_API §11).
   */
  version: z.number().int().nonnegative().optional(),
});

export type ServerSentEvent = z.infer<typeof ServerSentEventSchema>;

export const RefetchRequiredEventSchema = z.strictObject({
  control: z.literal('refetch-required'),
  reason: z.string().min(1).max(200),
});

export type RefetchRequiredEvent = z.infer<typeof RefetchRequiredEventSchema>;

export const SUBSCRIPTION_CONTROL_EVENTS = ['refetch-required'] as const;

export type VersionGateDecision = 'APPLY' | 'IGNORE_STALE' | 'REFETCH_REQUIRED';

/**
 * Decides what a client should do with an incoming domain event.
 *
 * - newer version, exactly one step ahead, or first sighting -> APPLY
 * - same or older version -> IGNORE_STALE (a duplicate or out-of-order redelivery)
 * - a gap in versions -> REFETCH_REQUIRED, because the client is missing state
 *   it can no longer reconstruct from the stream alone
 *
 * Events without a version are control/ephemeral traffic and always apply.
 */
export function decideVersionGate(
  seenVersion: number | undefined,
  event: Pick<ServerSentEvent, 'version'>,
): VersionGateDecision {
  if (event.version === undefined) {
    return 'APPLY';
  }
  if (seenVersion === undefined) {
    return 'APPLY';
  }
  if (event.version <= seenVersion) {
    return 'IGNORE_STALE';
  }
  return event.version === seenVersion + 1 ? 'APPLY' : 'REFETCH_REQUIRED';
}
