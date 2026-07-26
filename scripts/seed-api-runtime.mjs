/**
 * Seed API runtime tenant + principals when DATABASE_URL is set.
 * Usage: DATABASE_URL=... pnpm seed:api
 */
import postgres from 'postgres';

const API_TENANT_ID = '01890f47-9b3c-7cc2-98e8-123456789203';
const API_TENANT_B_ID = '01890f47-9b3c-7cc2-98e8-123456789204';
const API_CLIENT_OWNER_ID = '01890f47-9b3c-7cc2-98e8-123456789205';
const API_CLIENT_VIEWER_ID = '01890f47-9b3c-7cc2-98e8-12345678920d';
const API_CLIENT_AGENT_ID = '01890f47-9b3c-7cc2-98e8-12345678920e';
const API_SERVICE_PRINCIPAL_ID = '01890f47-9b3c-7cc2-98e8-1234567892ff';
const API_CONTACT_ID = '01890f47-9b3c-7cc2-98e8-1234567893c1';
const API_OWNER_MEMBERSHIP_ID = '01890f47-9b3c-7cc2-98e8-1234567893d1';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  await sql.begin(async (tx) => {
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
  console.log(
    JSON.stringify({
      ok: true,
      tenantId: API_TENANT_ID,
      servicePrincipalId: API_SERVICE_PRINCIPAL_ID,
    }),
  );
} finally {
  await sql.end();
}
