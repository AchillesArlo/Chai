/**
 * Seed satu tenant + satu akun CLIENT_OWNER + satu akun PLATFORM_OWNER dengan
 * kredensial login NYATA (scrypt hash yang bisa lolos authenticateCredentials),
 * untuk pengujian end-to-end via browser.
 *
 * scripts/seed-api-runtime.mjs yang sudah ada membuat tenant + user_account
 * TAPI TIDAK membuat baris chai.user_credential — jadi user itu tidak bisa
 * login lewat form sama sekali. Skrip ini melengkapi itu.
 *
 * Usage (root package.json has no "type": "module", so run through a package
 * that does — @chai/database — rather than bare `pnpm tsx` from root):
 *   DATABASE_URL=postgres://chai_admin:...@localhost:5432/chai \
 *     pnpm --filter @chai/database exec tsx ../../scripts/seed-website-test-accounts.ts
 *
 * Aman dijalankan berulang (ON CONFLICT DO NOTHING / DO UPDATE pada password).
 */
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { hashPasswordScrypt } from '../../auth/src/scrypt';

/**
 * Minimal UUIDv7 generator (RFC 9562) using node:crypto only — no new
 * dependency. The schema's TenantIdSchema/UUID contract requires version 7
 * (timestamp-ordered) IDs, so a plain v4 randomUUID() fails validation.
 * Good enough for seed data; not a general-purpose implementation.
 */
function randomUUIDv7(): string {
  const unixMs = BigInt(Date.now());
  const bytes = randomBytes(16);
  bytes[0] = Number((unixMs >> 40n) & 0xffn);
  bytes[1] = Number((unixMs >> 32n) & 0xffn);
  bytes[2] = Number((unixMs >> 24n) & 0xffn);
  bytes[3] = Number((unixMs >> 16n) & 0xffn);
  bytes[4] = Number((unixMs >> 8n) & 0xffn);
  bytes[5] = Number(unixMs & 0xffn);
  bytes[6] = ((bytes.at(6) ?? 0) & 0x0f) | 0x70; // version 7
  bytes[8] = ((bytes.at(8) ?? 0) & 0x3f) | 0x80; // variant 10xx
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

// UUIDv7 tetap (dibuat sekali, ditempel di sini) supaya output skrip ini
// deterministik dan mudah dirujuk di test plan. Skema kontrak mewajibkan
// UUIDv7, bukan v4 acak — lihat randomUUIDv7() di atas.
const TENANT_ID = '01936b40-0000-7000-8000-000000000001';
const CLIENT_OWNER_USER_ID = '01936b40-0000-7000-8000-000000000002';
const CLIENT_OWNER_MEMBERSHIP_ID = '01936b40-0000-7000-8000-000000000003';
const PLATFORM_OWNER_USER_ID = '01936b40-0000-7000-8000-000000000004';

const CLIENT_OWNER_EMAIL = 'owner@websitetest.chai.local';
const PLATFORM_OWNER_EMAIL = 'founder@websitetest.chai.local';
// Password uji, BUKAN untuk produksi. 12+ karakter agar lolos LOGIN_PASSWORD_MIN.
const TEST_PASSWORD = 'WebsiteTest#2026';

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  const passwordHash = await hashPasswordScrypt(TEST_PASSWORD);

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO chai.tenant (id, slug, name, status)
      VALUES (${TENANT_ID}, 'website-test', 'Website Test Tenant', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING
    `;

    await tx`
      INSERT INTO chai.user_account (id, external_subject, display_name, status)
      VALUES
        (${CLIENT_OWNER_USER_ID}, 'seed|client-owner', 'Website Test Owner', 'ACTIVE'),
        (${PLATFORM_OWNER_USER_ID}, 'seed|platform-owner', 'Website Test Founder', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING
    `;

    await tx`
      INSERT INTO chai.membership (id, tenant_id, user_id, role, status)
      VALUES (${CLIENT_OWNER_MEMBERSHIP_ID}, ${TENANT_ID}, ${CLIENT_OWNER_USER_ID}, 'CLIENT_OWNER', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING
    `;

    // Kredensial client-portal: home_tenant_id diisi.
    await tx`
      INSERT INTO chai.user_credential (id, user_id, email, home_tenant_id, password_hash)
      VALUES (${randomUUIDv7()}, ${CLIENT_OWNER_USER_ID}, ${CLIENT_OWNER_EMAIL}, ${TENANT_ID}, ${passwordHash})
      ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, locked_until = NULL, failed_attempt_count = 0
    `;

    // Kredensial owner-console: home_tenant_id NULL (role dari platform_role_assignment).
    await tx`
      INSERT INTO chai.user_credential (id, user_id, email, home_tenant_id, password_hash)
      VALUES (${randomUUIDv7()}, ${PLATFORM_OWNER_USER_ID}, ${PLATFORM_OWNER_EMAIL}, NULL, ${passwordHash})
      ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, locked_until = NULL, failed_attempt_count = 0
    `;

    await tx`
      INSERT INTO chai.platform_role_assignment (id, user_id, role, status, granted_by)
      SELECT ${randomUUIDv7()}, ${PLATFORM_OWNER_USER_ID}, 'PLATFORM_OWNER', 'ACTIVE', ${PLATFORM_OWNER_USER_ID}
      WHERE NOT EXISTS (
        SELECT 1 FROM chai.platform_role_assignment
        WHERE user_id = ${PLATFORM_OWNER_USER_ID} AND status = 'ACTIVE'
      )
    `;
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenantId: TENANT_ID,
        clientPortal: { email: CLIENT_OWNER_EMAIL, password: TEST_PASSWORD },
        ownerConsole: { email: PLATFORM_OWNER_EMAIL, password: TEST_PASSWORD },
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end();
}
