import { ForbiddenException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { SESSION_POLICIES } from '@chai/auth';

/**
 * Capability flags for high-risk operations that the blueprint keeps disabled
 * until their stage gate passes (17_PAYMENT §2.10, 10_SECURITY §20).
 *
 * ponytail: env-backed and default-off. The real entitlement service is
 * per-tenant and server-evaluated (16_TECH_STACK §17, GAP-012); this keeps the
 * capability closed today without pretending the entitlement layer exists.
 */
export const GATED_CAPABILITIES = [
  'payment_refunds',
  'payment_recurring',
  'shipment_create_label',
  'shipment_pickup',
  'shipment_returns',
] as const;

export type GatedCapability = (typeof GATED_CAPABILITIES)[number];

function envFlag(capability: GatedCapability): string {
  return `CHAI_CAPABILITY_${capability.toUpperCase()}`;
}

export function isCapabilityEnabled(
  capability: GatedCapability,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[envFlag(capability)] === 'true';
}

/** Throws FEATURE_NOT_ENABLED unless the capability was explicitly enabled. */
export function assertCapabilityEnabled(
  capability: GatedCapability,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isCapabilityEnabled(capability, env)) {
    throw new ForbiddenException({ code: 'FEATURE_NOT_ENABLED', capability });
  }
}

/**
 * Throws RECENT_AUTH_REQUIRED when the caller's credential presentation is
 * older than the ADR-029 window. Guarded and irreversible actions must re-prove
 * possession of the credential, not merely hold a live session.
 */
export function assertRecentAuthentication(
  request: FastifyRequest,
  now: Date = new Date(),
): void {
  const principal = request.principal;
  if (!principal) {
    throw new ForbiddenException({ code: 'RECENT_AUTH_REQUIRED' });
  }
  const ageSeconds =
    (now.getTime() - principal.authenticatedAt.getTime()) / 1000;
  if (
    !Number.isFinite(ageSeconds) ||
    ageSeconds > SESSION_POLICIES.recentAuthenticationSeconds
  ) {
    throw new ForbiddenException({ code: 'RECENT_AUTH_REQUIRED' });
  }
}

/**
 * Inventory of routes that call {@link assertRecentAuthentication} (REQ-10-005).
 * This list is the source of truth for "which actions require a freshly
 * presented credential" — kept here, not only in each controller, so a
 * reviewer or a future test can check coverage without grepping every module.
 * Each entry names the route and the reason it is irreversible-enough (from
 * the caller's side) to need re-proof of the credential rather than just a
 * live session.
 */
export const RECENT_AUTH_ROUTES = [
  {
    reason: 'Executes an irreversible refund of already-settled money.',
    route: 'POST /api/client/v1/payments/:id/refunds',
  },
  {
    reason:
      'Creates a recurring payment mandate — authorizes future charges without further caller action, same blast radius as a refund.',
    route: 'POST /api/client/v1/subscriptions',
  },
  {
    reason: 'Removes a team member; the caller cannot self-undo (needs re-invite).',
    route: 'DELETE /api/client/v1/team/:id',
  },
  {
    reason: 'Writes a new connector credential (secret rotation).',
    route: 'POST /api/owner/v1/connector-config/configs/:id/secrets',
  },
  {
    reason: 'Deletes a connector credential.',
    route: 'DELETE /api/owner/v1/connector-config/secrets/:id',
  },
  {
    reason: 'Redirects where audit data is exported to — a data-exfiltration vector if hijacked.',
    route: 'POST /api/owner/v1/enterprise/audit-export-config',
  },
  {
    reason: 'Resolves an operational reconciliation discrepancy; writes audit and event.',
    route: 'POST /api/client/v1/payments/reconciliations/:id/resolve',
  },
] as const;
