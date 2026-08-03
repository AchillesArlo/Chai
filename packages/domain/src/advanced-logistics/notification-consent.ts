/**
 * Consent-compliant notification gate (REQ-17-069; Blueprint 07 §10.6 shipment
 * milestone "with consent/channel policy", and the OPT_OUT stop reason).
 *
 * A milestone or reminder notification may go out only to a channel that is
 * (1) configured/connected for the tenant AND (2) one the contact has not
 * opted out of. This is where that policy is enforced before a send, so a
 * notification can never reach a channel without consent. It is a pure
 * decision — the caller supplies the tenant's configured channels and the
 * contact's per-channel consent (from wherever consent is recorded).
 */

export type NotificationChannel =
  | 'IN_APP'
  | 'EMAIL'
  | 'PUSH'
  | 'WHATSAPP'
  | 'SMS';

export interface ChannelConsent {
  channel: NotificationChannel;
  /** Whether the contact consents to being contacted on this channel. */
  consented: boolean;
}

export interface NotificationConsentContext {
  targetChannel: NotificationChannel;
  /** Channels the tenant has configured/connected. */
  configuredChannels: readonly NotificationChannel[];
  /** Per-channel consent for the contact. */
  consents: readonly ChannelConsent[];
}

export type NotificationConsentDecision =
  | { kind: 'ALLOW' }
  | { kind: 'BLOCK'; reason: 'CHANNEL_NOT_CONFIGURED' | 'NO_CONSENT' };

/**
 * Decides whether a notification may be sent on the target channel. Fails
 * closed: an unconfigured channel, a missing consent record, or an explicit
 * opt-out all BLOCK.
 */
export function decideNotificationConsent(
  ctx: NotificationConsentContext,
): NotificationConsentDecision {
  if (!ctx.configuredChannels.includes(ctx.targetChannel)) {
    return { kind: 'BLOCK', reason: 'CHANNEL_NOT_CONFIGURED' };
  }
  const consent = ctx.consents.find(
    (entry) => entry.channel === ctx.targetChannel,
  );
  // Absence of a consent record is NOT consent.
  if (consent === undefined || !consent.consented) {
    return { kind: 'BLOCK', reason: 'NO_CONSENT' };
  }
  return { kind: 'ALLOW' };
}

/** Throws unless the notification may be sent. Use at the send boundary. */
export function assertNotificationConsent(
  ctx: NotificationConsentContext,
): void {
  const decision = decideNotificationConsent(ctx);
  if (decision.kind === 'BLOCK') {
    throw new Error(`NOTIFICATION_BLOCKED:${decision.reason}`);
  }
}
