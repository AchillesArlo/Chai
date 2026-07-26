import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryConnectorConfigRepository } from '../src/modules/connector-config/connector-config.repository';

describe('ConnectorConfigRepository', () => {
  let repo: InMemoryConnectorConfigRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryConnectorConfigRepository();
  });

  describe('Connector Configs', () => {
    it('should create connector config', async () => {
      const config = await repo.createConfig(tenantId, {
        connectorType: 'whatsapp',
        connectorProvider: 'twilio',
        name: 'WhatsApp Production',
        description: 'Production WhatsApp connector',
        configSchema: { phone: '+1234567890' },
        configValuesEncrypted: null,
        configHash: 'hash-123',
        status: 'active',
        lastTestedAt: null,
        lastError: null,
        createdBy: 'user-1',
        updatedBy: null,
      });

      expect(config.id).toBeDefined();
      expect(config.connectorType).toBe('whatsapp');
      expect(config.status).toBe('active');
    });

    it('should list configs by tenant', async () => {
      await repo.createConfig(tenantId, {
        connectorType: 'telegram',
        connectorProvider: 'telegram',
        name: 'Telegram Bot',
        description: null,
        configSchema: {},
        configValuesEncrypted: null,
        configHash: 'hash-456',
        status: 'inactive',
        lastTestedAt: null,
        lastError: null,
        createdBy: 'user-1',
        updatedBy: null,
      });

      const configs = await repo.listConfigs(tenantId);
      expect(configs).toHaveLength(1);
    });

    it('should update connector config', async () => {
      const config = await repo.createConfig(tenantId, {
        connectorType: 'instagram',
        connectorProvider: 'meta',
        name: 'Instagram DM',
        description: null,
        configSchema: {},
        configValuesEncrypted: null,
        configHash: 'hash-789',
        status: 'testing',
        lastTestedAt: null,
        lastError: null,
        createdBy: 'user-1',
        updatedBy: null,
      });

      const updated = await repo.updateConfig(tenantId, config.id, {
        status: 'active',
        lastTestedAt: new Date().toISOString(),
      });

      expect(updated.status).toBe('active');
      expect(updated.lastTestedAt).toBeDefined();
    });
  });

  describe('Connector Secrets', () => {
    it('should create connector secret', async () => {
      const config = await repo.createConfig(tenantId, {
        connectorType: 'whatsapp',
        connectorProvider: 'twilio',
        name: 'WhatsApp',
        description: null,
        configSchema: {},
        configValuesEncrypted: null,
        configHash: 'hash-123',
        status: 'active',
        lastTestedAt: null,
        lastError: null,
        createdBy: 'user-1',
        updatedBy: null,
      });

      const secret = await repo.createSecret({
        connectorConfigId: config.id,
        secretKey: 'api_key',
        secretValueEncrypted: Buffer.from('encrypted-value'),
        secretVersion: 1,
        rotatedAt: null,
        rotatedBy: null,
      });

      expect(secret.id).toBeDefined();
      expect(secret.secretKey).toBe('api_key');
    });

    it('should list secrets by config', async () => {
      const config = await repo.createConfig(tenantId, {
        connectorType: 'telegram',
        connectorProvider: 'telegram',
        name: 'Telegram',
        description: null,
        configSchema: {},
        configValuesEncrypted: null,
        configHash: 'hash-456',
        status: 'active',
        lastTestedAt: null,
        lastError: null,
        createdBy: 'user-1',
        updatedBy: null,
      });

      await repo.createSecret({
        connectorConfigId: config.id,
        secretKey: 'bot_token',
        secretValueEncrypted: Buffer.from('encrypted'),
        secretVersion: 1,
        rotatedAt: null,
        rotatedBy: null,
      });

      const secrets = await repo.listSecrets(config.id);
      expect(secrets).toHaveLength(1);
    });
  });
});
