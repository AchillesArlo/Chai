import { describe, expect, it } from 'vitest';

import {
  canViewUnmaskedProof,
  decideProofAccess,
  maskProofOfDelivery,
  proofLinkExpired,
  type ProofOfDelivery,
} from './proof-of-delivery';

const POD: ProofOfDelivery = {
  id: 'pod-1',
  tenantId: 'tenant-a',
  shipmentId: 'ship-1',
  artifactRef: 'obj://pod/ship-1.png',
  recipientName: 'John Doe',
  signatureRef: 'obj://sig/ship-1.png',
  deliveredAt: '2026-07-31T10:00:00.000Z',
  capturedBy: 'courier-7',
  createdAt: '2026-07-31T10:01:00.000Z',
};

const OWNER = { contactId: 'contact-1', orderReference: 'ORDER-9' };
const FRESH_LINK = { issuedAtMs: 1_000, ttlMs: 60_000, nowMs: 30_000 };

describe('proof-of-delivery masking', () => {
  it('masks the recipient name to initials and strips artifact/signature refs', () => {
    const masked = maskProofOfDelivery(POD);
    expect(masked.recipientName).toBe('J*** D**');
    expect(masked.masked).toBe(true);
    // The sensitive refs are simply not present on the masked shape.
    expect(masked).not.toHaveProperty('signatureRef');
    expect(masked).not.toHaveProperty('artifactRef');
  });

  it('leaves a null recipient name null', () => {
    expect(maskProofOfDelivery({ ...POD, recipientName: null }).recipientName).toBeNull();
  });
});

describe('proof-of-delivery link expiry', () => {
  it('is valid within the ttl and expired past it', () => {
    expect(proofLinkExpired(1_000, 60_000, 30_000)).toBe(false);
    expect(proofLinkExpired(1_000, 60_000, 61_001)).toBe(true);
  });
});

describe('canViewUnmaskedProof', () => {
  it('allows staff roles and denies unknown/customer roles', () => {
    expect(canViewUnmaskedProof('CLIENT_OWNER')).toBe(true);
    expect(canViewUnmaskedProof('CLIENT_AGENT')).toBe(true);
    expect(canViewUnmaskedProof('PLATFORM_OWNER')).toBe(true);
    expect(canViewUnmaskedProof('CONTACT')).toBe(false);
    expect(canViewUnmaskedProof('')).toBe(false);
  });
});

describe('decideProofAccess', () => {
  it('DENIES an expired link even for an authorised role', () => {
    const decision = decideProofAccess({
      pod: POD,
      viewer: { role: 'CLIENT_OWNER' },
      owner: OWNER,
      link: { issuedAtMs: 1_000, ttlMs: 60_000, nowMs: 100_000 },
    });
    expect(decision).toEqual({ kind: 'DENIED', reason: 'LINK_EXPIRED' });
  });

  it('GRANTS the full PoD to an authorised staff role', () => {
    const decision = decideProofAccess({
      pod: POD,
      viewer: { role: 'CLIENT_AGENT' },
      owner: OWNER,
      link: FRESH_LINK,
    });
    expect(decision.kind).toBe('GRANTED');
    if (decision.kind === 'GRANTED') {
      expect(decision.proof.signatureRef).toBe('obj://sig/ship-1.png');
      expect(decision.proof.recipientName).toBe('John Doe');
    }
  });

  it('returns a MASKED view to a customer who proves ownership', () => {
    const byContact = decideProofAccess({
      pod: POD,
      viewer: { ownership: { contactId: 'contact-1' } },
      owner: OWNER,
      link: FRESH_LINK,
    });
    expect(byContact.kind).toBe('MASKED');
    if (byContact.kind === 'MASKED') {
      expect(byContact.proof.recipientName).toBe('J*** D**');
      expect(byContact.proof).not.toHaveProperty('signatureRef');
    }

    const byOrder = decideProofAccess({
      pod: POD,
      viewer: { ownership: { orderReference: 'ORDER-9' } },
      owner: OWNER,
      link: FRESH_LINK,
    });
    expect(byOrder.kind).toBe('MASKED');
  });

  it('DENIES access with no role and no matching ownership (fails closed)', () => {
    const noProof = decideProofAccess({
      pod: POD,
      viewer: {},
      owner: OWNER,
      link: FRESH_LINK,
    });
    expect(noProof).toEqual({ kind: 'DENIED', reason: 'NOT_AUTHORIZED' });

    const wrongContact = decideProofAccess({
      pod: POD,
      viewer: { ownership: { contactId: 'someone-else' } },
      owner: OWNER,
      link: FRESH_LINK,
    });
    expect(wrongContact).toEqual({ kind: 'DENIED', reason: 'NOT_AUTHORIZED' });
  });

  it('does not let ownership match a shipment with no recorded owner', () => {
    const decision = decideProofAccess({
      pod: POD,
      viewer: { ownership: { contactId: 'contact-1' } },
      owner: { contactId: null, orderReference: null },
      link: FRESH_LINK,
    });
    expect(decision).toEqual({ kind: 'DENIED', reason: 'NOT_AUTHORIZED' });
  });
});
