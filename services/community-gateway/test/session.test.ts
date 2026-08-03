import { describe, expect, it } from 'vitest';

import { CommunitySession } from '../src/session';

describe('CommunitySession', () => {
  it('starts disconnected and enters pairing', () => {
    const session = new CommunitySession();
    expect(session.getState()).toBe('DISCONNECTED');
    session.startPairing();
    expect(session.getState()).toBe('PAIRING');
  });

  it('connects, resets attempts, and records heartbeats', () => {
    let clock = 1_000;
    const session = new CommunitySession({ now: () => clock });
    session.startPairing();
    session.markConnected();
    expect(session.isActive()).toBe(true);
    expect(session.getLastHeartbeatAt()).toBe(1_000);
    clock = 2_000;
    session.heartbeat();
    expect(session.getLastHeartbeatAt()).toBe(2_000);
  });

  it('reconnects with exponential backoff, capped at maxBackoffMs', () => {
    const session = new CommunitySession({
      baseBackoffMs: 1_000,
      maxBackoffMs: 4_000,
      maxReconnectAttempts: 10,
    });
    session.markConnected();
    expect(session.handleDisconnect('NETWORK')).toBe(1_000);
    expect(session.getState()).toBe('RECONNECTING');
    expect(session.handleDisconnect('NETWORK')).toBe(2_000);
    expect(session.handleDisconnect('NETWORK')).toBe(4_000);
    expect(session.handleDisconnect('NETWORK')).toBe(4_000);
  });

  it('quarantines on a fatal disconnect reason', () => {
    const session = new CommunitySession();
    session.markConnected();
    expect(session.handleDisconnect('BANNED')).toBeNull();
    expect(session.getState()).toBe('QUARANTINED');
    expect(session.isQuarantined()).toBe(true);
    expect(session.getDisconnectReason()).toBe('BANNED');
  });

  it('quarantines after exhausting the reconnect budget', () => {
    const session = new CommunitySession({ maxReconnectAttempts: 2 });
    session.markConnected();
    expect(session.handleDisconnect('NETWORK')).not.toBeNull();
    expect(session.handleDisconnect('NETWORK')).not.toBeNull();
    expect(session.handleDisconnect('NETWORK')).toBeNull();
    expect(session.getState()).toBe('QUARANTINED');
  });

  it('is terminal once quarantined', () => {
    const session = new CommunitySession();
    session.quarantine('manual');
    session.startPairing();
    session.markConnected();
    expect(session.getState()).toBe('QUARANTINED');
  });

  it('resets attempts once reconnected', () => {
    const session = new CommunitySession();
    session.markConnected();
    session.handleDisconnect('NETWORK');
    expect(session.getAttempts()).toBe(1);
    session.markReconnected();
    expect(session.getState()).toBe('CONNECTED');
    expect(session.getAttempts()).toBe(0);
  });
});
