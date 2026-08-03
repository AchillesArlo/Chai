import { describe, expect, it } from 'vitest';

import { killSwitchProviderFor } from './actions.controller';

describe('killSwitchProviderFor', () => {
  it('maps payment tools to the payment connector kill switch', () => {
    expect(killSwitchProviderFor('payment.get_status')).toBe('payment');
    expect(killSwitchProviderFor('payment.create_link')).toBe('payment');
  });

  it('maps shipment tools to the logistics connector kill switch', () => {
    expect(killSwitchProviderFor('shipment.get_status')).toBe('logistics');
    expect(killSwitchProviderFor('shipment.create')).toBe('logistics');
  });

  it('maps appointment and calendar tools to the calendar connector kill switch', () => {
    expect(killSwitchProviderFor('appointment.create')).toBe('calendar');
    expect(killSwitchProviderFor('calendar.check_availability')).toBe('calendar');
  });

  it('returns null for a tool with no connector-level kill switch', () => {
    expect(killSwitchProviderFor('knowledge.search')).toBeNull();
    expect(killSwitchProviderFor('order.get')).toBeNull();
  });

  it('returns null for an unknown or malformed tool name', () => {
    expect(killSwitchProviderFor('not-a-real-tool')).toBeNull();
    expect(killSwitchProviderFor('')).toBeNull();
  });
});
