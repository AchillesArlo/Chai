import { describe, expect, it } from 'vitest';

import {
  InMemoryWhitelabelRepository,
} from '../../src/modules/whitelabel/whitelabel.repository';

const TENANT_A = '01890f47-9b3c-7cc2-98e8-000000000001';
const TENANT_B = '01890f47-9b3c-7cc2-98e8-000000000002';

describe('InMemoryWhitelabelRepository (S4-5)', () => {
  // ── Custom Domains ─────────────────────────────────────────────────────────

  describe('domains', () => {
    it('creates a domain with PENDING status and verification token', async () => {
      const repo = new InMemoryWhitelabelRepository();
      const domain = await repo.createDomain(TENANT_A, { domain: 'portal.acme.com' });

      expect(domain.id).toBeTruthy();
      expect(domain.tenantId).toBe(TENANT_A);
      expect(domain.domain).toBe('portal.acme.com');
      expect(domain.status).toBe('PENDING');
      expect(domain.sslStatus).toBe('PENDING');
      expect(domain.verificationToken).toMatch(/^verify_/);
      expect(domain.verifiedAt).toBeNull();
    });

    it('lists domains scoped to tenant', async () => {
      const repo = new InMemoryWhitelabelRepository();
      await repo.createDomain(TENANT_A, { domain: 'a.acme.com' });
      await repo.createDomain(TENANT_B, { domain: 'b.acme.com' });

      const aDomains = await repo.listDomains(TENANT_A);
      expect(aDomains).toHaveLength(1);
      expect(aDomains[0]?.domain).toBe('a.acme.com');
    });

    it('looks up domain by domain name', async () => {
      const repo = new InMemoryWhitelabelRepository();
      await repo.createDomain(TENANT_A, { domain: 'portal.acme.com' });

      const found = await repo.getDomainByDomain('portal.acme.com');
      expect(found).not.toBeNull();
      expect(found?.tenantId).toBe(TENANT_A);

      const notFound = await repo.getDomainByDomain('nonexistent.com');
      expect(notFound).toBeNull();
    });

    it('updates domain status to ACTIVE', async () => {
      const repo = new InMemoryWhitelabelRepository();
      const domain = await repo.createDomain(TENANT_A, { domain: 'portal.acme.com' });

      const verified = await repo.updateDomain(TENANT_A, domain.id, {
        status: 'ACTIVE',
        sslStatus: 'ACTIVE',
        verifiedAt: new Date().toISOString(),
      });

      expect(verified.status).toBe('ACTIVE');
      expect(verified.sslStatus).toBe('ACTIVE');
      expect(verified.verifiedAt).toBeTruthy();
    });

    it('deletes a domain', async () => {
      const repo = new InMemoryWhitelabelRepository();
      const domain = await repo.createDomain(TENANT_A, { domain: 'portal.acme.com' });

      await repo.deleteDomain(TENANT_A, domain.id);

      const fetched = await repo.getDomain(TENANT_A, domain.id);
      expect(fetched).toBeNull();
    });

    it('throws on update of nonexistent domain', async () => {
      const repo = new InMemoryWhitelabelRepository();
      await expect(
        repo.updateDomain(TENANT_A, 'nonexistent-id', { status: 'ACTIVE' }),
      ).rejects.toThrow('domain not found');
    });
  });

  // ── Theme Settings ─────────────────────────────────────────────────────────

  describe('themes', () => {
    it('creates theme with defaults when none exists', async () => {
      const repo = new InMemoryWhitelabelRepository();
      const theme = await repo.createOrUpdateTheme(TENANT_A, {
        brandName: 'Acme Corp',
        primaryColor: '#FF5733',
      });

      expect(theme.id).toBeTruthy();
      expect(theme.tenantId).toBe(TENANT_A);
      expect(theme.brandName).toBe('Acme Corp');
      expect(theme.primaryColor).toBe('#FF5733');
      expect(theme.secondaryColor).toBe('#10B981'); // default
      expect(theme.fontFamily).toBe('Inter, system-ui, sans-serif'); // default
    });

    it('updates existing theme (upsert)', async () => {
      const repo = new InMemoryWhitelabelRepository();
      await repo.createOrUpdateTheme(TENANT_A, { brandName: 'Acme Corp' });

      const updated = await repo.createOrUpdateTheme(TENANT_A, {
        brandName: 'Acme Corp Rebranded',
        primaryColor: '#00FF00',
        customCss: 'body { background: #000; }',
      });

      expect(updated.brandName).toBe('Acme Corp Rebranded');
      expect(updated.primaryColor).toBe('#00FF00');
      expect(updated.customCss).toBe('body { background: #000; }');
    });

    it('returns null for unconfigured tenant', async () => {
      const repo = new InMemoryWhitelabelRepository();
      const theme = await repo.getTheme(TENANT_B);
      expect(theme).toBeNull();
    });

    it('isolates themes by tenant', async () => {
      const repo = new InMemoryWhitelabelRepository();
      await repo.createOrUpdateTheme(TENANT_A, { brandName: 'Tenant A' });
      await repo.createOrUpdateTheme(TENANT_B, { brandName: 'Tenant B' });

      const themeA = await repo.getTheme(TENANT_A);
      expect(themeA?.brandName).toBe('Tenant A');

      const themeB = await repo.getTheme(TENANT_B);
      expect(themeB?.brandName).toBe('Tenant B');
    });
  });
});
