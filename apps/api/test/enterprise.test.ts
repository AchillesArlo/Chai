import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryEnterpriseRepository } from '../src/modules/enterprise/enterprise.repository';

describe('EnterpriseRepository', () => {
  let repo: InMemoryEnterpriseRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryEnterpriseRepository();
  });

  describe('SSO Configuration', () => {
    it('should create SAML SSO config', async () => {
      const config = await repo.upsertSsoConfig(tenantId, {
        tenantId,
        provider: 'saml',
        entityId: 'https://idp.example.com',
        ssoUrl: 'https://idp.example.com/sso',
        certificate: '-----BEGIN CERTIFICATE-----...',
        attributeMapping: { email: 'user.email', name: 'user.name' },
        enabled: true,
      });

      expect(config.id).toBeDefined();
      expect(config.provider).toBe('saml');
      expect(config.enabled).toBe(true);
    });

    it('should update existing SSO config', async () => {
      await repo.upsertSsoConfig(tenantId, {
        tenantId,
        provider: 'saml',
        entityId: 'https://idp.example.com',
        ssoUrl: 'https://idp.example.com/sso',
        certificate: 'cert1',
        attributeMapping: {},
        enabled: false,
      });

      const updated = await repo.upsertSsoConfig(tenantId, {
        tenantId,
        provider: 'saml',
        entityId: 'https://idp.example.com',
        ssoUrl: 'https://idp.example.com/sso',
        certificate: 'cert2',
        attributeMapping: { email: 'user.email' },
        enabled: true,
      });

      expect(updated.certificate).toBe('cert2');
      expect(updated.enabled).toBe(true);
    });

    it('should retrieve SSO config by provider', async () => {
      await repo.upsertSsoConfig(tenantId, {
        tenantId,
        provider: 'saml',
        entityId: 'https://idp.example.com',
        ssoUrl: 'https://idp.example.com/sso',
        certificate: 'cert',
        attributeMapping: {},
        enabled: true,
      });

      const saml = await repo.getSsoConfig(tenantId, 'saml');
      expect(saml).toBeDefined();

      const oidc = await repo.getSsoConfig(tenantId, 'oidc');
      expect(oidc).toBeNull();
    });
  });

  describe('SCIM Configuration', () => {
    it('should create SCIM config', async () => {
      const config = await repo.upsertScimConfig(tenantId, {
        tenantId,
        baseUrl: 'https://scim.example.com',
        userSyncEnabled: true,
        groupSyncEnabled: false,
      });

      expect(config.id).toBeDefined();
      expect(config.baseUrl).toBe('https://scim.example.com');
      expect(config.userSyncEnabled).toBe(true);
      expect(config.lastSyncAt).toBeNull();
    });

    it('should update SCIM config', async () => {
      await repo.upsertScimConfig(tenantId, {
        tenantId,
        baseUrl: 'https://scim.example.com',
        userSyncEnabled: true,
        groupSyncEnabled: false,
      });

      const updated = await repo.upsertScimConfig(tenantId, {
        tenantId,
        baseUrl: 'https://scim.example.com',
        userSyncEnabled: true,
        groupSyncEnabled: true,
      });

      expect(updated.groupSyncEnabled).toBe(true);
    });
  });

  describe('Custom Roles', () => {
    it('should create custom role', async () => {
      const role = await repo.createRole(tenantId, {
        tenantId,
        name: 'Support Agent',
        description: 'Can view and respond to conversations',
        permissions: ['conversation.read', 'conversation.write'],
      });

      expect(role.id).toBeDefined();
      expect(role.name).toBe('Support Agent');
      expect(role.permissions).toHaveLength(2);
    });

    it('should update role', async () => {
      const role = await repo.createRole(tenantId, {
        tenantId,
        name: 'Support Agent',
        description: null,
        permissions: ['conversation.read'],
      });

      const updated = await repo.updateRole(tenantId, role.id, {
        permissions: ['conversation.read', 'conversation.write', 'conversation.delete'],
      });

      expect(updated.permissions).toHaveLength(3);
    });

    it('should delete role', async () => {
      const role = await repo.createRole(tenantId, {
        tenantId,
        name: 'Temp Role',
        description: null,
        permissions: [],
      });

      await repo.deleteRole(tenantId, role.id);

      const retrieved = await repo.getRole(tenantId, role.id);
      expect(retrieved).toBeNull();
    });

    it('should list roles for tenant', async () => {
      await repo.createRole(tenantId, {
        tenantId,
        name: 'Role 1',
        description: null,
        permissions: [],
      });

      await repo.createRole(tenantId, {
        tenantId,
        name: 'Role 2',
        description: null,
        permissions: [],
      });

      const roles = await repo.listRoles(tenantId);
      expect(roles).toHaveLength(2);
    });
  });

  describe('Role Assignments', () => {
    it('should assign role to user', async () => {
      const role = await repo.createRole(tenantId, {
        tenantId,
        name: 'Admin',
        description: null,
        permissions: ['*'],
      });

      const assignment = await repo.assignRole(tenantId, 'user-1', role.id, 'user-2');

      expect(assignment.id).toBeDefined();
      expect(assignment.userId).toBe('user-1');
      expect(assignment.roleId).toBe(role.id);
      expect(assignment.assignedBy).toBe('user-2');
    });

    it('should list role assignments by user', async () => {
      const role1 = await repo.createRole(tenantId, {
        tenantId,
        name: 'Role 1',
        description: null,
        permissions: [],
      });

      const role2 = await repo.createRole(tenantId, {
        tenantId,
        name: 'Role 2',
        description: null,
        permissions: [],
      });

      await repo.assignRole(tenantId, 'user-1', role1.id, 'admin');
      await repo.assignRole(tenantId, 'user-1', role2.id, 'admin');
      await repo.assignRole(tenantId, 'user-2', role1.id, 'admin');

      const user1Roles = await repo.listRoleAssignments(tenantId, 'user-1');
      expect(user1Roles).toHaveLength(2);

      const allRoles = await repo.listRoleAssignments(tenantId);
      expect(allRoles).toHaveLength(3);
    });

    it('should revoke role assignment', async () => {
      const role = await repo.createRole(tenantId, {
        tenantId,
        name: 'Temp Role',
        description: null,
        permissions: [],
      });

      await repo.assignRole(tenantId, 'user-1', role.id, 'admin');

      await repo.revokeRole(tenantId, 'user-1', role.id);

      const assignments = await repo.listRoleAssignments(tenantId, 'user-1');
      expect(assignments).toHaveLength(0);
    });
  });

  describe('Audit Export', () => {
    it('should create audit export config', async () => {
      const config = await repo.upsertAuditExportConfig(tenantId, {
        tenantId,
        destinationType: 's3',
        destinationConfig: { bucket: 'audit-logs', region: 'ap-southeast-1' },
        filterCriteria: { startDate: '2026-01-01' },
        enabled: true,
      });

      expect(config.id).toBeDefined();
      expect(config.destinationType).toBe('s3');
      expect(config.enabled).toBe(true);
    });

    it('should create and update audit export history', async () => {
      const config = await repo.upsertAuditExportConfig(tenantId, {
        tenantId,
        destinationType: 'splunk',
        destinationConfig: { hecUrl: 'https://splunk.example.com/services/collector' },
        filterCriteria: {},
        enabled: true,
      });

      const history = await repo.createAuditExportHistory(tenantId, {
        tenantId,
        configId: config.id,
        status: 'pending',
        recordsExported: 0,
        startedAt: '2026-01-15T10:00:00Z',
        completedAt: null,
        errorMessage: null,
      });

      expect(history.id).toBeDefined();
      expect(history.status).toBe('pending');

      const updated = await repo.updateAuditExportHistory(tenantId, history.id, {
        status: 'completed',
        recordsExported: 1500,
        completedAt: '2026-01-15T10:05:00Z',
      });

      expect(updated.status).toBe('completed');
      expect(updated.recordsExported).toBe(1500);
    });

    it('should list export history by config', async () => {
      const config = await repo.upsertAuditExportConfig(tenantId, {
        tenantId,
        destinationType: 'elk',
        destinationConfig: {},
        filterCriteria: {},
        enabled: true,
      });

      await repo.createAuditExportHistory(tenantId, {
        tenantId,
        configId: config.id,
        status: 'completed',
        recordsExported: 100,
        startedAt: '2026-01-14T10:00:00Z',
        completedAt: '2026-01-14T10:05:00Z',
        errorMessage: null,
      });

      await repo.createAuditExportHistory(tenantId, {
        tenantId,
        configId: config.id,
        status: 'completed',
        recordsExported: 150,
        startedAt: '2026-01-15T10:00:00Z',
        completedAt: '2026-01-15T10:05:00Z',
        errorMessage: null,
      });

      const history = await repo.listAuditExportHistory(tenantId, config.id);
      expect(history).toHaveLength(2);
    });
  });
});
