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
