import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface ConnectorConfig {
  id: string;
  tenantId: string;
  connectorType: string;
  connectorProvider: string;
  name: string;
  description: string | null;
  configSchema: Record<string, unknown>; // free-form JSONB (schema-less)
  configValuesEncrypted: Buffer | null;
  configHash: string;
  status: 'active' | 'inactive' | 'error' | 'testing';
  lastTestedAt: string | null;
  lastError: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorSecret {
  id: string;
  connectorConfigId: string;
  secretKey: string;
  secretValueEncrypted: Buffer;
  secretVersion: number;
  rotatedAt: string | null;
  rotatedBy: string | null;
  createdAt: string;
}

export abstract class ConnectorConfigRepository {
  abstract listConfigs(tenantId: string): Promise<ConnectorConfig[]>;
  abstract getConfig(tenantId: string, id: string): Promise<ConnectorConfig | null>;
  abstract createConfig(tenantId: string, config: Omit<ConnectorConfig, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<ConnectorConfig>;
  abstract updateConfig(tenantId: string, id: string, update: Partial<ConnectorConfig>): Promise<ConnectorConfig>;
  abstract deleteConfig(tenantId: string, id: string): Promise<void>;

  abstract listSecrets(configId: string): Promise<ConnectorSecret[]>;
  abstract createSecret(secret: Omit<ConnectorSecret, 'id' | 'createdAt'>): Promise<ConnectorSecret>;
  abstract deleteSecret(id: string): Promise<void>;
}

@Injectable()
export class InMemoryConnectorConfigRepository extends ConnectorConfigRepository {
  private configs = new Map<string, ConnectorConfig>();
  private secrets = new Map<string, ConnectorSecret>();

  async listConfigs(tenantId: string): Promise<ConnectorConfig[]> {
    return Array.from(this.configs.values()).filter(c => c.tenantId === tenantId);
  }

  async getConfig(tenantId: string, id: string): Promise<ConnectorConfig | null> {
    const c = this.configs.get(id);
    return c && c.tenantId === tenantId ? c : null;
  }

  async createConfig(tenantId: string, config: Omit<ConnectorConfig, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<ConnectorConfig> {
    const now = new Date().toISOString();
    const created = { ...config, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.configs.set(created.id, created);
    return created;
  }

  async updateConfig(tenantId: string, id: string, update: Partial<ConnectorConfig>): Promise<ConnectorConfig> {
    const existing = this.configs.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Connector config not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.configs.set(id, updated);
    return updated;
  }

  async deleteConfig(tenantId: string, id: string): Promise<void> {
    const existing = this.configs.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Connector config not found');
    this.configs.delete(id);
  }

  async listSecrets(configId: string): Promise<ConnectorSecret[]> {
    return Array.from(this.secrets.values()).filter(s => s.connectorConfigId === configId);
  }

  async createSecret(secret: Omit<ConnectorSecret, 'id' | 'createdAt'>): Promise<ConnectorSecret> {
    const created = { ...secret, id: randomUUID(), createdAt: new Date().toISOString() };
    this.secrets.set(created.id, created);
    return created;
  }

  async deleteSecret(id: string): Promise<void> {
    if (!this.secrets.has(id)) throw new Error('Connector secret not found');
    this.secrets.delete(id);
  }
}
