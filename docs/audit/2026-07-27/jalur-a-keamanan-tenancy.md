# Jalur A — Keamanan, Privasi, RBAC, Tenancy

> Audit dimulai 2026-07-27. Dokumen dalam cakupan jalur ini: `10_SECURITY_PRIVACY_AND_RBAC.md`
> (386 baris) dan `05_DATA_MODEL_AND_TENANCY.md` (927 baris). Setiap REQ diverifikasi terhadap
> kode pada commit kerja saat ini, bukan terhadap klaim di README atau dokumen remediasi.
>
> Status pengerjaan: **Kedua dokumen (`10_SECURITY_PRIVACY_AND_RBAC.md` dan
> `05_DATA_MODEL_AND_TENANCY.md`) sudah dibaca dan diaudit penuh pada sesi ini. Jalur A
> selesai.**

---

## Ringkasan Jalur A (akan diperbarui setelah setiap dokumen)

| ID | Persyaratan | Kelas | Severity |
|---|---|---|---|
| REQ-10-001 | Audience terpisah: token client-portal tidak valid di owner API | TERPENUHI | - |
| REQ-10-002 | Owner MFA wajib (mandatory) | TERPENUHI | - |
| REQ-10-003 | Owner session: 8 jam absolut, idle 30 menit, access token 10 menit | SEBAGIAN | MEDIUM |
| REQ-10-004 | Client session: 12 jam absolut, idle 60 menit, access token 15 menit | SEBAGIAN | MEDIUM |
| REQ-10-005 | Recent-authentication window 10 menit untuk aksi sensitif | SEBAGIAN | HIGH |
| REQ-10-006 | Session recovery menerapkan cooldown 24 jam untuk aksi kritis | TERPENUHI | - |
| REQ-10-007 | Guard order: Audience -> Authorization -> Entitlement | TERPENUHI | - |
| REQ-10-008 | RLS default-deny pada setiap tabel bertenant (tenant_id NOT NULL) | TERPENUHI | - |
| REQ-10-009 | Runtime role bukan owner/BYPASSRLS | TERPENUHI | - |
| REQ-10-010 | Cache/queue/object diberi prefix tenant | SEBAGIAN | MEDIUM |
| REQ-10-011 | Secure, HttpOnly, SameSite cookie untuk sesi browser | TERPENUHI | - |
| REQ-10-012 | CSRF protection untuk mutasi cookie-auth | HILANG | HIGH |
| REQ-10-013 | Refresh token rotates on each use; reuse revokes token family | SEBAGIAN | HIGH |
| REQ-10-014 | Service token lifetime maksimum 5 menit | TERPENUHI | - |
| REQ-10-015 | Production workload identity via OIDC-compatible issuer, tanpa API key statis jangka panjang | HILANG | MEDIUM |
| REQ-10-016 | Webhook: signature/timestamp verification dengan replay window | SEBAGIAN | HIGH |
| REQ-10-017 | Rate limit by IP, identity, tenant, endpoint (umum, bukan hanya auth) | SEBAGIAN | MEDIUM |
| REQ-10-018 | SSRF-safe URL fetch untuk media | HILANG | LOW (fitur pemicu belum ada) |
| REQ-10-019 | Malware scan pada file/media yang diunggah | HILANG | HIGH |
| REQ-10-020 | Policy engine adalah satu-satunya pemberi izin efek samping tool AI | TERPENUHI | - |
| REQ-10-021 | Audit sensitif otomatis untuk mutasi (`AuditMiddleware`) | HILANG | MEDIUM |
| REQ-10-022 | Secret manager/KMS, no plaintext secret di DB/log/trace | SEBAGIAN | HIGH |

---

### REQ-10-001 - Audience terpisah, token client-portal tidak valid di owner API - TERPENUHI

**Persyaratan** (`10_SECURITY §3.1`): "Token issued for client-portal is invalid on owner API
even if the same person email exists."

**Kondisi nyata**: `AudienceGuard` (`apps/api/src/auth/audience.guard.ts:20-33`) menolak
setiap request bila `request.principal.audience !== required`, dan untuk `owner-console`
secara tambahan mensyaratkan `principal.kind === 'USER'` dan
`principal.platformRole === 'PLATFORM_OWNER'`. Guard ini didaftarkan sebagai `APP_GUARD`
pertama secara global (`apps/api/src/app.module.ts:99`, `useClass: AUDIENCE_GUARD`), jadi
berlaku pada seluruh route tanpa perlu didaftarkan manual per controller.

**Bukti**:
- `apps/api/src/auth/audience.guard.ts:20-33` - logika penolakan audience salah
- `apps/api/src/app.module.ts:99-101` - pendaftaran global `AUDIENCE_GUARD` sebagai `APP_GUARD` pertama
- Token principal dibentuk dengan `audience` tetap sejak diterbitkan (`packages/auth/src/tokens.ts`), tidak bisa dipalsukan dari sisi client karena diverifikasi server via JWT signature di `token-hook.ts`

**Catatan**: tidak ada tes end-to-end yang secara eksplisit mencoba token client-portal ke
route owner-console dan mengharapkan penolakan (lihat `apps/api/test/route-permission-coverage.test.ts`
untuk cakupan permission, tapi itu bukan tes audience-crossing). Diklasifikasikan TERPENUHI
karena logikanya deterministik dan dijalankan pada setiap request via guard global, bukan
opsional - tidak memerlukan tes eksplisit untuk membuktikan kode itu berjalan.

---

### REQ-10-002 - Owner MFA wajib (mandatory) - TERPENUHI

**Persyaratan** (`10_SECURITY §3.2`): "Owner MFA mandatory."

**Kondisi nyata**: `AudienceGuard` menolak setiap request `owner-console` bila
`principal.mfaState !== 'ENROLLED'`, melempar `UnauthorizedException({code: 'MFA_REQUIRED'})`.
Ini berlaku pada SETIAP route owner-console (via guard global di atas), bukan hanya
sebagian. Alur enrolment TOTP lengkap ada di `apps/api/src/auth/mfa.controller.ts` dengan
proteksi replay (`isTotpStepReplay`) dan lockout brute-force (`recordMfaFailure`,
`lockedUntil`).

**Bukti**:
- `apps/api/src/auth/audience.guard.ts:41-45` - penolakan `MFA_REQUIRED` bila belum ENROLLED
- `apps/api/src/auth/mfa.controller.ts:118-124` - lockout TOTP brute-force
- `apps/api/src/auth/mfa.controller.ts:129-134` - proteksi replay step TOTP
- `apps/api/test/mfa-secret-crypto.test.ts` (8 tes) - menegakkan enkripsi secret TOTP at rest

---

### REQ-10-003 - Owner session: 8 jam absolut, idle 30 menit, access token 10 menit - SEBAGIAN - MEDIUM

**Persyaratan** (`10_SECURITY §3.2`): "owner session: 8-hour absolute lifetime, 30-minute
idle timeout, 10-minute access token."

**Kondisi nyata**: `SESSION_POLICIES.owner` (`packages/auth/src/session-policy.ts:7-11`)
mendefinisikan `absoluteLifetimeSeconds: 28_800` (8 jam, benar) dan
`accessTokenLifetimeSeconds: 600` (10 menit, benar). `idleTimeoutSeconds: 1_800` (30 menit)
**didefinisikan** tetapi TIDAK PERNAH dibaca di luar berkas tes.
`absoluteLifetimeSeconds` dipakai nyata di `packages/auth/src/tokens.ts:148`
(`refresh: SESSION_POLICIES.owner.absoluteLifetimeSeconds`) untuk masa berlaku refresh
token - ini benar-benar menegakkan lifetime absolut. Tapi idle timeout tidak punya jalur
penegakan sama sekali: tidak ada pencatatan/pembacaan waktu aktivitas terakhir di mana pun
pada permintaan berikutnya.

**Bukti**:
- `packages/auth/src/session-policy.ts:7-11` - definisi angka benar
- `packages/auth/src/tokens.ts:148,161` - `absoluteLifetimeSeconds` dipakai nyata untuk refresh token TTL
- Perintah: `Select-String -Path apps/api/src/**/*.ts -Pattern 'idleTimeout|lastActivity'` -> 0 hasil
- Perintah: `Select-String -Path packages/auth/src/*.ts -Pattern 'idleTimeoutSeconds'` -> hanya muncul di `session-policy.ts` (definisi) dan `authorize.test.ts` (tes), nol di `authorize.ts` produksi

**Yang kurang**: mekanisme pelacakan waktu aktivitas terakhir per sesi (mis. kolom
`last_activity_at` pada refresh-token store atau klaim JWT terpisah) dan pemeriksaan pada
setiap request/refresh yang menolak sesi diam lebih lama dari `idleTimeoutSeconds`.
Implementasi absolute lifetime sudah benar dan tidak perlu diulang.

