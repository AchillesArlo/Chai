import { ActorIdSchema, TenantIdSchema } from '@chai/contracts';

import type { Database, DatabaseTransaction } from './client';

export interface TenantContext {
  principalId: string;
  tenantId: string;
}

/**
 * Reads the active-tenant roster via the SECURITY DEFINER function
 * `chai.active_tenant_roster()` (migration 0050) -- the ONLY sanctioned way for
 * a worker role to enumerate tenants across the RLS boundary. Returns one
 * context per ACTIVE tenant, each carrying the platform service principal the
 * worker should assume.
 *
 * The worker DB role has EXECUTE on that function but no direct SELECT on
 * chai.tenant, so this is the sole cross-tenant read path. Workers call it
 * periodically, so a newly-activated tenant becomes visible without a redeploy.
 *
 * Values are validated here at the DB->app trust boundary (same schemas
 * withTenantTransaction enforces), so a malformed roster fails loudly rather
 * than silently poisoning a tenant's security context downstream.
 */
export async function readActiveTenantRoster(
  database: Database,
): Promise<TenantContext[]> {
  const rows = await database<{ principal_id: string; tenant_id: string }[]>`
    SELECT tenant_id, principal_id
    FROM chai.active_tenant_roster()
  `;

  return rows.map((row) => ({
    principalId: ActorIdSchema.parse(row.principal_id),
    tenantId: TenantIdSchema.parse(row.tenant_id),
  }));
}

export async function withPrincipalTransaction<T>(
  database: Database,
  principalId: string,
  operation: (transaction: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  const validatedPrincipalId = ActorIdSchema.parse(principalId);

  const wrappedResult = await database.begin(async (transaction) => {
    await transaction`
      SELECT set_config('app.principal_id', ${validatedPrincipalId}, true)
    `;

    return { value: await operation(transaction) };
  });

  return wrappedResult.value;
}

export async function withTenantTransaction<T>(
  database: Database,
  context: TenantContext,
  operation: (transaction: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  const principalId = ActorIdSchema.parse(context.principalId);
  const tenantId = TenantIdSchema.parse(context.tenantId);

  const wrappedResult = await database.begin(async (transaction) => {
    await transaction`
      SELECT
        set_config('app.tenant_id', ${tenantId}, true),
        set_config('app.principal_id', ${principalId}, true)
    `;

    return { value: await operation(transaction) };
  });

  return wrappedResult.value;
}
