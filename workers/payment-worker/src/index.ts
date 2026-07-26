import type { PaymentStatus } from '@chai/connectors/mock-payment';

/**
 * Reconciles PENDING sessions via provider poll. Stop-on-paid; UNKNOWN_RESULT
 * stays until a known terminal status is observed.
 */
export async function pollAndReconcile(
  adapter: {
    getSession: (
      tenantId: string,
      externalId: string,
    ) => Promise<{ status: PaymentStatus } | null>;
  },
  tenantId: string,
  externalId: string,
): Promise<{ status: PaymentStatus; terminal: boolean } | null> {
  const session = await adapter.getSession(tenantId, externalId);
  if (!session) return null;
  const terminal =
    session.status === 'PAID' ||
    session.status === 'EXPIRED' ||
    session.status === 'FAILED';
  return { status: session.status, terminal };
}
