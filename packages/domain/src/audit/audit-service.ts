import type { DatabaseTransaction } from '@chai/database';

export interface CreateAuditLogInput {
  id: string;
  tenantId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function createAuditLog(
  tx: DatabaseTransaction,
  input: CreateAuditLogInput,
): Promise<void> {
  await tx`
    INSERT INTO chai.audit_log (
      id,
      tenant_id,
      actor_id,
      action,
      resource_type,
      resource_id,
      metadata,
      ip_address,
      user_agent
    ) VALUES (
      ${input.id},
      ${input.tenantId},
      ${input.actorId},
      ${input.action},
      ${input.resourceType},
      ${input.resourceId ?? null},
      ${input.metadata ? JSON.stringify(input.metadata) : null},
      ${input.ipAddress ?? null},
      ${input.userAgent ?? null}
    )
  `;
}

export function deriveActionFromHttpMethod(method: string, resource: string): string {
  const methodMap: Record<string, string> = {
    POST: 'created',
    PUT: 'updated',
    PATCH: 'updated',
    DELETE: 'deleted',
  };
  const verb = methodMap[method.toUpperCase()] ?? 'accessed';
  return `${resource}.${verb}`;
}

export type { AuditLog } from './audit-log';
