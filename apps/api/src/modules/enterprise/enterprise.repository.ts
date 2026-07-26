import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface SsoConfiguration {
  id: string;
  tenantId: string;
  provider: 'saml' | 'oidc';
  entityId: string;
  ssoUrl: string;
  certificate: string;
  attributeMapping: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScimConfiguration {
  id: string;
  tenantId: string;
  baseUrl: string;
  userSyncEnabled: boolean;
  groupSyncEnabled: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomRole {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RoleAssignment {
  id: string;
  tenantId: string;
  userId: string;
  roleId: string;
  assignedAt: string;
  assignedBy: string;
}

export interface AuditExportConfig {
  id: string;
  tenantId: string;
  destinationType: 's3' | 'splunk' | 'elk' | 'webhook';
  destinationConfig: Record<string, unknown>; // free-form JSONB (schema-less)
  filterCriteria: Record<string, unknown>;
  enabled: boolean;
  lastExportAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditExportHistory {
  id: string;
  tenantId: string;
  configId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  recordsExported: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export abstract class EnterpriseRepository {
  abstract getSsoConfig(tenantId: string, provider: 'saml' | 'oidc'): Promise<SsoConfiguration | null>;
  abstract upsertSsoConfig(tenantId: string, config: Omit<SsoConfiguration, 'id' | 'createdAt' | 'updatedAt'>): Promise<SsoConfiguration>;
  
  abstract getScimConfig(tenantId: string): Promise<ScimConfiguration | null>;
  abstract upsertScimConfig(tenantId: string, config: Omit<ScimConfiguration, 'id' | 'createdAt' | 'updatedAt' | 'lastSyncAt'>): Promise<ScimConfiguration>;
  
  abstract listRoles(tenantId: string): Promise<CustomRole[]>;
  abstract getRole(tenantId: string, id: string): Promise<CustomRole | null>;
  abstract createRole(tenantId: string, role: Omit<CustomRole, 'id' | 'createdAt' | 'updatedAt'>): Promise<CustomRole>;
  abstract updateRole(tenantId: string, id: string, update: Partial<CustomRole>): Promise<CustomRole>;
  abstract deleteRole(tenantId: string, id: string): Promise<void>;
  
  abstract listRoleAssignments(tenantId: string, userId?: string): Promise<RoleAssignment[]>;
  abstract assignRole(tenantId: string, userId: string, roleId: string, assignedBy: string): Promise<RoleAssignment>;
  abstract revokeRole(tenantId: string, userId: string, roleId: string): Promise<void>;
  
  abstract getAuditExportConfig(tenantId: string): Promise<AuditExportConfig | null>;
  abstract upsertAuditExportConfig(tenantId: string, config: Omit<AuditExportConfig, 'id' | 'createdAt' | 'updatedAt' | 'lastExportAt'>): Promise<AuditExportConfig>;
  
  abstract listAuditExportHistory(tenantId: string, configId?: string): Promise<AuditExportHistory[]>;
  abstract createAuditExportHistory(tenantId: string, history: Omit<AuditExportHistory, 'id' | 'createdAt'>): Promise<AuditExportHistory>;
  abstract updateAuditExportHistory(tenantId: string, id: string, update: Partial<AuditExportHistory>): Promise<AuditExportHistory>;
}

@Injectable()
export class InMemoryEnterpriseRepository extends EnterpriseRepository {
  private ssoStore = new Map<string, SsoConfiguration>();
  private scimStore = new Map<string, ScimConfiguration>();
  private roleStore = new Map<string, CustomRole>();
  private assignmentStore = new Map<string, RoleAssignment>();
  private exportConfigStore = new Map<string, AuditExportConfig>();
  private exportHistoryStore = new Map<string, AuditExportHistory>();

  async getSsoConfig(tenantId: string, provider: 'saml' | 'oidc'): Promise<SsoConfiguration | null> {
    return Array.from(this.ssoStore.values()).find(
      c => c.tenantId === tenantId && c.provider === provider
    ) || null;
  }

  async upsertSsoConfig(tenantId: string, config: Omit<SsoConfiguration, 'id' | 'createdAt' | 'updatedAt'>): Promise<SsoConfiguration> {
    const existing = await this.getSsoConfig(tenantId, config.provider);
    const now = new Date().toISOString();
    
    if (existing) {
      const updated = { ...existing, ...config, updatedAt: now };
      this.ssoStore.set(existing.id, updated);
      return updated;
    }
    
    const created = { ...config, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.ssoStore.set(created.id, created);
    return created;
  }

  async getScimConfig(tenantId: string): Promise<ScimConfiguration | null> {
    return this.scimStore.get(tenantId) || null;
  }

  async upsertScimConfig(tenantId: string, config: Omit<ScimConfiguration, 'id' | 'createdAt' | 'updatedAt' | 'lastSyncAt'>): Promise<ScimConfiguration> {
    const existing = await this.getScimConfig(tenantId);
    const now = new Date().toISOString();
    
    if (existing) {
      const updated = { ...existing, ...config, updatedAt: now };
      this.scimStore.set(tenantId, updated);
      return updated;
    }
    
    const created = { ...config, id: randomUUID(), lastSyncAt: null, createdAt: now, updatedAt: now };
    this.scimStore.set(tenantId, created);
    return created;
  }

  async listRoles(tenantId: string): Promise<CustomRole[]> {
    return Array.from(this.roleStore.values()).filter(r => r.tenantId === tenantId);
  }

  async getRole(tenantId: string, id: string): Promise<CustomRole | null> {
    const role = this.roleStore.get(id);
    return role && role.tenantId === tenantId ? role : null;
  }

  async createRole(tenantId: string, role: Omit<CustomRole, 'id' | 'createdAt' | 'updatedAt'>): Promise<CustomRole> {
    const now = new Date().toISOString();
    const created = { ...role, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.roleStore.set(created.id, created);
    return created;
  }

  async updateRole(tenantId: string, id: string, update: Partial<CustomRole>): Promise<CustomRole> {
    const existing = this.roleStore.get(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new Error('Role not found');
    }
    
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.roleStore.set(id, updated);
    return updated;
  }

  async deleteRole(tenantId: string, id: string): Promise<void> {
    const existing = this.roleStore.get(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new Error('Role not found');
    }
    this.roleStore.delete(id);
  }

  async listRoleAssignments(tenantId: string, userId?: string): Promise<RoleAssignment[]> {
    return Array.from(this.assignmentStore.values()).filter(
      a => a.tenantId === tenantId && (!userId || a.userId === userId)
    );
  }

  async assignRole(tenantId: string, userId: string, roleId: string, assignedBy: string): Promise<RoleAssignment> {
    const now = new Date().toISOString();
    const assignment = {
      id: randomUUID(),
      tenantId,
      userId,
      roleId,
      assignedAt: now,
      assignedBy,
    };
    this.assignmentStore.set(assignment.id, assignment);
    return assignment;
  }

  async revokeRole(tenantId: string, userId: string, roleId: string): Promise<void> {
    const key = Array.from(this.assignmentStore.entries()).find(
      ([, a]) => a.tenantId === tenantId && a.userId === userId && a.roleId === roleId
    )?.[0];
    if (key) this.assignmentStore.delete(key);
  }

  async getAuditExportConfig(tenantId: string): Promise<AuditExportConfig | null> {
    return Array.from(this.exportConfigStore.values()).find(c => c.tenantId === tenantId) || null;
  }

  async upsertAuditExportConfig(tenantId: string, config: Omit<AuditExportConfig, 'id' | 'createdAt' | 'updatedAt' | 'lastExportAt'>): Promise<AuditExportConfig> {
    const existing = await this.getAuditExportConfig(tenantId);
    const now = new Date().toISOString();
    
    if (existing) {
      const updated = { ...existing, ...config, updatedAt: now };
      this.exportConfigStore.set(existing.id, updated);
      return updated;
    }
    
    const created = { ...config, id: randomUUID(), lastExportAt: null, createdAt: now, updatedAt: now };
    this.exportConfigStore.set(created.id, created);
    return created;
  }

  async listAuditExportHistory(tenantId: string, configId?: string): Promise<AuditExportHistory[]> {
    return Array.from(this.exportHistoryStore.values()).filter(
      h => h.tenantId === tenantId && (!configId || h.configId === configId)
    );
  }

  async createAuditExportHistory(tenantId: string, history: Omit<AuditExportHistory, 'id' | 'createdAt'>): Promise<AuditExportHistory> {
    const created = { ...history, tenantId, id: randomUUID(), createdAt: new Date().toISOString() };
    this.exportHistoryStore.set(created.id, created);
    return created;
  }

  async updateAuditExportHistory(tenantId: string, id: string, update: Partial<AuditExportHistory>): Promise<AuditExportHistory> {
    const existing = this.exportHistoryStore.get(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new Error('Export history not found');
    }
    
    const updated = { ...existing, ...update };
    this.exportHistoryStore.set(id, updated);
    return updated;
  }
}
