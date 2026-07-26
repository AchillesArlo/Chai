import type { Database } from '@chai/database';

import {
  API_CLIENT_AGENT_ID,
  API_CLIENT_OWNER_ID,
  API_CLIENT_VIEWER_ID,
  API_CONTACT_ID,
  API_OWNER_MEMBERSHIP_ID,
  API_SERVICE_PRINCIPAL_ID,
  API_TENANT_B_ID,
  API_TENANT_ID,
} from './api-ids';

/**
 * Idempotent foundation for DATABASE_URL API runtime / integration tests.
 * Uses admin/runtime connection with enough privilege to insert tenants.
 */
export async function seedApiRuntime(database: Database): Promise<void> {
  await database.begin(async (tx) => {
    await tx`
      INSERT INTO chai.tenant (id, slug, name)
      VALUES
        (${API_TENANT_ID}, 'api-runtime', 'API Runtime Tenant'),
        (${API_TENANT_B_ID}, 'api-runtime-b', 'API Runtime Tenant B')
      ON CONFLICT (id) DO NOTHING
    `;
    await tx`
      INSERT INTO chai.user_account (id, external_subject, display_name)
      VALUES
        (${API_CLIENT_OWNER_ID}, 'local|client-owner', 'Client Owner'),
        (${API_CLIENT_VIEWER_ID}, 'local|client-viewer', 'Client Viewer'),
        (${API_CLIENT_AGENT_ID}, 'local|client-agent', 'Client Agent'),
        (${API_SERVICE_PRINCIPAL_ID}, 'local|service-principal', 'Service Principal')
      ON CONFLICT (id) DO NOTHING
    `;
    await tx`
      INSERT INTO chai.membership (id, tenant_id, user_id, role, status)
      VALUES
        (${API_OWNER_MEMBERSHIP_ID}, ${API_TENANT_ID}, ${API_CLIENT_OWNER_ID}, 'CLIENT_OWNER', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING
    `;
    await tx`
      INSERT INTO chai.contact (id, tenant_id, display_name)
      VALUES (${API_CONTACT_ID}, ${API_TENANT_ID}, 'Seed Contact')
      ON CONFLICT (id) DO NOTHING
    `;
  });
}
