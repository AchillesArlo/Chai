// Shared kernel: modul yang menyimpan secret (connector-config, marketplace,
// payments) butuh menulis audit immutable saat rotasi/create secret. Agar
// tidak import AuditImmutabilityRepository lintas modul (eslint import-boundary
// rule, 02 §5), modul-modul itu depend pada port ini. Implementasi: thin
// adapter di audit-immutability module yang mendelegasi ke repository-nya.

export interface AuditEntryInput {
  tenantId: string;
  eventType: string;
  actorType: 'user' | 'system' | 'api_key' | 'automation';
  actorId: string;
  resourceType: string;
  resourceId: string;
  action: 'create' | 'update' | 'delete' | 'read' | 'execute';
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  correlationId: string | null;
}

export abstract class AuditPort {
  abstract append(entry: AuditEntryInput): Promise<void>;
}
