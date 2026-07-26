import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTemplateRepository } from '../src/modules/template/template.repository';

describe('TemplateRepository', () => {
  let repo: InMemoryTemplateRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryTemplateRepository();
  });

  it('should create template', async () => {
    const template = await repo.createTemplate(tenantId, {
      name: 'Welcome Message',
      category: 'UTILITY',
      language: 'id',
      body: 'Welcome {{name}}! We are glad to have you.',
      variables: ['name'],
      status: 'APPROVED',
      providerRef: null,
    });

    expect(template.id).toBeDefined();
    expect(template.name).toBe('Welcome Message');
    expect(template.variables).toContain('name');
    expect(template.body).toContain('Welcome');
  });

  it('should list templates by tenant', async () => {
    await repo.createTemplate(tenantId, {
      name: 'Template 1',
      category: 'MARKETING',
      language: 'id',
      body: 'Content 1',
      variables: [],
      status: 'APPROVED',
      providerRef: null,
    });

    await repo.createTemplate(tenantId, {
      name: 'Template 2',
      category: 'UTILITY',
      language: 'en',
      body: 'Content 2',
      variables: [],
      status: 'DRAFT',
      providerRef: null,
    });

    const templates = await repo.listTemplates(tenantId);
    expect(templates).toHaveLength(2);
  });

  it('should filter templates by category', async () => {
    await repo.createTemplate(tenantId, {
      name: 'Marketing 1',
      category: 'MARKETING',
      language: 'id',
      body: 'Marketing content',
      variables: [],
      status: 'APPROVED',
      providerRef: null,
    });

    await repo.createTemplate(tenantId, {
      name: 'Utility 1',
      category: 'UTILITY',
      language: 'id',
      body: 'Support content',
      variables: [],
      status: 'APPROVED',
      providerRef: null,
    });

    const marketingTemplates = await repo.listTemplates(tenantId, 'MARKETING');
    expect(marketingTemplates).toHaveLength(1);
    expect(marketingTemplates[0]?.name).toBe('Marketing 1');
  });

  it('should update template', async () => {
    const template = await repo.createTemplate(tenantId, {
      name: 'Test Template',
      category: 'UTILITY',
      language: 'id',
      body: 'Original content',
      variables: [],
      status: 'DRAFT',
      providerRef: null,
    });

    const updated = await repo.updateTemplate(tenantId, template.id, {
      body: 'Updated content',
    });

    expect(updated.body).toBe('Updated content');
  });

  it('should delete template', async () => {
    const template = await repo.createTemplate(tenantId, {
      name: 'Delete Me',
      category: 'UTILITY',
      language: 'id',
      body: 'Content',
      variables: [],
      status: 'DRAFT',
      providerRef: null,
    });

    await repo.deleteTemplate(tenantId, template.id);
    const found = await repo.getTemplate(tenantId, template.id);
    expect(found).toBeNull();
  });
});
