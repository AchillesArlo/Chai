import { randomUUID } from 'node:crypto';

import type { DatabaseTransaction } from '@chai/database';

import { appendAuditEntry } from '../outbox/producer';

/**
 * Proof of Delivery access control (REQ-17-038; Blueprint 07 §11.6).
 *
 * A PoD carries a recipient name and a signature artifact — personal data that
 * must never leak to someone who cannot prove they are allowed to see it. This
 * module is the gate: it masks PII for anyone but authorised staff, enforces a
 * short-lived access link, fails closed when ownership is not proven, and
 * records every access attempt to the audit log.
 */

export interface ProofOfDelivery {
  id: string;
  tenantId: string;
  shipmentId: string;
  /** Reference to the artifact in object storage, never the bytes. */
  artifactRef: string;
  recipientName: string | null;
  signatureRef: string | null;
  deliveredAt: string;
  capturedBy: string | null;
  createdAt: string;
}

/** A PoD with the signature stripped and the recipient name masked. */
export interface MaskedProofOfDelivery {
  id: string;
  shipmentId: string;
  deliveredAt: string;
  /** Masked to initials, e.g. "J*** D**". */
  recipientName: string | null;
  masked: true;
}

// Internal staff roles that may see the full, unmasked PoD.
const UNMASKED_ROLES: ReadonlySet<string> = new Set([
  'PLATFORM_OWNER',
  'CLIENT_OWNER',
  'CLIENT_ADMIN',
  'CLIENT_AGENT',
]);

/** True when this role may view the unmasked signature + recipient name. */
export function canViewUnmaskedProof(role: string): boolean {
  return UNMASKED_ROLES.has(role);
}

function maskName(name: string | null): string | null {
  if (name === null) return null;
  return name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) =>
      part.length <= 1 ? part : `${part[0] ?? ''}${'*'.repeat(part.length - 1)}`,
    )
    .join(' ');
}

/** Strips the artifact/signature refs and masks the recipient name. */
export function maskProofOfDelivery(
  pod: ProofOfDelivery,
): MaskedProofOfDelivery {
  return {
    id: pod.id,
    shipmentId: pod.shipmentId,
    deliveredAt: pod.deliveredAt,
    recipientName: maskName(pod.recipientName),
    masked: true,
  };
}

/** Short-lived access link: expired once now is past issuedAt + ttl. */
export function proofLinkExpired(
  issuedAtMs: number,
  ttlMs: number,
  nowMs: number,
): boolean {
  return nowMs > issuedAtMs + Math.max(0, ttlMs);
}

export interface ProofViewer {
  /** Staff role, when the viewer is internal. */
  role?: string;
  /** Ownership proof, when the viewer is the customer. */
  ownership?: { contactId?: string; orderReference?: string };
}

export interface ShipmentOwnership {
  contactId: string | null;
  orderReference: string | null;
}

export interface ProofLink {
  issuedAtMs: number;
  ttlMs: number;
  nowMs: number;
}

export type ProofAccessDecision =
  | { kind: 'GRANTED'; proof: ProofOfDelivery }
  | { kind: 'MASKED'; proof: MaskedProofOfDelivery }
  | { kind: 'DENIED'; reason: 'LINK_EXPIRED' | 'NOT_AUTHORIZED' };

/**
 * Decides what a viewer may see of a PoD:
 *   - expired link           -> DENIED (LINK_EXPIRED)
 *   - authorised staff role  -> GRANTED (full, unmasked)
 *   - proven shipment owner  -> MASKED (confirm delivery without PII)
 *   - anyone else            -> DENIED (NOT_AUTHORIZED)
 *
 * Fails closed: no role and no matching ownership proof reveals nothing, the
 * same rule the customer shipment lookup already follows (ADR-027).
 */
