import { ActorIdSchema, TenantIdSchema } from '@chai/contracts';

import type { Database, DatabaseTransaction } from './client';

export interface TenantContext {
  principalId: string;
  tenantId: string;
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