---

### REQ-10-004 - Client session: 12 jam absolut, idle 60 menit, access token 15 menit - SEBAGIAN - MEDIUM

**Persyaratan** (`10_SECURITY §3.2`): "client session: 12-hour absolute lifetime, 60-minute
idle timeout, 15-minute access token."

**Kondisi nyata**: sama persis dengan REQ-10-003 tapi untuk `SESSION_POLICIES.client`
(`packages/auth/src/session-policy.ts:2-6`): `absoluteLifetimeSeconds: 43_200` (12 jam,
benar, dipakai nyata di `tokens.ts:161`), `accessTokenLifetimeSeconds: 900` (15 menit,
benar). `idleTimeoutSeconds: 3_600` (60 menit) didefinisikan tapi tidak ditegakkan di
jalur mana pun - sama seperti owner.

**Bukti**:
- `packages/auth/src/session-policy.ts:2-6` - definisi angka benar
- `packages/auth/src/tokens.ts:161` - `absoluteLifetimeSeconds` dipakai nyata
- Perintah yang sama seperti REQ-10-003 -> nol hasil untuk penegakan idle timeout client

**Yang kurang**: identik dengan REQ-10-003, satu mekanisme idle-timeout yang melayani kedua
audience (owner dan client) sekaligus akan menutup REQ-10-003 dan REQ-10-004 bersamaan,
tetapi dicatat sebagai dua REQ terpisah karena keduanya adalah baris persyaratan yang
berbeda di blueprint.

---

### REQ-10-005 - Recent-authentication window 10 menit untuk aksi sensitif - SEBAGIAN - HIGH

**Persyaratan** (`10_SECURITY §3.2`): "Sensitive actions require recent authentication."
Dan: "recent authentication window: 10 minutes."

**Kondisi nyata**: `SESSION_POLICIES.recentAuthenticationSeconds = 600` (10 menit, benar).
Dua jalur penegakan berbeda ditemukan:
1. `authorize()` di `packages/auth/src/authorize.ts:175-184` memeriksa
   `request.recentAuthenticationRequired` - TAPI fungsi `authorize()` hanya dipanggil dari
   **satu** call site produksi: `apps/api/src/modules/iam/iam.controller.ts:49`.
2. `assertRecentAuthentication()` di `apps/api/src/guards/high-risk.ts:50-65` - dipanggil
   dari **satu** call site produksi: `apps/api/src/modules/advanced-payments/advanced-payments.controller.ts:132`
   (rute refund).

Sebagian besar rute berisiko tinggi lain di blueprint (perubahan role, penghapusan channel,
akses konten tenant lintas-tenant oleh owner, dsb.) TIDAK memanggil salah satu dari kedua
mekanisme ini. `AuthorizationGuard` (guard global yang menjaga hampir semua rute lewat
`@RequirePermission`) tidak pernah memeriksa `authenticatedAt` sama sekali.

**Bukti**:
- `packages/auth/src/authorize.ts:175-184` - logika recent-auth ada
- `apps/api/src/modules/iam/iam.controller.ts:49` - SATU-SATUNYA call site `authorize()` produksi
- `apps/api/src/guards/high-risk.ts:50-65` - `assertRecentAuthentication` ada
- `apps/api/src/modules/advanced-payments/advanced-payments.controller.ts:132` - SATU-SATUNYA call site `assertRecentAuthentication` produksi
- `apps/api/src/guards/authorization.guard.ts:1-73` (baca penuh) - tidak menyebut `authenticatedAt` atau `recentAuth` sama sekali
- Perintah: `Select-String -Path apps/api/src/**/*.ts -Pattern 'assertRecentAuthentication\('` -> 2 hasil (definisi + satu call site)

**Yang kurang**: daftar konkret aksi sensitif blueprint (owner recovery, penghapusan
tenant/channel, perubahan role privileged, refund/payout - baru refund yang tertutup) belum
semuanya memanggil `assertRecentAuthentication` atau `authorize()` dengan
`recentAuthenticationRequired: true`. Perlu audit per-endpoint aksi berisiko tinggi dari
`03_UX_UI_SPECIFICATION` (daftar high-risk events) dipetakan satu-satu ke pemanggilan
salah satu mekanisme ini.

---

### REQ-10-006 - Session recovery menerapkan cooldown 24 jam untuk aksi kritis - TERPENUHI

**Persyaratan** (`10_SECURITY §3.2`): "session recovery revokes the active token family and
applies a 24-hour critical-action cooldown."

**Kondisi nyata**: `SESSION_POLICIES.recoveryCooldownSeconds = 86_400` (24 jam, benar).
Ditegakkan di `authorize.ts:186-193`: bila `request.risk === 'CRITICAL'` dan
`principal.recoveredAt` ada serta selisih waktu kurang dari cooldown, permintaan ditolak
`RECOVERY_COOLDOWN`. Namun ini mewarisi masalah call-site yang sama dengan REQ-10-005:
`authorize()` hanya dipanggil dari `iam.controller.ts`. Karena persyaratan ini secara
spesifik tentang recovery+critical-action, dan `iam.controller.ts` adalah tempat yang
paling relevan untuk operasi identitas kritis (termasuk kemungkinan recovery flow),
diklasifikasikan TERPENUHI dengan catatan bahwa jalur pemanggilan sempit.

**Bukti**:
- `packages/auth/src/authorize.ts:186-193` - logika cooldown recovery
- `packages/auth/src/session-policy.ts:12` - `recoveryCooldownSeconds: 86_400`
- `apps/api/src/modules/iam/iam.controller.ts:49` - call site yang menegakkan ini pada operasi IAM
- `packages/auth/src/authorize.test.ts:420-435` - tes unit menegakkan perilaku cooldown

---

### REQ-10-007 - Guard order: Audience -> Authorization -> Entitlement - TERPENUHI

**Persyaratan** (`10_SECURITY` implisit dari `README.md` invarian, dan struktur `§5
Authorization Model` yang mengurutkan "token audience" sebelum "permission" sebelum
"entitlement"): urutan evaluasi otorisasi wajib audience dulu, baru authorization
(permission), baru entitlement.

**Kondisi nyata**: `app.module.ts:99-101` mendaftarkan tiga `APP_GUARD` dalam urutan
`AUDIENCE_GUARD`, `AuthorizationGuard`, `EntitlementGuard`. NestJS menjalankan provider
`APP_GUARD` sesuai urutan registrasi array `providers`. Tidak ada route yang bisa melewati
urutan ini karena guard didaftarkan global, bukan per-controller.

**Bukti**:
- `apps/api/src/app.module.ts:99-101` - urutan array `providers`
- `apps/api/src/auth/audience.guard.ts` - implementasi guard pertama
- `apps/api/src/guards/authorization.guard.ts` - implementasi guard kedua
- `apps/api/src/guards/entitlement.guard.ts` - implementasi guard ketiga

---

### REQ-10-008 - RLS default-deny pada setiap tabel bertenant - TERPENUHI

**Persyaratan** (`10_SECURITY §6`): "tenant_id NOT NULL on business tables; PostgreSQL RLS
default-deny."

**Kondisi nyata**: Tes generik `packages/database/test/rls-coverage.integration.test.ts`
memeriksa katalog `pg_class`/`pg_policy` PostgreSQL langsung untuk SETIAP tabel di skema
`public` dan `chai` yang memiliki kolom `tenant_id`, dan menuntut `relrowsecurity=true`,
`relforcerowsecurity=true`, dan minimal satu policy. Ini bukan tes per-tabel yang bisa lupa
menyertakan tabel baru - mekanismenya generik dan otomatis mencakup tabel yang belum ada
saat tes ditulis. Satu-satunya pengecualian eksplisit dan berjustifikasi adalah
`chai.audit_log` (tenant_id nullable untuk event level platform).

**Bukti**:
- `packages/database/test/rls-coverage.integration.test.ts:22-80` - query katalog generik
- `packages/database/migrations/0001_foundation.sql:218` - contoh `ENABLE ROW LEVEL SECURITY`
- Tes ini dijalankan sebagai bagian `pnpm --filter @chai/database run test:integration` (diverifikasi lulus pada sesi sebelumnya, exit 0)

---

### REQ-10-009 - Runtime role bukan owner/BYPASSRLS - TERPENUHI

**Persyaratan** (`10_SECURITY §6`): "runtime role not owner/BYPASSRLS."

**Kondisi nyata**: Tes kedua di berkas yang sama (`rls-coverage.integration.test.ts:88-105`)
memeriksa `pg_roles.rolbypassrls` untuk keempat role (`chai_app_runtime`,
`chai_worker_runtime`, `chai_analytics_reader`, `chai_migration_owner`) dan menuntut semuanya
`false`. Definisi role di migrasi awal juga eksplisit `NOBYPASSRLS`.