export function decideProofAccess(input: {
  pod: ProofOfDelivery;
  viewer: ProofViewer;
  owner: ShipmentOwnership;
  link: ProofLink;
}): ProofAccessDecision {
  if (proofLinkExpired(input.link.issuedAtMs, input.link.ttlMs, input.link.nowMs)) {
    return { kind: 'DENIED', reason: 'LINK_EXPIRED' };
  }

  const { role, ownership } = input.viewer;
  if (role !== undefined && canViewUnmaskedProof(role)) {
    return { kind: 'GRANTED', proof: input.pod };
  }

  const ownsByContact =
    ownership?.contactId !== undefined &&
    input.owner.contactId !== null &&
    ownership.contactId === input.owner.contactId;
  const ownsByOrder =
    ownership?.orderReference !== undefined &&
    input.owner.orderReference !== null &&
    ownership.orderReference === input.owner.orderReference;
  if (ownsByContact || ownsByOrder) {
    return { kind: 'MASKED', proof: maskProofOfDelivery(input.pod) };
  }

  return { kind: 'DENIED', reason: 'NOT_AUTHORIZED' };
}

// ── Persistence ─────────────────────────────────────────────────────────────

interface ProofRow {
  id: string;
  tenant_id: string;
  shipment_id: string;
  artifact_ref: string;
  recipient_name: string | null;
  signature_ref: string | null;
  delivered_at: Date;
  captured_by: string | null;
  created_at: Date;
}

function toPod(row: ProofRow): ProofOfDelivery {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    shipmentId: row.shipment_id,
    artifactRef: row.artifact_ref,
    recipientName: row.recipient_name,
    signatureRef: row.signature_ref,
    deliveredAt: row.delivered_at.toISOString(),
    capturedBy: row.captured_by,
    createdAt: row.created_at.toISOString(),
  };
}

export interface CreateProofOfDeliveryInput {
  tenantId: string;
  shipmentId: string;
  artifactRef: string;
  recipientName?: string | null;
  signatureRef?: string | null;
  deliveredAt: Date;
  capturedBy?: string | null;
}

/** Records a captured PoD (write-once evidence). */
export async function createProofOfDelivery(
  transaction: DatabaseTransaction,
  input: CreateProofOfDeliveryInput,
): Promise<ProofOfDelivery> {
  const id = randomUUID();
  const rows = await transaction<ProofRow[]>`
    INSERT INTO chai.proof_of_delivery
      (id, tenant_id, shipment_id, artifact_ref, recipient_name, signature_ref, delivered_at, captured_by)
    VALUES (
      ${id}::uuid,
      ${input.tenantId}::uuid,
      ${input.shipmentId}::uuid,
      ${input.artifactRef},
      ${input.recipientName ?? null},
      ${input.signatureRef ?? null},
      ${input.deliveredAt},
      ${input.capturedBy ?? null}
    )
    RETURNING id, tenant_id, shipment_id, artifact_ref, recipient_name, signature_ref, delivered_at, captured_by, created_at
  `;
  const row = rows[0];
  if (!row) throw new Error('proof_of_delivery insert returned no row');
  return toPod(row);
}

/** Reads the PoD for a shipment (RLS-scoped), or null. */
export async function getProofOfDelivery(
  transaction: DatabaseTransaction,
  tenantId: string,
  shipmentId: string,
): Promise<ProofOfDelivery | null> {
  const rows = await transaction<ProofRow[]>`
    SELECT id, tenant_id, shipment_id, artifact_ref, recipient_name, signature_ref, delivered_at, captured_by, created_at
    FROM chai.proof_of_delivery
    WHERE tenant_id = ${tenantId}::uuid AND shipment_id = ${shipmentId}::uuid
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const row = rows[0];
  return row ? toPod(row) : null;
}

/**
 * Records a PoD access attempt to the audit log — every outcome, including a
 * denial, so access to sensitive delivery evidence is always traceable.
 */
export async function recordProofAccess(
  transaction: DatabaseTransaction,
  input: {
    tenantId: string;
    actorId: string;
    podId: string;
    shipmentId: string;
    outcome: ProofAccessDecision['kind'];
    reason?: string;
  },
): Promise<void> {
  await appendAuditEntry(transaction, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'proof_of_delivery.accessed',
    resourceType: 'proof_of_delivery',
    resourceId: input.podId,
    reason: input.reason ?? `PoD access outcome: ${input.outcome}`,
    metadata: {
      shipmentId: input.shipmentId,
      outcome: input.outcome,
    },
  });
}
