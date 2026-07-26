import { describe, it, expect, beforeEach } from 'vitest';

import {
  KillSwitchRuntime,
  generateKillSwitchEventId,
  getKillSwitchRuntime,
  resetKillSwitchRuntime,
} from '../kill-switch';

describe('KillSwitchRuntime', () => {
  let runtime: KillSwitchRuntime;

  beforeEach(() => {
    runtime = new KillSwitchRuntime({});
  });

  it('is not tripped by default', () => {
    expect(runtime.isTripped('payment')).toBe(false);
    expect(runtime.isTripped('channel')).toBe(false);
    expect(runtime.isTripped('logistics')).toBe(false);
    expect(runtime.isTripped('calendar')).toBe(false);
  });

  it('trips via env var (global)', () => {
    const envRuntime = new KillSwitchRuntime({ KILL_SWITCH_PAYMENT: '1' });
    expect(envRuntime.isTripped('payment')).toBe(true);
    expect(envRuntime.isTripped('channel')).toBe(false);
  });

  it('trips via env var with "true" value', () => {
    const envRuntime = new KillSwitchRuntime({ KILL_SWITCH_CALENDAR: 'true' });
    expect(envRuntime.isTripped('calendar')).toBe(true);
  });

  it('does not trip for env var with other values', () => {
    const envRuntime = new KillSwitchRuntime({ KILL_SWITCH_PAYMENT: '0' });
    expect(envRuntime.isTripped('payment')).toBe(false);
  });

  it('trips via per-tenant DB toggle', () => {
    runtime.setDbToggle('payment', 'tenant-1', true);
    expect(runtime.isTripped('payment', 'tenant-1')).toBe(true);
    expect(runtime.isTripped('payment', 'tenant-2')).toBe(false);
    expect(runtime.isTripped('payment')).toBe(false);
  });

  it('trips via owner toggle', () => {
    runtime.setOwnerToggle('channel', true, 'Meta outage');
    expect(runtime.isTripped('channel')).toBe(true);
    expect(runtime.isTripped('channel', 'tenant-1')).toBe(true);
  });

  it('clears owner toggle', () => {
    runtime.setOwnerToggle('channel', true, 'Meta outage');
    expect(runtime.isTripped('channel')).toBe(true);

    runtime.clearOwnerToggle('channel');
    expect(runtime.isTripped('channel')).toBe(false);
  });

  it('clears DB toggles for a tenant', () => {
    runtime.setDbToggle('payment', 'tenant-1', true);
    runtime.setDbToggle('channel', 'tenant-1', true);
    expect(runtime.isTripped('payment', 'tenant-1')).toBe(true);

    runtime.clearDbToggles('tenant-1');
    expect(runtime.isTripped('payment', 'tenant-1')).toBe(false);
    expect(runtime.isTripped('channel', 'tenant-1')).toBe(false);
  });

  it('any tripped layer trips the switch', () => {
    runtime.setDbToggle('payment', 'tenant-1', true);
    expect(runtime.isTripped('payment', 'tenant-1')).toBe(true);

    runtime.setDbToggle('payment', 'tenant-1', false);
    runtime.setOwnerToggle('payment', true, 'Manual override');
    expect(runtime.isTripped('payment', 'tenant-1')).toBe(true);
  });

  it('returns state with source info', () => {
    const envRuntime = new KillSwitchRuntime({ KILL_SWITCH_PAYMENT: '1' });
    envRuntime.setDbToggle('channel', 'tenant-1', true);
    envRuntime.setOwnerToggle('logistics', true, 'JNE outage');

    const paymentState = envRuntime.getState('payment');
    expect(paymentState).toHaveLength(1);
    expect(paymentState[0]?.source).toBe('env');

    const channelState = envRuntime.getState('channel', 'tenant-1');
    expect(channelState).toHaveLength(1);
    expect(channelState[0]?.source).toBe('db');
    expect(channelState[0]?.tenantId).toBe('tenant-1');

    const logisticsState = envRuntime.getState('logistics');
    expect(logisticsState).toHaveLength(1);
    expect(logisticsState[0]?.source).toBe('owner');
    expect(logisticsState[0]?.reason).toBe('JNE outage');
  });

  it('returns empty state when not tripped', () => {
    const state = runtime.getState('payment');
    expect(state).toHaveLength(0);
  });

  it('reset clears all toggles', () => {
    runtime.setDbToggle('payment', 'tenant-1', true);
    runtime.setOwnerToggle('channel', true, 'test');

    runtime.reset();

    expect(runtime.isTripped('payment', 'tenant-1')).toBe(false);
    expect(runtime.isTripped('channel')).toBe(false);
  });
});

describe('KillSwitchRuntime singleton', () => {
  beforeEach(() => {
    resetKillSwitchRuntime();
  });

  it('returns the same instance on repeated calls', () => {
    const r1 = getKillSwitchRuntime({});
    const r2 = getKillSwitchRuntime({});
    expect(r1).toBe(r2);
  });

  it('resetKillSwitchRuntime creates a new instance', () => {
    const r1 = getKillSwitchRuntime({});
    resetKillSwitchRuntime();
    const r2 = getKillSwitchRuntime({});
    expect(r1).not.toBe(r2);
  });
});

describe('generateKillSwitchEventId', () => {
  it('generates a unique UUID', () => {
    const id1 = generateKillSwitchEventId();
    const id2 = generateKillSwitchEventId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