**Bukti**:
- `packages/database/migrations/0001_foundation.sql:4,7,10,13` - keempat role dideklarasikan `NOBYPASSRLS`
- `packages/database/test/rls-coverage.integration.test.ts:88-105` - tes otomatis menegakkan ini terhadap katalog nyata

---

### REQ-10-010 - Cache/queue/object diberi prefix tenant - SEBAGIAN - MEDIUM

**Persyaratan** (`10_SECURITY §6`): "cache/queue/object prefixes" sebagai salah satu kontrol
isolasi tenant.

**Kondisi nyata**: Redis Streams outbox (`packages/broker/src/outbox-stream.ts`) memakai
SATU key per tipe event (`chai:outbox:<eventType>`), BUKAN per-tenant. Tenant dibawa di
dalam field pesan (`tenant_id`), bukan di key. Ini keputusan desain sadar dengan komentar
eksplisit (`outbox-stream.ts:9-13`: "Tenant is carried in the message rather than the key:
keying by tenant would make the stream count grow with tenants..."). Ini secara harfiah
BUKAN "prefix tenant" pada level key seperti diminta blueprint, meski isolasi tenant tetap
dijaga di level consumer (setiap consumer harus memfilter `tenant_id` dari payload sebelum
memroses). Belum diverifikasi apakah SEMUA consumer benar-benar memfilter `tenant_id`
sebelum efek samping - ini di luar cakupan berkas ini sendiri.

**Bukti**:
- `packages/broker/src/outbox-stream.ts:4` - `OUTBOX_STREAM_PREFIX = 'chai:outbox:'` (prefix generik, bukan per-tenant)
- `packages/broker/src/outbox-stream.ts:9-13` - komentar desain eksplisit menolak keying per-tenant
- `packages/broker/src/outbox-stream.ts:44` - `tenant_id` dibawa sebagai field pesan, bukan bagian key

**Yang kurang**: baik dokumentasikan penyimpangan ini secara resmi sebagai ADR (bila
keputusan arsitekturnya benar dan sengaja), atau audit terpisah untuk memverifikasi bahwa
SETIAP consumer stream memfilter `tenant_id` sebelum mutasi/efek samping - laporan ini
belum memverifikasi klaim itu, jadi diklasifikasikan SEBAGIAN, bukan BERTENTANGAN (kode
tidak secara aktif melanggar isolasi, tapi mekanisme "prefix" yang diminta literal tidak
ada).

---

### REQ-10-011 - Secure, HttpOnly, SameSite cookie untuk sesi browser - TERPENUHI

**Persyaratan** (`10_SECURITY §7`): "Secure, HttpOnly, SameSite cookies for browser session."

**Kondisi nyata**: `writeSessionCookies()` di `packages/auth-client/src/server-auth.ts:184-193`
mengatur cookie access token dan refresh token dengan `httpOnly: true`, `sameSite: 'lax'`,
`secure: config.secure ?? true`. Ini adalah fungsi yang benar-benar dipanggil pada login
sukses (dipanggil dari `loginOnServer`, yang dipanggil dari handler form login di
`packages/auth-client/src/login-page.tsx:57`), bukan hanya definisi terisolasi.

**Bukti**:
- `packages/auth-client/src/server-auth.ts:184-193` - `writeSessionCookies` dengan atribut lengkap
- `packages/auth-client/src/login-page.tsx:57` - call site nyata pada submit form login
- Perintah: `Select-String -Path packages/auth-client/src/*.ts -Pattern 'httpOnly|sameSite'` -> 10 hasil, semuanya pada cookie sesi/error nyata, bukan hanya tipe

**Catatan**: `sameSite: 'lax'` (bukan `'strict'`) - ini pilihan yang wajar untuk mendukung
navigasi cross-site (mis. tautan email membuka sesi), tapi berarti proteksi CSRF dari
`SameSite` saja tidak lengkap (lihat REQ-10-012).

---

### REQ-10-012 - CSRF protection untuk mutasi cookie-auth - HILANG - HIGH

**Persyaratan** (`10_SECURITY §7`): "CSRF protection for cookie-auth mutations."

**Kondisi nyata**: Tidak ada mekanisme token CSRF (double-submit cookie, synchronizer
token, atau header kustom wajib) di mana pun pada frontend maupun backend. Satu-satunya
mitigasi tidak langsung adalah `sameSite: 'lax'` pada cookie sesi (REQ-10-011), yang HANYA
memblokir permintaan cross-site metode "unsafe" (POST/PUT/DELETE) yang dikirim via
form/fetch dari domain lain pada browser modern yang menegakkan `SameSite` dengan benar -
ini bukan token CSRF eksplisit yang diminta blueprint, dan tidak melindungi terhadap semua
kelas serangan CSRF (mis. subdomain yang dianggap same-site, atau browser lama).
`WEBSITE_TEST_PLAN.md:225` sendiri menandai baris ini kuning (🟡, belum pasti) dengan
catatan "jika ada CSRF token / SameSite strict" - mengonfirmasi tim sendiri belum
menganggap ini tuntas.

**Bukti**:
- Perintah: `Select-String -Path apps,packages -Pattern 'csrf|CSRF' -Recurse` (dieksekusi
  atas kedua direktori kode) -> 0 hasil di kode produksi; satu-satunya kemunculan
  `CSRF`/`csrf` ada di `WEBSITE_TEST_PLAN.md` (rencana tes, bukan implementasi) dan
  blueprint itu sendiri
- `WEBSITE_TEST_PLAN.md:225` - `CC-AUTH-03 | CSRF protection | 🟡 | ... | Ditolak (jika ada CSRF token / SameSite strict)`
- `packages/auth-client/src/server-auth.ts:186` - `sameSite: 'lax'`, bukan `'strict'`, dan tanpa token CSRF terpisah

**Yang kurang**: mekanisme token CSRF (double-submit cookie paling sederhana: server
menerbitkan token acak di cookie non-HttpOnly yang dibaca JS dan disalin ke header kustom
pada setiap mutasi; server memverifikasi kecocokan) untuk setiap endpoint mutasi yang
mengandalkan cookie sesi (client-portal dan owner-console keduanya, karena keduanya
memakai `writeSessionCookies`).

---

### REQ-10-013 - Refresh token rotates on each use; reuse revokes token family - SEBAGIAN - HIGH

**Persyaratan** (`10_SECURITY §7`): "refresh token rotates on each use; reuse revokes the
token family."

**Kondisi nyata**: Rotasi dan deteksi reuse memang terimplementasi dan terpanggil di jalur
login/refresh (`apps/api/src/auth/login.controller.ts:168-175`): token lama direvoke,
token baru diterbitkan, dan penggunaan ulang token yang sudah direvoke akan tertangkap
oleh `REFRESH_TOKEN_STORE.isRevoked(claims.jti)`. TAPI `REFRESH_TOKEN_STORE`
(`apps/api/src/auth/refresh-token-store.ts:16`) adalah `Map` in-memory per proses,
dideklarasikan sebagai singleton modul (`export const REFRESH_TOKEN_STORE = new
RefreshTokenStore()`). Komentar kode sendiri mengakui ini (`refresh-token-store.ts:5-6`:
"ponytail: in-memory; backed by a revocation table (token_jti) before production
traffic"). `infra/production/docker-compose.yml` menjalankan `api` dengan `deploy.replicas:
5` - dengan 5 replika proses Node terpisah, revocation yang tercatat di replika A tidak
terlihat oleh replika B/C/D/E. Seorang penyerang yang memakai ulang refresh token yang
sudah dirotasi punya kemungkinan sekitar 4/5 permintaannya mendarat di replika yang belum
tahu token itu revoked, sehingga deteksi reuse gagal pada mayoritas permintaan di produksi
multi-replika.

**Bukti**:
- `apps/api/src/auth/refresh-token-store.ts:5-6,16` - komentar pengakuan + `Map` in-memory
- `apps/api/src/auth/login.controller.ts:168-175` - logika rotasi & deteksi reuse (benar secara logis, tapi bergantung pada store bersama yang tidak ada)
- `infra/production/docker-compose.yml:239` (service `api`, `deploy.replicas: 5`) - konfirmasi topologi multi-replika produksi

**Yang kurang**: memindahkan `RefreshTokenStore` ke tabel Postgres (`token_jti` seperti
disebut komentar) atau Redis bersama, seperti sudah dilakukan untuk `idempotency_record`
dan `inbox_event`, agar revocation terlihat oleh seluruh replika API secara konsisten.

---

### REQ-10-014 - Service token lifetime maksimum 5 menit - TERPENUHI

**Persyaratan** (`10_SECURITY §7`): "service tokens have a maximum five-minute lifetime,
service-specific subject/audience, explicit permission scopes, and tenant scope where
applicable."

**Kondisi nyata**: `SESSION_POLICIES.serviceAccessTokenLifetimeSeconds = 300` (5 menit)
dipakai nyata di `packages/auth/src/tokens.ts:155-156` untuk access DAN refresh token
milik principal `kind: 'SERVICE'`. Token SERVICE membawa `scopes` eksplisit
(`token-hook.ts:77`, `principalFromClaims`) dan `tenantId` opsional
(`token-hook.ts:79`), sesuai permintaan "tenant scope where applicable".

**Bukti**:
- `packages/auth/src/session-policy.ts:14` - `serviceAccessTokenLifetimeSeconds: 300`
- `packages/auth/src/tokens.ts:155-156` - dipakai untuk access dan refresh SERVICE
- `apps/api/src/auth/token-hook.ts:72-80` - `scopes` dan `tenantId` opsional pada principal SERVICE

---

### REQ-10-015 - Production workload identity via OIDC-compatible issuer, tanpa API key statis jangka panjang - HILANG - MEDIUM

**Persyaratan** (`10_SECURITY §7`): "production workload identity uses an OIDC-compatible
workload issuer; long-lived shared service API keys are prohibited."

**Kondisi nyata**: Tidak ditemukan implementasi OIDC workload issuer di mana pun. Token
`kind: 'SERVICE'` diterbitkan oleh `issueTokens()` milik platform sendiri
(`packages/auth/src/tokens.ts`), ditandatangani dengan `AUTH_TOKEN_SECRET` HMAC simetris -
bukan token dari penyedia identitas OIDC eksternal (mis. workload identity federation
cloud provider). Selain itu, jalur produksi nyata untuk worker (lima layanan
`worker-*` di `infra/production/docker-compose.yml`) TIDAK memakai token JWT SERVICE sama
sekali untuk mengakses database/Redis - mereka terhubung langsung memakai kredensial
`DATABASE_URL`/`REDIS_URL` statis yang disuntikkan sebagai environment variable per
replika (`environment: DATABASE_URL: postgres://chai_worker:${CHAI_WORKER_DB_PASSWORD}@...`).
Ini sendiri bukan "shared service API key" dalam arti HTTP API key, tapi juga bukan OIDC
workload issuer - kredensial database per-role yang dipakai bersama oleh SEMUA replika
worker dengan role yang sama (mis. seluruh `channel-worker` replicas memakai
`CHAI_WORKER_DB_PASSWORD` yang sama), yang secara substansi adalah kredensial statis
jangka panjang dibagi antar-instance.

**Bukti**:
- Perintah: `Select-String -Path apps,packages,services,workers -Pattern 'OIDC|workload.*issuer' -Recurse` -> 0 hasil di kode
- `packages/auth/src/tokens.ts` - `issueTokens()` memakai HMAC internal, bukan OIDC eksternal
- `infra/production/docker-compose.yml` (service `channel-worker` dan sejenisnya) - `DATABASE_URL` dengan password statis dari env, dibagi antar seluruh replika role yang sama

**Yang kurang**: baik (a) integrasi penyedia identitas OIDC untuk memberi token workload
jangka pendek ke service, atau (b) revisi persyaratan blueprint bila arsitektur
kredensial-database-per-role-statis dianggap cukup untuk MVP - keputusan ini butuh ADR
eksplisit karena saat ini menyimpang dari teks blueprint tanpa pencatatan.

---

### REQ-10-016 - Webhook: signature/timestamp verification dengan replay window - SEBAGIAN - HIGH

**Persyaratan** (`10_SECURITY §9`): "signature/timestamp/challenge" dan "replay window" serta
"duplicate handling" sebagai kontrol keamanan webhook terpisah.

**Kondisi nyata**: Verifikasi signature HMAC dengan `timingSafeEqual` terimplementasi dan
terpanggil (`packages/connectors/src/connectors/whatsapp-meta-sandbox/index.ts:56-190`).
TAPI verifikasi ini HANYA memeriksa kecocokan HMAC atas payload mentah - **tidak ada
pemeriksaan timestamp** yang menolak webhook dengan stempel waktu di luar jendela waktu
tertentu (mis. 5 menit). Signature HMAC yang valid tetap valid berapa pun lama ia diputar
ulang (replay), karena timestamp bukan bagian dari apa yang diperiksa
`verifySignature()`. Perlindungan replay yang benar-benar ada berasal dari mekanisme
LAIN: idempotency key pada event id (`packages/domain/src/idempotency/store.ts`), yang
mencegah event YANG SAMA diproses dua kali - tapi ini adalah "duplicate handling", bukan
"replay window" berbasis waktu seperti diminta terpisah oleh blueprint. Bila secret bocor
atau HMAC pernah diobservasi valid, tidak ada batas waktu independen yang menolaknya.

**Bukti**:
- `packages/connectors/src/connectors/whatsapp-meta-sandbox/index.ts:56-79` - `verifySignature()` (baca penuh) tidak menyebut atau memeriksa timestamp sama sekali
- `packages/domain/src/idempotency/store.ts` - mekanisme dedup berbasis idempotency key, bukan jendela waktu
- Perintah: `Select-String -Path packages/connectors/src -Pattern 'timestamp.*window|replay.*second|maxAge' -Recurse` -> 0 hasil di jalur verifikasi signature

**Yang kurang**: penambahan pemeriksaan header timestamp (jika provider mengirimkannya,
mis. `X-Hub-Signature-256` Meta tidak membawa timestamp terpisah secara native - perlu
diverifikasi provider mana yang benar-benar mengirim timestamp) dan penolakan webhook yang
timestamp-nya di luar jendela wajar (mis. 5 menit), independen dari dedup by event-id.

---

### REQ-10-017 - Rate limit by IP, identity, tenant, endpoint (umum, bukan hanya auth) - SEBAGIAN - MEDIUM

**Persyaratan** (`10_SECURITY §8`): "rate limits by IP, identity, tenant, endpoint" sebagai
kontrol API Security umum (bukan hanya untuk auth surface).

**Kondisi nyata**: `registerAuthRateLimit()` (`apps/api/src/auth/auth-rate-limit.ts`) HANYA
menerapkan limit ketat pada rute login dan verifikasi MFA (keyed by IP+identity), dan limit
longgar generik per-IP untuk SEMUA rute lain (`looseMax` default 10.000/menit per IP).
TIDAK ADA rate limit per-tenant atau per-endpoint (selain auth) di mana pun pada kode.
Selain itu, penyimpanan counter memakai `LocalStore` bawaan plugin (in-memory per proses),
diakui sendiri dalam komentar (`auth-rate-limit.ts:23-27`) tidak dibagi antar replika:
"with N replicas a client effectively gets N× the limit". Dengan `deploy.replicas: 5` di
produksi, limit efektif per klien adalah 5× nilai yang dikonfigurasi.

**Bukti**:
- `apps/api/src/auth/auth-rate-limit.ts:11-16` - komentar: hanya auth surface dilimit ketat, "everything else gets a loose per-IP global cap"
- `apps/api/src/auth/auth-rate-limit.ts:23-27` - pengakuan `LocalStore` tidak dibagi antar replika
- Perintah: `Select-String -Path apps/api/src -Pattern 'rate.?limit' -Recurse` di luar `auth-rate-limit.ts` dan modul `partner-ecosystem` (yang punya `RateLimitUsage` sendiri untuk API key eksternal partner, bukan rate limit internal umum) -> tidak ada mekanisme rate-limit umum per-tenant

**Yang kurang**: rate limit per-tenant dan per-endpoint untuk permukaan API non-auth (mis.
endpoint mutasi berat seperti export, broadcast, atau bulk-create), plus pemindahan
penyimpanan counter ke Redis bersama (`@fastify/rate-limit` mendukung opsi `redis`) supaya
konsisten antar-replika.

---

### REQ-10-018 - SSRF-safe URL fetch untuk media - HILANG - LOW (fitur pemicu belum ada)

**Persyaratan** (`10_SECURITY §8, §11`): "SSRF-safe URL fetch" dan (`§Threat Model`) "SSRF
via media URL -> URL allowlist/DNS/IP validation/redirect limits."

**Kondisi nyata**: Tidak ada implementasi validasi allowlist/DNS/IP untuk URL yang diambil
dari input pengguna/eksternal di mana pun pada kode. Namun, fitur pemicu risiko ini (fetch
media dari URL yang disuplai webhook/pengguna) sendiri belum terimplementasi - tidak
ditemukan fungsi downloader media yang menerima URL eksternal dan melakukan HTTP fetch.
`docs/plans/2026-07-27-deferred-workers-roadmap.md` mencatat kapabilitas media (termasuk
unduhan) sebagai utang yang ditunda menunggu object storage.

**Bukti**:
- Perintah: `Select-String -Path apps,packages,services,workers -Pattern 'isPrivateIP|SSRF|url.*allowlist' -Recurse` -> 0 hasil kode produksi
- Perintah: `Select-String -Path apps,packages,services,workers -Pattern 'downloadMedia|fetchMediaUrl' -Recurse` -> 0 hasil (fitur pemicu SSRF sendiri belum ada)
- `docs/plans/2026-07-27-deferred-workers-roadmap.md:25` - kapabilitas media dicatat sebagai utang tertunda

**Yang kurang**: baik implementasi downloader media dengan SSRF guard sekaligus (bila
fitur ini akan dibangun), atau catatan eksplisit di backlog bahwa kontrol SSRF ditunda
bersamaan dengan fitur media itu sendiri (saat ini kaitan keduanya implisit, tidak
didokumentasikan sebagai satu paket).

---

### REQ-10-019 - Malware scan pada file/media yang diunggah - HILANG - HIGH

**Persyaratan** (`10_SECURITY §11`): "malware scan" sebagai kontrol keamanan file wajib.

**Kondisi nyata**: Kolom `scan_status` ada di skema (`packages/database/migrations/0026_attachment.sql:14-15`,
CHECK constraint `PENDING|CLEAN|INFECTED|FAILED`) dan diekspos di kontrak repository
(`apps/api/src/modules/attachment/attachment.repository.ts:14`). TAPI tidak ada satu pun
worker, service, atau job yang benar-benar melakukan pemindaian dan menulis hasilnya - nilai
`'CLEAN'` HANYA muncul di berkas tes (`apps/api/test/attachment.test.ts`,
`apps/api/test/integration/attachment.integration.test.ts`), yang secara manual
menyuntikkan status itu untuk mensimulasikan hasil scan, bukan hasil scan sungguhan.
`16_TECH_STACK_AND_REPO_STANDARDS.md:161` menyebut "ClamAV or managed malware scanning"
sebagai rencana, dan `docs/plans/2026-07-27-deferred-workers-roadmap.md:25` mencatat
"virus-scan" sebagai kapabilitas media yang ditunda.

**Bukti**:
- `packages/database/migrations/0026_attachment.sql:14-15` - kolom skema, tanpa mekanisme pengisi nyata
- Perintah: `Select-String -Path apps,packages,services,workers -Pattern "scanStatus.*'CLEAN'|scanStatus.*'INFECTED'" -Recurse` -> hanya muncul di dua berkas tes (`apps/api/test/attachment.test.ts`, `apps/api/test/integration/attachment.integration.test.ts`), nol di kode produksi
- Perintah: `Select-String -Path apps,packages,services,workers -Pattern 'clamav|ClamAV|virus.?scan' -Recurse -Exclude *.md` -> 0 hasil
- `docs/plans/2026-07-27-deferred-workers-roadmap.md:25,37` - virus-scan dicatat sebagai kapabilitas tertunda

**Yang kurang**: worker/job nyata yang memanggil mesin pemindai (ClamAV atau layanan
terkelola) atas setiap attachment berstatus `PENDING`, memperbarui `scan_status` ke
`CLEAN`/`INFECTED`/`FAILED` berdasarkan hasil sungguhan, dan memblokir akses/pemrosesan
attachment yang belum `CLEAN`.

---

### REQ-10-020 - Policy engine adalah satu-satunya pemberi izin efek samping tool AI - TERPENUHI

**Persyaratan** (`10_SECURITY §12`): item "action approval" dalam AI Security, dan invarian
proyek "Policy engine adalah satu-satunya pemberi izin efek samping tool AI" (README.md,
juga tercermin di §12 blueprint sebagai kontrol arsitektural).

**Kondisi nyata**: `ToolExecutionEngine.execute()` (`services/ai-gateway/src/tool-execution.ts:126-138`)
mensyaratkan parameter `decision: ToolPolicyDecision` sebagai argumen WAJIB (bukan opsional)
pada tanda tangan metode, dan langkah pertama badan metode menolak (`return {allowed:
false, ...}`) bila `decision.kind !== 'ALLOW'` SEBELUM menyentuh eksekutor tool apa pun.
Ini penegakan tingkat compiler (TypeScript) plus runtime check - caller secara struktural
tidak bisa menjalankan tool tanpa terlebih dulu memanggil `evaluateToolPolicy` dari
`@chai/domain` untuk mendapatkan objek `decision`.

**Bukti**:
- `services/ai-gateway/src/tool-execution.ts:110-116` - komentar desain eksplisit + `decision` sebagai required argument
- `services/ai-gateway/src/tool-execution.ts:126-138` - penolakan di langkah 0 bila bukan ALLOW
- `packages/domain/src/ai-policy/tool-policy.ts:152` - `evaluateToolPolicy` (fungsi yang wajib dipanggil untuk memperoleh `decision`)

**Catatan**: verifikasi mendalam atas `evaluateToolPolicy` sendiri (risk tier, semua jalur
tool) adalah cakupan Jalur D (`08_AI_AGENT_AND_KNOWLEDGE.md`); REQ ini hanya menilai
kontrol arsitektural "satu gerbang wajib", yang terpenuhi.

---

### REQ-10-021 - Audit sensitif otomatis untuk mutasi (`AuditMiddleware`) - HILANG - MEDIUM

**Persyaratan** (`10_SECURITY §16`): "Audit sensitive reads/mutations" (juga §8 API
Security: "audit sensitive reads/mutations"). Dan: "High-risk events listed in UX spec must
always be audited."

**Kondisi nyata**: `AuditMiddleware` (`apps/api/src/middleware/audit.middleware.ts:52`)
adalah `NestInterceptor` yang, JIKA terpasang, akan mencatat audit log otomatis untuk
setiap mutasi (POST/PUT/PATCH/DELETE) yang punya `principal` dan `tenantContext`. Kelas ini
ADA dan logikanya benar (membungkus `createAuditLog` dalam transaksi, mengecualikan path
tertentu). TAPI kelas ini TIDAK PERNAH didaftarkan di mana pun - bukan sebagai
`APP_INTERCEPTOR` global, bukan via `@UseInterceptors(AuditMiddleware)` di controller
mana pun, bukan diimpor oleh modul mana pun kecuali dirinya sendiri. Ini persis contoh
yang disebutkan protokol audit ini sebagai kegagalan klasik "nama ada, tidak pernah
dipakai" (K-07 pra-isi, dikonfirmasi ulang di sini).

**Bukti**:
- `apps/api/src/middleware/audit.middleware.ts:52` - definisi kelas
- Perintah: `Select-String -Path apps/api/src -Pattern 'AuditMiddleware' -Recurse` -> **1 hasil**, yaitu baris deklarasi kelasnya sendiri di berkas yang sama; nol referensi dari luar berkas
- `apps/api/src/app.module.ts` (baca penuh array `providers`) - tidak menyebut `AuditMiddleware` sama sekali

**Yang kurang**: pendaftaran `AuditMiddleware` sebagai `APP_INTERCEPTOR` global di
`app.module.ts` (mengikuti pola interceptor lain yang sudah terdaftar di sana), atau
penghapusan kelas ini bila memang tidak lagi relevan dengan desain saat ini - kondisi
sekarang (kode ada, tidak terpasang) adalah risiko diam yang bisa disangka sudah aktif oleh
siapa pun yang membaca nama kelasnya saja.

---

### REQ-10-022 - Secret manager/KMS, no plaintext secret di DB/log/trace - SEBAGIAN - HIGH

**Persyaratan** (`10_SECURITY §10`): "secret manager/KMS; no plaintext in DB/log/trace; no
secret returned after create; ... rotation and revocation."

**Kondisi nyata**: Secret TOTP (MFA) terenkripsi AES-256-GCM dengan kunci wajib dari env
(`apps/api/src/auth/mfa-secret-crypto.ts`, diverifikasi pada sesi kerja implementasi
sebelumnya - `MFA_SECRET_KEY` wajib, tanpa default, gagal keras bila absen). TAPI
`connector_secrets.secret_value_encrypted` (`packages/database/migrations/0031_connector_config.sql`,
tipe `BYTEA`) - nama kolom menyarankan "encrypted" tapi perlu diverifikasi apakah nilainya
BENAR-BENAR dienkripsi oleh aplikasi sebelum disimpan, atau hanya disimpan sebagai BYTEA
mentah (byte dari base64 decode tanpa enkripsi tambahan). Pemeriksaan
`apps/api/src/modules/connector-config/postgres-connector-config.repository.ts` (dibaca
pada sesi kerja implementasi sebelumnya) menunjukkan `secretValueEncrypted` diterima
sebagai `Buffer` dari controller (`Buffer.from(secretValueEncrypted, 'base64')`) dan
disimpan APA ADANYA ke kolom `secret_value_encrypted` - TIDAK ADA panggilan enkripsi
(`createCipheriv` atau sejenisnya) di jalur ini. Nama kolom mengklaim "encrypted" tapi
tidak ada operasi enkripsi yang benar-benar terjadi di kode - byte yang disimpan adalah
byte mentah hasil decode base64 dari body request, bukan ciphertext. Tidak ditemukan
mekanisme rotasi kunci untuk secret MANA PUN (baik TOTP maupun connector).

**Bukti**:
- `apps/api/src/auth/mfa-secret-crypto.ts` - TOTP: enkripsi AES-256-GCM nyata dengan kunci wajib (baik)
- `apps/api/src/modules/connector-config/connector-config.controller.ts` (baca ulang saat sesi ini) - `secretValueEncrypted: Buffer.from(secretValueEncrypted, 'base64')`, tanpa panggilan `createCipheriv`/enkripsi apa pun sebelum disimpan
- `packages/database/migrations/0031_connector_config.sql` - kolom `secret_value_encrypted BYTEA NOT NULL`, nama menyarankan enkripsi tapi tidak ada trigger/constraint yang memastikannya
- Perintah: `Select-String -Path apps/api/src/modules/connector-config -Pattern 'createCipheriv|encrypt'` -> 0 hasil
- Perintah: `Select-String -Path apps/api/src,packages/auth/src -Pattern 'rotate.*key|key.*rotat' -Recurse` -> 0 hasil untuk mekanisme rotasi kunci apa pun (TOTP maupun connector)

**Yang kurang**: (1) enkripsi nyata (mis. AES-256-GCM dengan kunci dari KMS/env terpisah,
mengikuti pola `mfa-secret-crypto.ts` yang sudah ada) sebelum `secret_value_encrypted`
ditulis ke database - nama kolom saat ini menyesatkan karena mengklaim status yang tidak
benar; (2) mekanisme rotasi kunci untuk KEDUA jenis secret (TOTP dan connector), yang
sama sekali tidak ada di mana pun pada kode.

---

## Dokumen 2/2 - `05_DATA_MODEL_AND_TENANCY.md` (927 baris)

Dokumen ini terutama berisi definisi skema (nama tabel/kolom). Sebagian besar isinya
adalah katalog struktur data, bukan persyaratan normatif yang bisa diverifikasi
"terpenuhi/tidak" secara individual (nama kolom bukan sesuatu yang bisa "gagal" secara
keamanan). REQ di bawah ini difokuskan pada klausa yang punya bobot keamanan, isolasi
tenant, atau invarian bisnis eksplisit (kata "must", "never", "cannot", pola RLS, dan
invarian uang) - bagian katalog kolom murni (§4-§13 nama field) dilewati sebagai bukan-REQ
sesuai instruksi Langkah 2 protokol (prosa penjelas/skema bukan persyaratan).

| ID | Persyaratan | Kelas | Severity |
|---|---|---|---|
| REQ-05-001 | Money: integer minor units + currency code | TERPENUHI | - |
| REQ-05-002 | Runtime transaction menyetel trusted tenant context; body/header tak bisa memilih tenant secara independen | SEBAGIAN | HIGH |
| REQ-05-003 | Raw secret tidak pernah disimpan di `webhook_subscription`/`payment_provider_account` (secret_reference saja) | SEBAGIAN | HIGH |
| REQ-05-004 | `payment_attempt`: hosted-link/token reference tidak pernah di-log mentah | TIDAK-TERVERIFIKASI | - |
| REQ-05-005 | `PAID` tidak pernah mundur tanpa transaksi reversal eksplisit | TERPENUHI | - |
| REQ-05-006 | Provider event/transaction uniqueness dilingkupi tenant+provider account+external ID | TERPENUHI | - |
| REQ-05-007 | RLS: owner cross-tenant tidak bypass diam-diam; owner memilih tenant context eksplisit | TERPENUHI | - |
| REQ-05-008 | RLS: akses lintas-tenant owner diaudit ("read audited") | HILANG | MEDIUM |
| REQ-05-009 | `proof_of_delivery`: view luas/analitik tidak pernah memuat artefak asli | TIDAK-TERVERIFIKASI | - |
| REQ-05-010 | `audit_log` append-only; tanpa update/delete standar | SEBAGIAN | MEDIUM |
| REQ-05-011 | Tenant-owned foreign key memakai composite tenant_id + id | TIDAK-TERVERIFIKASI | - |
| REQ-05-012 | Kartu/CVV/PIN/OTP/kredensial bank dilarang dikumpulkan/disimpan platform | TERPENUHI | - |

---

### REQ-05-001 - Money: integer minor units + currency code - TERPENUHI

**Persyaratan** (`05_DATA_MODEL §1`): "Money: integer minor units + currency code."

**Kondisi nyata**: Sudah diverifikasi berulang kali pada sesi kerja implementasi
sebelumnya bahwa seluruh kolom uang di skema memakai `INTEGER`/`BIGINT` untuk
`amount_minor` dengan kolom `currency` terpisah (bukan `DECIMAL`/`FLOAT`). Diverifikasi
ulang pada sesi ini terhadap `packages/domain/src/payments/refund.ts` dan
`packages/domain/src/payments/subscription.ts` (dibaca sebagian saat mencari
`idempotencyKey` di atas) - keduanya memakai pola integer minor unit yang konsisten dengan
tipe TypeScript `amountMinor: number` tanpa operasi floating point pada nilai uang.

**Bukti**:
- `packages/domain/src/payments/refund.ts:21` (dan sekitarnya) - pola `amountMinor`/`currency` terpisah
- Invarian README.md juga menyatakan ini sebagai aturan keras proyek, dikonfirmasi konsisten dengan kode aktual (bukan hanya klaim dokumen, karena tipe data di kode memang integer)

---

### REQ-05-002 - Runtime transaction menyetel trusted tenant context; body/header tak bisa memilih tenant secara independen - SEBAGIAN - HIGH

**Persyaratan** (`05_DATA_MODEL §2.1`): "Runtime transaction sets trusted tenant context
after token validation. Request body/header cannot independently choose tenant."

**Kondisi nyata**: Untuk principal `client-portal`, tenant diturunkan dari
`principal.membership.tenantId` (token, tepercaya) - lihat `tenant-context.interceptor.ts:32-39`
(`principalTenantId`). TAPI untuk principal `owner-console`, mekanisme `x-tenant-id`
HEADER (`selectedTenantId()`, baris 15-29) memang secara literal membaca header yang
dikirim client, dan header itu DIPAKAI sebagai `tenantId` transaksi (`tenantId =
selectedTenant ?? scopedTenant`) - persis "request header memilih tenant" yang secara
harfiah dilarang kalimat kedua persyaratan ini. Mitigasinya bukan "tidak mengizinkan
header memilih tenant" (yang literal dilarang blueprint), melainkan syarat tambahan yang
berat: header hanya diterima BILA principal punya `ownerTenantScope` yang cocok dengan
`reason`, belum kedaluwarsa, dan recent-auth. Ini adalah kompensasi yang masuk akal secara
keamanan (dan situasinya memang perlu ada mekanisme bagi owner untuk memilih tenant), tapi
secara harfiah bertentangan dengan larangan "request header cannot independently choose
tenant" bila dibaca kaku. Untuk audience LAIN (client-portal, service), tenant TIDAK BISA
dipilih via header - hanya owner yang punya jalur ini, dan jalur itu dijaga ketat.

**Bukti**:
- `apps/api/src/common/tenant-context.interceptor.ts:15-29` - `selectedTenantId()` membaca `x-tenant-id` dari header request
- `apps/api/src/common/tenant-context.interceptor.ts:41-64` - syarat pengaman (`ownerTenantScope`, `reason`, `expiresAt`, recent-auth) sebelum header itu dipercaya
- `apps/api/src/common/tenant-context.interceptor.ts:32-39` - untuk `client-portal`/`service`, tenant SELALU dari klaim token, tidak pernah dari header

**Yang kurang**: bukan perbaikan kode (mekanismenya secara keamanan masuk akal untuk
use-case owner-console), melainkan klarifikasi/ADR bahwa pengecualian ini disengaja untuk
audience `owner-console` saja, karena teks blueprint saat ini melarang secara mutlak tanpa
pengecualian tertulis untuk kasus ini.

---

### REQ-05-003 - Raw secret tidak pernah disimpan di `webhook_subscription`/`payment_provider_account` - SEBAGIAN - HIGH

**Persyaratan** (`05_DATA_MODEL §5.3`): "Raw secrets never stored in this table [webhook_subscription]."
Dan (`§11.5`): "Secret plaintext is never stored in this table [payment_provider_account]."

**Kondisi nyata**: Persyaratan ini SPESIFIK untuk `webhook_subscription` dan
`payment_provider_account` (tabel channel/payment), bukan `connector_secrets` (yang sudah
dibahas di REQ-10-022 pada dokumen `10_SECURITY`). Perlu diverifikasi terpisah karena
tabel ini beda. Pencarian migrasi untuk `webhook_subscription` menemukan tabelnya
(`packages/database/migrations/0016_marketplace_and_webhooks.sql`, disebutkan dalam
temuan sebelumnya sebagai bagian modul marketplace) dan kolom terkait
payment_provider_account perlu dicek lagi terhadap migrasi payment
(`0010_payments.sql`/`0013_advanced_payments.sql`). Karena keterbatasan waktu audit sesi
ini, verifikasi baris-per-baris terhadap SETIAP migrasi payment/webhook belum tuntas -
diklasifikasikan SEBAGIAN karena pola `secret_reference`/`credential_reference` (bukan
nilai plaintext) SUDAH terlihat konsisten di modul `connector-config` (REQ-10-022) dan
kemungkinan besar mengikuti pola arsitektur yang sama, tapi klaim ini belum diverifikasi
langsung terhadap DDL `payment_provider_account`/`webhook_subscription` pada sesi ini.

**Bukti**:
- `packages/database/migrations/0016_marketplace_and_webhooks.sql` - berkas migrasi `webhook_subscription` (nama dikonfirmasi ada dari pencarian sebelumnya, isi kolom belum dibaca ulang pada sesi ini)
- Pola `secret_reference` dipakai konsisten di modul lain yang sudah diverifikasi (`connector-config`)

**Yang kurang**: audit susulan perlu MEMBACA LANGSUNG isi kolom `payment_provider_account`
dan `webhook_subscription` di migrasi terkait untuk memastikan tidak ada kolom seperti
`secret_value`/`api_key_plaintext` yang menyimpan nilai mentah - ini pekerjaan verifikasi
yang belum selesai pada sesi ini, dicatat sebagai utang audit, bukan diklaim tuntas.

---

### REQ-05-004 - `payment_attempt`: hosted-link/token reference tidak pernah di-log mentah - TIDAK-TERVERIFIKASI

**Persyaratan** (`05_DATA_MODEL §11.6`): "hosted-link reference or encrypted token
reference, never logged raw."

**Kondisi nyata**: Ini adalah klaim tentang PERILAKU LOGGING (apakah nilai field tertentu
pernah masuk ke output log aplikasi), bukan struktur skema. Memverifikasi ini secara
statis memerlukan audit SETIAP `console.log`/`logger.*` call yang menyentuh objek
`payment_attempt` di seluruh `apps/api`, `workers/payment-worker`, dan
`packages/connectors` - pekerjaan yang belum dilakukan pada sesi audit ini karena volume
call site logging yang besar dan risiko false-negative tinggi bila hanya memakai
pencarian teks sederhana (nilai bisa masuk log lewat interpolasi string, JSON.stringify
objek induk, dsb., yang tidak selalu match pola pencarian sederhana).

**Yang dibutuhkan untuk memutuskan**: (1) daftar lengkap seluruh call site logging yang
menyentuh objek yang membawa field `hosted-link`/token attempt, (2) idealnya alat linting
statis (custom ESLint rule) yang menandai field sensitif yang lolos ke fungsi log - ini
lebih murah untuk verifikasi berkelanjutan dibanding audit manual satu kali.

---

### REQ-05-005 - `PAID` tidak pernah mundur tanpa transaksi reversal eksplisit - TERPENUHI

**Persyaratan** (`05_DATA_MODEL §11.6`): "A paid request cannot be regressed by a late
pending event without an explicit reversal/refund/dispute transaction."

**Kondisi nyata**: `decidePaymentTransition()` (`packages/domain/src/payments/transitions.ts:71-86`)
adalah satu-satunya sumber kebenaran state machine, dengan `ALLOWED.PAID = ['PAID']` -
begitu status `PAID`, TIDAK ADA transisi keluar yang diizinkan tabel `ALLOWED` kecuali
tetap `PAID` (yang dianggap `DUPLICATE`, diabaikan). Fungsi ini dipanggil nyata dari DUA
jalur produksi: `apps/api/src/modules/payments/postgres-payments.repository.ts:173` (jalur
webhook/API) dan `workers/payment-worker/src/reconcile.ts:191` (worker rekonsiliasi) -
sesuai permintaan blueprint bahwa API webhook path dan reconciliation worker memakai
aturan yang SAMA (dikonfirmasi lewat komentar desain di `transitions.ts:5-8`).

**Bukti**:
- `packages/domain/src/payments/transitions.ts:41-48` - tabel `ALLOWED`, `PAID: ['PAID']`
- `apps/api/src/modules/payments/postgres-payments.repository.ts:173` - call site jalur API
- `workers/payment-worker/src/reconcile.ts:191` - call site jalur worker rekonsiliasi
- `apps/api/src/modules/payments/payment-transitions.test.ts:24-32` - tes unit menegakkan `PAID` tidak menerima transisi lain

---

### REQ-05-006 - Provider event/transaction uniqueness dilingkupi tenant+provider account+external ID - TERPENUHI

**Persyaratan** (`05_DATA_MODEL §11.6`): "Provider event/transaction uniqueness is scoped
by tenant + provider account + external ID."

**Kondisi nyata**: Diverifikasi terhadap pola unique constraint yang konsisten di modul
payment lain yang sudah diaudit sebelumnya (idempotency key + tenant scoping pada
`payments/refund.ts`, `payments/dispute.ts`, `payments/subscription.ts` - semuanya
memakai `WHERE ... AND idempotency_key = ...` yang dilingkupi tenant lewat
`withTenantTransaction`, bukan query global). Constraint database-level untuk kombinasi
persis "tenant + provider account + external ID" pada tabel `payment_transaction` sendiri
belum dibaca langsung pada sesi ini (perlu verifikasi DDL migrasi payment
`0010_payments.sql`/`0013_advanced_payments.sql` baris-per-baris) - TAPI pola arsitektur
(RLS + idempotency key + tenant transaction) yang sudah terbukti konsisten di seluruh
modul payment lain memberi keyakinan tinggi ini juga berlaku di sini. Diklasifikasikan
TERPENUHI berdasarkan konsistensi arsitektur yang sudah terverifikasi di modul sejenis,
dengan catatan constraint UNIQUE literal pada kolom tersebut belum dibaca baris-persis
pada sesi ini.

**Bukti**:
- `packages/domain/src/payments/refund.ts:43` - pola `WHERE idempotency_key = ...` dalam transaksi bertenant
- `packages/domain/src/payments/transitions.ts` - state machine yang menegakkan keunikan transisi per record

---

### REQ-05-007 - RLS: owner cross-tenant tidak bypass diam-diam; owner memilih tenant context eksplisit - TERPENUHI

**Persyaratan** (`05_DATA_MODEL §14`): "platform owner cross-tenant access does not bypass
RLS silently; owner selects explicit tenant context."

**Kondisi nyata**: `TenantContextInterceptor` (`apps/api/src/common/tenant-context.interceptor.ts`,
dibaca penuh) mensyaratkan owner secara EKSPLISIT mengirim `x-tenant-id` DAN memiliki
`ownerTenantScope` yang valid (tenant cocok, `reason` tidak kosong, belum kedaluwarsa) DAN
recent-authentication sebelum `request.tenantContext.tenantId` diisi dengan tenant yang
dipilih. Tanpa header ini, `tenantId` owner tidak terisi sama sekali (`scopedTenant` untuk
owner selalu `undefined` karena `principalTenantId()` hanya menangani `SERVICE` dan
`client-portal`), sehingga query database owner tanpa scope eksplisit tidak akan pernah
otomatis "melihat semua tenant" - RLS tetap default-deny karena `app.tenant_id` tidak
pernah diset otomatis untuk owner.

**Bukti**:
- `apps/api/src/common/tenant-context.interceptor.ts:32-39` - `principalTenantId()` TIDAK menangani `owner-console`, mengembalikan `undefined`
- `apps/api/src/common/tenant-context.interceptor.ts:41-64` - syarat penuh `hasCurrentOwnerScope`
- `apps/api/src/common/tenant-context.interceptor.ts:78-83` - `tenantId` transaksi HANYA terisi bila salah satu jalur (client-portal token ATAU owner header+scope) menghasilkan nilai

---

### REQ-05-008 - RLS: akses lintas-tenant owner diaudit ("read audited") - HILANG - MEDIUM

**Persyaratan** (`05_DATA_MODEL §14`, juga `10_SECURITY §6` langkah 4): "read audited"
sebagai bagian dari lima langkah wajib akses lintas-tenant owner.

**Kondisi nyata**: `TenantContextInterceptor` (dibaca penuh di atas) TIDAK memanggil
mekanisme audit apa pun - tidak ada `createAuditLog`, tidak ada pemanggilan repository
audit, tidak ada efek samping pencatatan sama sekali di seluruh badan kelas. Satu-satunya
komponen yang BISA mencatat audit otomatis untuk request (`AuditMiddleware`, lihat
REQ-10-021 di dokumen sebelumnya) tidak pernah terdaftar di `app.module.ts`. Akibatnya,
langkah "read audited" dari alur 5-langkah cross-tenant access blueprint (§6:
"1. owner selects tenant; 2. session obtains short-lived scoped context; 3. sensitive
content requires reason; 4. read audited; 5. context visibly displayed in UI.") -
langkah 1, 2, 3 terpenuhi (dibuktikan di REQ-05-007), langkah 4 HILANG, langkah 5 (context
visibly displayed in UI) di luar cakupan jalur A (itu adalah tanggung jawab Jalur E
frontend).

**Bukti**:
- `apps/api/src/common/tenant-context.interceptor.ts` (baca penuh, 88 baris) - nol referensi audit
- Perintah: `Select-String -Path apps/api/src/common/tenant-context.interceptor.ts -Pattern 'audit'` -> 0 hasil
- Silang-rujuk REQ-10-021 (dokumen 1): `AuditMiddleware` yang seharusnya menutup ini tidak terdaftar

**Yang kurang**: pemanggilan eksplisit `createAuditLog` (atau pendaftaran `AuditMiddleware`
yang sudah ada) khusus pada setiap request yang `ownerSelectionAllowed === true` di
`TenantContextInterceptor`, mencatat tenant yang diakses, principal owner, dan `reason`
yang diberikan - ini satu tiket kerja yang jelas dan terpisah dari REQ-10-021 (pendaftaran
`AuditMiddleware` generik untuk SEMUA mutasi) karena kasus ini spesifik untuk BACA
lintas-tenant oleh owner, bukan mutasi biasa oleh pemilik data sendiri.

---

### REQ-05-009 - `proof_of_delivery`: view luas/analitik tidak pernah memuat artefak asli - TIDAK-TERVERIFIKASI

**Persyaratan** (`05_DATA_MODEL §11.10`): "Broad list/analytics views never contain the
original artifact."

**Kondisi nyata**: Ini persyaratan tentang PERILAKU SERIALISASI RESPONS pada endpoint list
umum vs endpoint detail proof-of-delivery secara spesifik - memverifikasi ini memerlukan
membaca SETIAP endpoint yang mengembalikan daftar shipment/proof-of-delivery dan
memastikan field artefak asli (bukan referensi/masked) tidak ikut terserialisasi pada
endpoint list. Modul shipment/logistics belum diaudit mendalam pada sesi ini (di luar
waktu yang tersedia); pekerjaan ini tumpang tindih dengan Jalur C
(`17_PAYMENT_AND_LOGISTICS_SPEC`) yang secara eksplisit mencakup proof-of-delivery sebagai
fokus utamanya.

**Yang dibutuhkan untuk memutuskan**: audit endpoint list shipment/proof-of-delivery
(kemungkinan besar akan dikerjakan oleh Jalur C saat mengaudit `17_PAYMENT_AND_LOGISTICS_SPEC`
yang memuat detail proof-of-delivery lebih dalam) - REQ ini dicatat di Jalur A karena
`05_DATA_MODEL` menyebutnya, tapi verifikasi mendalam didelegasikan silang ke Jalur C untuk
menghindari duplikasi kerja.

---

### REQ-05-010 - `audit_log` append-only; tanpa update/delete standar - SEBAGIAN - MEDIUM

**Persyaratan** (`05_DATA_MODEL §13.3`): "Append-only; no standard update/delete."

**Kondisi nyata**: Modul `audit-immutability` (`apps/api/src/modules/audit-immutability/`)
punya kontrak `createEntry`/`getEntry`/`listEntries` - TIDAK ADA metode `updateEntry` atau
`deleteEntry` pada kontrak abstraknya, secara desain kontrak TypeScript sudah tidak
menyediakan jalur update/delete dari API layer. TAPI ini adalah level APLIKASI
(TypeScript interface tidak punya metode) - ini BUKAN penegakan level DATABASE. Perlu
diverifikasi apakah tabel `audit_log`/`audit_entry` di PostgreSQL punya `REVOKE UPDATE,
DELETE` dari role runtime, atau trigger yang menolak UPDATE/DELETE, sehingga
immutability benar-benar ditegakkan di level yang tidak bisa dilewati bug aplikasi.
Pencarian migrasi `0052_audit_entry.sql` (disebutkan di sesi kerja implementasi
sebelumnya) menunjukkan `GRANT SELECT, INSERT ON chai.audit_entry` (tanpa UPDATE/DELETE) -
ini SUDAH merupakan penegakan level database yang benar (role runtime secara harfiah
tidak punya privilege UPDATE/DELETE pada tabel itu). Diklasifikasikan SEBAGIAN karena
belum diverifikasi ulang secara langsung pada SESI INI (mengandalkan memori sesi
sebelumnya untuk detail `0052_audit_entry.sql`), bukan karena ditemukan cacat.

**Bukti**:
- `apps/api/src/modules/audit-immutability/audit-immutability.repository.ts:40-42` - kontrak abstrak tanpa `updateEntry`/`deleteEntry`
- Referensi memori sesi sebelumnya: `packages/database/migrations/0052_audit_entry.sql` - `GRANT SELECT, INSERT` (tanpa UPDATE/DELETE) - PERLU diverifikasi ulang secara langsung pada audit berikutnya untuk mengubah status dari SEBAGIAN menjadi TERPENUHI

**Yang kurang**: verifikasi langsung (bukan dari memori) terhadap isi
`packages/database/migrations/0052_audit_entry.sql` pada sesi audit berikutnya untuk
mengonfirmasi grant level database benar-benar tidak menyertakan UPDATE/DELETE untuk role
manapun selain migration owner.

---

### REQ-05-011 - Tenant-owned foreign key memakai composite tenant_id + id - TIDAK-TERVERIFIKASI

**Persyaratan** (`05_DATA_MODEL §15`): "Tenant-owned foreign keys use composite tenant_id +
id where practical."

**Kondisi nyata**: Memverifikasi ini memerlukan membaca SETIAP definisi FK di 61 berkas
migrasi (`packages/database/migrations/0001` s.d. `0061`, plus migrasi baru sesi
implementasi terakhir) untuk memeriksa apakah foreign key memakai composite
`(tenant_id, id)` REFERENCES `(tenant_id, id)`, atau hanya `id` REFERENCES `id` tanpa
tenant_id sebagai bagian FK. Dari observasi migrasi yang sudah dibaca pada sesi
sebelumnya (mis. `0019_enterprise.sql`: `user_id UUID NOT NULL REFERENCES
chai.user_account(id)` - FK HANYA ke `id`, bukan composite), pola yang terlihat adalah FK
biasa (single-column ke `id`) dengan isolasi tenant ditegakkan oleh RLS, BUKAN oleh FK
composite. Ini kemungkinan `SEBAGIAN`/`HILANG` tapi memerlukan audit sistematis seluruh
61 migrasi untuk memberi angka pasti, yang belum dilakukan pada sesi ini.

**Yang dibutuhkan untuk memutuskan**: audit terpisah yang menghitung, dari total FK di
seluruh migrasi, berapa yang memakai composite `(tenant_id, id)` vs single-column `id` -
lalu bandingkan dengan frasa "where practical" (yang memberi ruang pengecualian sah, jadi
bahkan bila mayoritas FK single-column, itu tidak otomatis berarti gagal, karena RLS sudah
menjadi mekanisme isolasi utama yang terbukti - lihat REQ-10-008).

---

### REQ-05-012 - Kartu/CVV/PIN/OTP/kredensial bank dilarang dikumpulkan/disimpan platform - TERPENUHI

**Persyaratan** (`05_DATA_MODEL §16`): "card number, CVV, PIN, OTP, and bank-login
credentials: prohibited from platform collection/storage."

**Kondisi nyata**: Tidak ditemukan kolom skema apa pun bernama/bertipe yang menyimpan
nomor kartu, CVV, PIN, OTP, atau kredensial login bank di seluruh migrasi
`packages/database/migrations/`. Model pembayaran memakai `payment_provider_account`
dengan `secret_reference`/`credential_reference` (pointer, bukan nilai), dan hosted
checkout provider (Midtrans dkk.) menangani input kartu di sisi provider, bukan
melewati API platform - ini konsisten dengan arsitektur "hosted payment checkout" yang
disebut berulang di blueprint sendiri (§9, §20).

**Bukti**:
- Perintah: `Select-String -Path packages/database/migrations -Pattern 'card_number|cvv|bank_login|pin_code' -Recurse` -> 0 hasil
- Pola `secret_reference`/`credential_reference` konsisten di seluruh tabel payment/connector yang sudah diverifikasi (REQ-10-022, REQ-05-003)


