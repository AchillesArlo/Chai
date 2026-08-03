import { describe, it, expect } from 'vitest';
import {
  calculateEffectiveCapabilities,
  isCapabilityAllowedForAI,
} from '../src/capabilities/intersection';

describe('Capability Intersection (REQ-09-003, REQ-08-036)', () => {
  it('returns only capabilities present in ALL four sets (connector ∩ channel ∩ entitlement ∩ policy)', () => {
    const sets = {
      connectorCapabilities: ['read_messages', 'send_messages', 'webhook_ingest', 'create_shipment'],
      channelCapabilities: ['read_messages', 'send_messages', 'create_shipment'],
      tenantEntitlements: ['read_messages', 'send_messages', 'whatsapp_messaging'],
      policyAllowedCapabilities: ['read_messages', 'send_messages', 'create_shipment'],
    };

    const effective = calculateEffectiveCapabilities(sets);
    expect(effective).toEqual(['read_messages', 'send_messages']);
    expect(effective).not.toContain('create_shipment'); // missing from tenantEntitlements
    expect(effective).not.toContain('webhook_ingest'); // missing from channelCapabilities
  });

  it('returns empty array if any set has no overlap', () => {
    const sets = {
      connectorCapabilities: ['cap_a'],
      channelCapabilities: ['cap_b'],
      tenantEntitlements: ['cap_a'],
      policyAllowedCapabilities: ['cap_a'],
    };

    expect(calculateEffectiveCapabilities(sets)).toHaveLength(0);
  });

  it('rejects AI capability selection outside effective intersection (REQ-08-036)', () => {
    const effective = ['read_messages', 'send_messages'];

    expect(isCapabilityAllowedForAI('read_messages', effective)).toBe(true);
    expect(isCapabilityAllowedForAI('create_shipment', effective)).toBe(false);
  });
});
