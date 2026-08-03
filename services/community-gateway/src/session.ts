/**
 * Community WhatsApp Web session lifecycle (FASE 25; blueprint §11.5.3).
 *
 * Pure state machine — no I/O and no business logic. The real transport
 * (WAHA/Baileys) drives it via events; the gateway reads its state to decide
 * whether the channel may run. A fatal disconnect (ban/logout) or exhausted
 * reconnect budget lands in QUARANTINED, which is terminal until an operator
 * re-pairs.
 *
 * ponytail: in-memory session state. Encrypted per-account persistence is an
 * injected concern for the real transport; the state machine itself is
 * side-effect free so it can be snapshotted wherever the transport stores it.
 */
export type CommunitySessionState =
  | 'PAIRING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'DISCONNECTED'
  | 'QUARANTINED';

export interface CommunitySessionOptions {
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  maxReconnectAttempts?: number;
  now?: () => number;
}

/** Disconnects we must not retry — retrying a banned/logged-out number is harmful. */
const FATAL_DISCONNECT_REASONS = new Set(['BANNED', 'LOGGED_OUT', 'CONFLICT']);

export class CommunitySession {
  private state: CommunitySessionState = 'DISCONNECTED';
  private attempts = 0;
  private lastHeartbeatAt: number | null = null;
  private disconnectReason: string | null = null;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly maxReconnectAttempts: number;
  private readonly now: () => number;

  constructor(options: CommunitySessionOptions = {}) {
    this.baseBackoffMs = options.baseBackoffMs ?? 1_000;
    this.maxBackoffMs = options.maxBackoffMs ?? 60_000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
    this.now = options.now ?? ((): number => Date.now());
  }

  getState(): CommunitySessionState {
    return this.state;
  }

  getDisconnectReason(): string | null {
    return this.disconnectReason;
  }

  getAttempts(): number {
    return this.attempts;
  }

  getLastHeartbeatAt(): number | null {
    return this.lastHeartbeatAt;
  }

  isActive(): boolean {
    return this.state === 'CONNECTED';
  }

  isQuarantined(): boolean {
    return this.state === 'QUARANTINED';
  }

  /** Begin QR/code pairing. */
  startPairing(): void {
    if (this.state === 'QUARANTINED') return;
    this.state = 'PAIRING';
  }

  /** Pairing/authentication succeeded. */
  markConnected(): void {
    if (this.state === 'QUARANTINED') return;
    this.state = 'CONNECTED';
    this.attempts = 0;
    this.disconnectReason = null;
    this.lastHeartbeatAt = this.now();
  }

  heartbeat(): void {
    if (this.state !== 'CONNECTED') return;
    this.lastHeartbeatAt = this.now();
  }

  /**
   * Handle a dropped session. Returns the backoff before the next reconnect
   * attempt, or `null` when the session was quarantined (fatal reason or the
   * reconnect budget is exhausted).
   */
  handleDisconnect(reason: string): number | null {
    this.disconnectReason = reason;
    if (FATAL_DISCONNECT_REASONS.has(reason)) {
      this.state = 'QUARANTINED';
      return null;
    }
    this.attempts += 1;
    if (this.attempts > this.maxReconnectAttempts) {
      this.state = 'QUARANTINED';
      return null;
    }
    this.state = 'RECONNECTING';
    return this.nextBackoffMs();
  }

  markReconnected(): void {
    if (this.state === 'QUARANTINED') return;
    this.markConnected();
  }

  quarantine(reason: string): void {
    this.state = 'QUARANTINED';
    this.disconnectReason = reason;
  }

  /** Exponential backoff for the current attempt, capped at maxBackoffMs. */
  nextBackoffMs(): number {
    const exponent = Math.max(0, this.attempts - 1);
    return Math.min(this.baseBackoffMs * 2 ** exponent, this.maxBackoffMs);
  }
}
