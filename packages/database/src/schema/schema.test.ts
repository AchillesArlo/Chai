import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { auditLog } from './audit';
import { idempotencyRecord, operationExecution } from './idempotency';
import { inboxEvent } from './inbox';
import { outboxEvent } from './outbox';
import { platformAuditLog } from './platform-audit';
import { platformRoleAssignment } from './platform-role-assignment';
import { entitlement, membership, tenant, userAccount } from './tenancy';

function schemaContract(table: Parameters<typeof getTableConfig>[0]) {
  const config = getTableConfig(table);

  return {
    checks: config.checks.map(({ name }) => name).sort(),
    foreignKeys: config.foreignKeys.map((foreignKey) => foreignKey.getName()).sort(),
    indexes: config.indexes.map(({ config: indexConfig }) => indexConfig.name).sort(),
    uniqueConstraints: config.uniqueConstraints
      .map((constraint) => constraint.getName())
      .sort(),
  };
}

describe('Drizzle schema contract', () => {
  it('describes tenancy constraints enforced by the foundation migration', () => {
    expect(schemaContract(tenant).checks).toEqual([
      'tenant_status_valid',
      'tenant_version_positive',
    ]);
    expect(schemaContract(userAccount).checks).toEqual([
      'user_account_status_valid',
      'user_account_version_positive',
    ]);
    expect(schemaContract(membership).checks).toEqual([
      'membership_role_valid',
      'membership_status_valid',
      'membership_version_positive',
    ]);
    expect(schemaContract(entitlement).checks).toEqual([
      'entitlement_version_positive',
    ]);
  });

  it('describes audit and inbox tenant boundaries', () => {
    const audit = schemaContract(auditLog);
    const inbox = schemaContract(inboxEvent);

    expect(audit.foreignKeys).toContain('audit_log_tenant_id_tenant_id_fk');
    expect(audit.indexes).toContain('audit_log_tenant_id_unique');
    expect(inbox.foreignKeys).toContain('inbox_event_tenant_id_tenant_id_fk');
    expect(inbox.checks).toEqual([
      'inbox_event_attempts_non_negative',
      'inbox_event_payload_hash_valid',
      'inbox_event_schema_version_positive',
      'inbox_event_status_valid',
    ]);
    expect(inbox.indexes).toEqual(
      expect.arrayContaining([
        'inbox_event_dispatch_idx',
        'inbox_event_tenant_id_unique',
        'inbox_event_tenant_provider_event_unique',
      ]),
    );
  });

  it('describes outbox and idempotency integrity constraints', () => {
    const outbox = schemaContract(outboxEvent);
    const operation = schemaContract(operationExecution);
    const idempotency = schemaContract(idempotencyRecord);

    expect(outbox.foreignKeys).toContain('outbox_event_tenant_id_tenant_id_fk');
    expect(outbox.checks).toEqual([
      'outbox_event_aggregate_version_non_negative',
      'outbox_event_attempts_non_negative',
      'outbox_event_schema_version_positive',
      'outbox_event_status_valid',
    ]);
    expect(operation.checks).toEqual([
      'operation_execution_status_valid',
      'operation_execution_version_positive',
    ]);
    expect(idempotency.foreignKeys).toEqual(
      expect.arrayContaining([
        'idempotency_record_operation_fk',
        'idempotency_record_tenant_id_tenant_id_fk',
      ]),
    );
    expect(idempotency.indexes).toEqual(
      expect.arrayContaining([
        'idempotency_expiry_idx',
        'idempotency_record_tenant_id_unique',
        'idempotency_record_tenant_key_unique',
      ]),
    );
  });

  it('describes the platform role assignment catalog contract', () => {
    const assignment = schemaContract(platformRoleAssignment);

    expect(assignment.checks).toEqual([
      'platform_role_assignment_revocation_consistency',
      'platform_role_assignment_role_valid',
      'platform_role_assignment_stage_1_active_role',
      'platform_role_assignment_status_valid',
    ]);
    expect(assignment.foreignKeys).toEqual([
      'platform_role_assignment_granted_by_fk',
      'platform_role_assignment_user_fk',
    ]);
    expect(assignment.indexes).toEqual([
      'platform_role_assignment_active_owner_unique',
      'platform_role_assignment_user_idx',
    ]);
  });

  it('describes the platform audit catalog contract', () => {
    const audit = schemaContract(platformAuditLog);

    expect(audit.checks).toEqual([
      'platform_audit_log_actor_type_valid',
      'platform_audit_log_risk_valid',
    ]);
    expect(audit.indexes).toEqual(['platform_audit_log_occurred_idx']);
  });
});
