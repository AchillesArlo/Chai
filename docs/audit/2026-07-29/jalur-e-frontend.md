# Jalur E — Frontend, UX, Design System

> Audit dimulai 2026-07-29. Dokumen dalam cakupan jalur ini: `03_UX_UI_SPECIFICATION.md`
> (878 baris) dan `04_DESIGN_SYSTEM.md` (399 baris). Setiap REQ diverifikasi terhadap kode
> pada commit kerja saat ini, bukan terhadap klaim di README, dokumen remediasi, atau
> `WEBSITE_TEST_PLAN.md`.
>
> Konteks faktual terverifikasi: `apps/client-portal` disajikan di bawah basePath `/portal`
> (`apps/client-portal/next.config.ts`, dikonfirmasi oleh komentar di kedua halaman login), 
> `apps/owner-console` di root. Keduanya Next.js App Router + Tailwind v4 (`@theme` di
> `globals.css`) memakai paket bersama `@chai/ui`.
>
> **Aturan pembeda yang dipakai konsisten di jalur ini:** `HILANG` = halaman/komponen yang
> **belum dibangun** (cakupan belum digarap — bukan bug, tetapi tetap celah terhadap spesifikasi);
> `SEBAGIAN`/`BERTENTANGAN` = ada tetapi salah atau tidak lengkap (RUSAK). Severity umumnya
> LOW–MEDIUM sesuai arahan rencana; pengecualian ada pada aksi destruktif tanpa konfirmasi
> (REQ-03-035, HIGH) dan penanganan rahasia di UI (REQ-04-010, HIGH).
>
> Status pengerjaan: **Kedua dokumen sudah dibaca penuh dan diaudit pada sesi ini. Jalur E selesai.**

---

## Temuan lintas-cakupan (berulang di banyak REQ)

Beberapa pola muncul di banyak layar; dicatat sekali di sini dan dirujuk oleh REQ terkait
agar tidak diulang tiap blok:

- **X-1 Data hardcoded/mock di banyak layar.** `owner-overview.tsx:36-71` (`MOCK_TENANTS_DATA`),
  `tenants-overview.tsx:19-40` (`INITIAL_TENANTS`), `ai-operations/page.tsx:34-70`
  (`INITIAL_LLM_PROVIDERS`), `marketplace/page.tsx:35-105` (`INITIAL_PROVIDERS`),
  `audit/page.tsx:20-24` (`SAMPLE_LOGS`), `commerce/page.tsx:16-20` (`PRODUCTS_DATA`),
  `app-shell.tsx:60-65` (`AVAILABLE_TENANTS`, `MOCK_NOTIFICATIONS`), `client-home.tsx` (KPI statis).
  Catatan: ini **berbeda** dari `MOCK_CONVERSATIONS`/`demo-tenant-id` yang memang sudah nol —
  `unified-inbox.tsx` benar-benar memakai API. Yang tersisa adalah array mock lain.
- **X-2 `tenantContext` di-hardcode per halaman** (`"Nusantara Dental"`, `"Demo Tenant"`,
  `"Platform Owner"`, `"All tenants"`) alih-alih dari sesi/membership. Contoh:
  `payments/page.tsx:36`, `unified-inbox.tsx:199`, `customers/page.tsx:36`.
- **X-3 Aksi destruktif satu klik tanpa konfirmasi/re-auth**: kill switch konektor
  (`marketplace/page.tsx:108-121`), circuit breaker AI (`owner-overview.tsx:142-153`),
  suspend tenant (`tenants-overview.tsx:83-92`). Lihat REQ-03-035.
- **X-4 Navigasi statis tanpa gating entitlement/permission** (`config/navigation.ts` kedua app
  adalah array datar; `app-shell.tsx:238-240` merender semua). Lihat REQ-03-004.
- **X-5 Rute detail (`:id`) tidak ada sama sekali** di kedua app (glob `apps/*/src/app/**/[*]`
  = 0 hasil). Berdampak ke REQ-03-010/021/023 dst.

---

## Ringkasan DOKUMEN 03 — `03_UX_UI_SPECIFICATION.md`

| ID | Persyaratan | Kelas | Severity |
|---|---|---|---|
| REQ-03-001 | Owner console: semua route diawali server-side authorization, audience & cookie terpisah, tanpa public sign-up | SEBAGIAN | MEDIUM |
| REQ-03-002 | Client portal: invite-only, tenant context dari membership, switcher hanya tenant yang dimiliki | SEBAGIAN | MEDIUM |
| REQ-03-003 | Access-denied behavior (5 skenario tabel §2.3) | SEBAGIAN | MEDIUM |
| REQ-03-004 | Navigation item hanya dirender jika entitlement + permission terpenuhi | HILANG | MEDIUM |
| REQ-03-005 | Owner Console route inventory (27 route §5.1) | SEBAGIAN | MEDIUM |
| REQ-03-006 | Owner Sign In: MFA challenge, recovery code, device list, states | SEBAGIAN | MEDIUM |
| REQ-03-007 | Platform Overview + KPI card wajib delta, freshness, link ke definition | SEBAGIAN | LOW |
| REQ-03-008 | Tenant Directory: kolom & aksi lengkap, tanpa bulk destructive | SEBAGIAN | MEDIUM |
| REQ-03-009 | Tenant Creation Wizard (8 langkah, autosave, tak ACTIVE tanpa checklist) | HILANG | MEDIUM |
| REQ-03-010 | Tenant Detail (tabs + tenant identity banner lintas-tenant) | HILANG | MEDIUM |
| REQ-03-011 | Global Channel Health + Community Gateway high-risk badge | HILANG | MEDIUM |
| REQ-03-012 | AI Operations (provider/model/routing) + publish butuh validation & rollback | SEBAGIAN | MEDIUM |
| REQ-03-013 | Automation Operations (list + run detail/replay) | SEBAGIAN | LOW |
| REQ-03-014 | Usage & Billing + cost carry source (measured/estimated/reconciled) | HILANG | MEDIUM |
| REQ-03-015 | Reliability: 8 widget wajib (SLO/burn, latency, queue, saturation, dst) | SEBAGIAN | MEDIUM |
| REQ-03-016 | Security & Audit: filter lengkap + kategorisasi high-risk event | SEBAGIAN | MEDIUM |
| REQ-03-017 | Client Portal route inventory (26 route §6.1) | SEBAGIAN | MEDIUM |
| REQ-03-018 | Invite + onboarding checklist (§6.2) | HILANG | MEDIUM |
| REQ-03-019 | Client Home: alerts, KPI, trend, funnel, workload | SEBAGIAN | LOW |
| REQ-03-020 | Unified Inbox: 3-pane, composer lengkap, critical interactions (Take Over dst) | SEBAGIAN | MEDIUM |
| REQ-03-021 | Customer 360: tabs, PII masked by role, merge manager/admin-only | SEBAGIAN | MEDIUM |
| REQ-03-022 | Lead Pipeline: kanban/table/funnel, drag confirm bila automation trigger | SEBAGIAN | LOW |
| REQ-03-023 | Lead Detail: AI-generated field ditandai & bisa confirm/correct | HILANG | LOW |
| REQ-03-024 | Knowledge: list/detail, published vs draft dipisah jelas | SEBAGIAN | LOW |
| REQ-03-025 | Bookings: calendar/list/resource, timezone saat berbeda | SEBAGIAN | LOW |
| REQ-03-026 | Commerce: read-first, mutation hanya bila capability + approval | SEBAGIAN | MEDIUM |
| REQ-03-027 | Payments UI: nav hidden saat disabled, no card/CVV/OTP, redirect≠Paid, copy beda | SEBAGIAN | MEDIUM |
| REQ-03-028 | Shipments & Exceptions: nav hidden saat disabled, canonical state, identity-auth | SEBAGIAN | MEDIUM |
| REQ-03-029 | Automations client: template view, tanpa edit raw graph di MVP | HILANG | LOW |
| REQ-03-030 | Analytics: tab + setiap metric definition/tz/comparison/freshness/export | SEBAGIAN | LOW |
| REQ-03-031 | Team & Settings | SEBAGIAN | LOW |
| REQ-03-032 | Hosted payment link flow (6 langkah §7.4) | SEBAGIAN | MEDIUM |
| REQ-03-033 | Shipment tracking & exception flow (5 langkah §7.5) | SEBAGIAN | MEDIUM |
| REQ-03-034 | Global UI States: 10 state di setiap data surface (§8) | SEBAGIAN | MEDIUM |
| REQ-03-035 | Confirmation patterns per risk + never color-alone | BERTENTANGAN | HIGH |
| REQ-03-036 | Notifications: security/owner-critical tak bisa dinonaktifkan | SEBAGIAN | LOW |
| REQ-03-037 | Search permission-aware, tak bocorkan eksistensi luar scope, tracking≠bypass identity | SEBAGIAN | MEDIUM |
| REQ-03-038 | Accessibility WCAG 2.2 AA (§12) | SEBAGIAN | MEDIUM |
| REQ-03-039 | Localization: string externalized, locale date, UTC store, relative+absolute | SEBAGIAN | LOW |
| REQ-03-040 | UX Acceptance Checklist 12 butir (§14) | SEBAGIAN | MEDIUM |

---

## Ringkasan DOKUMEN 04 — `04_DESIGN_SYSTEM.md`

| ID | Persyaratan | Kelas | Severity |
|---|---|---|---|
| REQ-04-001 | Default theme light + token architecture memungkinkan dark mode tanpa ubah component | SEBAGIAN | LOW |
| REQ-04-002 | Color tokens lengkap + semantic tokens (bukan raw palette) dipakai component | SEBAGIAN | LOW |
| REQ-04-003 | Typography scale Inter (9 style) | SEBAGIAN | LOW |
| REQ-04-004 | Spacing base-4, skala terbatas | SEBAGIAN | LOW |
| REQ-04-005 | Radius scale 6/10/14/full | SEBAGIAN | LOW |
| REQ-04-006 | Elevation 4 level + borders before shadows | SEBAGIAN | LOW |
| REQ-04-007 | Layout breakpoints + grid (form 720, settings 960, card min 260) | SEBAGIAN | LOW |
| REQ-04-008 | Navigation components + TenantSwitcher memberships-only + owner repeat-name confirm | SEBAGIAN | MEDIUM |
| REQ-04-009 | Actions: Button/IconButton/SplitButton/ApprovalButton + one primary per area | HILANG | MEDIUM |
| REQ-04-010 | Forms components (12) + SecretInput tanpa reveal setelah save | SEBAGIAN | HIGH |
| REQ-04-011 | Data display components (11) + DataTable 8 requirement | SEBAGIAN | MEDIUM |
| REQ-04-012 | Status components + status language + badge selalu text (+icon) | SEBAGIAN | LOW |
| REQ-04-013 | Feedback: InlineAlert/Toast/Banner/Progress/Skeleton/ErrorBlock | SEBAGIAN | MEDIUM |
| REQ-04-014 | Overlays: Dialog/Drawer/FullScreenFlow/Popover + nested dialog dilarang | SEBAGIAN | MEDIUM |
| REQ-04-015 | Conversation components (16) + visual distinction AI/human/note/failed/tool | HILANG | MEDIUM |
| REQ-04-016 | AI components (9) + hindari confidence % pseudo-ilmiah | HILANG | MEDIUM |
| REQ-04-017 | Analytics chart (6 tipe) + chart rules (title/unit/tz/freshness/table alt) | SEBAGIAN | MEDIUM |
| REQ-04-018 | Forms & validation rules (blur+submit, server→field, unsaved guard, publish diff) | SEBAGIAN | MEDIUM |
| REQ-04-019 | Iconography Lucide, icon supplemental, attachment no auto-execute | SEBAGIAN | LOW |
| REQ-04-020 | Motion: respect prefers-reduced-motion | TERPENUHI | - |
| REQ-04-021 | Accessibility component contract + critical keyboard patterns | SEBAGIAN | MEDIUM |
| REQ-04-022 | Design QA checklist (10 butir §13) | SEBAGIAN | MEDIUM |
| REQ-04-023 | Uang minor-unit-safe di UI, server authoritative, tanpa float | SEBAGIAN | MEDIUM |
| REQ-04-024 | Payment components wajib (6) | SEBAGIAN | MEDIUM |
| REQ-04-025 | Logistics components wajib (6) | SEBAGIAN | MEDIUM |
| REQ-04-026 | Never green Paid sebelum verified; Unknown/Stale/Mismatch first-class; source di sisi status eksternal | SEBAGIAN | MEDIUM |

---


## DOKUMEN 03 — Blok temuan

### REQ-03-001 - Owner console: semua route diawali server-side authorization, audience & cookie terpisah, tanpa public sign-up - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §2.1`): "Distinct login audience and session cookie. Tidak ada public sign-up. ... Semua route diawali server-side authorization."

**Kondisi nyata**: Audience & cookie terpisah TERPENUHI — login owner memakai `audience: 'owner-console'` (`apps/owner-console/src/app/login/page.tsx:12`) dengan cookie sesi tersendiri, dan tak ada form registrasi (hanya email+password). Server-side authorization dijalankan `middleware.ts`, tetapi `protectedPrefixes` **tidak menyertakan `/ai-operations` dan `/settings`** (`apps/owner-console/src/middleware.ts:20-28`) — dua route sensitif (registry provider AI + platform settings) tidak digating di edge.

**Bukti**:
- `apps/owner-console/src/app/login/page.tsx:11-20` - audience owner-console, tanpa sign-up
- `apps/owner-console/src/middleware.ts:20-28` - `protectedPrefixes` = audit/automation/logistics/marketplace/reliability/tenants/whitelabel; `/ai-operations` & `/settings` absen
- `apps/owner-console/src/app/login/page.tsx:70-74` - tautan ke `/portal/login` absolut (audience client tak berbagi flow)

**Yang kurang**: tambahkan `/ai-operations` dan `/settings` ke `protectedPrefixes` owner (atau gating berbasis prefiks default-deny). Verifikasi proteksi `/` bergantung pada `evaluateMiddleware` (tidak dibaca di sesi ini).

---

### REQ-03-002 - Client portal: invite-only, tenant context dari membership, switcher hanya tenant yang dimiliki - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §2.2`): "Invite-only pada MVP. Tenant context berasal dari membership. User multi-tenant memakai tenant switcher hanya untuk tenant yang memang dimiliki."

**Kondisi nyata**: Copy invite-only ada (`login/page.tsx` + `client-home.tsx:52` "invite-only"). Namun tenant context **tidak** berasal dari membership: setiap halaman mengoper string literal ke `AppShell` (X-2), dan switcher merender daftar **hardcoded** `AVAILABLE_TENANTS` (`app-shell.tsx:60-65`) yang sama untuk semua pengguna, bukan membership.

**Bukti**:
- `packages/ui/src/app-shell.tsx:60-65` - `AVAILABLE_TENANTS` konstan (4 tenant contoh)
- `packages/ui/src/app-shell.tsx:160-178` - dropdown me-render `AVAILABLE_TENANTS.map(...)`
- `apps/client-portal/src/app/payments/page.tsx:36`, `unified-inbox.tsx:199` - `tenantContext` literal

**Yang kurang**: sumber daftar tenant dari membership pengguna (API/prop), bukan konstanta bersama; `tenantContext` diisi dari sesi.

---

### REQ-03-003 - Access-denied behavior (5 skenario §2.3) - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §2.3`): tabel — client token→owner route "404 atau generic forbidden"; owner belum MFA→"Redirect ke MFA challenge"; client kehilangan membership→"Session invalidated"; feature di luar package→"Upsell/disabled state, bukan broken page"; insufficient role→"Read-only state atau 403".

**Kondisi nyata**: Middleware menangani sebagian: token hilang/kedaluwarsa→redirect `/login`, dan `clearSession` menghapus cookie saat sesi tak valid (`client-portal/src/middleware.ts:44-66`). Tetapi: tidak ada "Redirect ke MFA challenge" (tak ada halaman MFA, lihat REQ-03-006); tidak ada penanganan "feature di luar package → upsell/disabled" (nav & halaman tidak sadar entitlement, X-4); tidak ada "insufficient role → read-only/403" di sisi UI.

**Bukti**:
- `apps/client-portal/src/middleware.ts:44-66` - redirect + clearSession
- `apps/owner-console/src/middleware.ts:41-61` - idem owner
- Perintah: `Select-String -Path apps/**/*.tsx -Pattern 'upsell|entitlement|read-only|readOnly'` → 0 hasil di komponen halaman

**Yang kurang**: state upsell/disabled untuk fitur di luar package, state read-only untuk role kurang, dan redirect MFA challenge.

---

### REQ-03-004 - Navigation item hanya dirender jika entitlement + permission terpenuhi - HILANG - MEDIUM

**Persyaratan** (`03_UX_UI §3.2`): "Navigation item hanya dirender jika entitlement dan permission terpenuhi."

**Kondisi nyata**: Kedua konfigurasi navigasi adalah array datar tanpa metadata permission/entitlement, dan `AppShell` merender seluruh item apa adanya. Akibatnya `/payments` & `/shipments` selalu tampil walau kapabilitas mati (bertentangan pula dengan §6.10A/§6.10B "Navigation is hidden when ... disabled").

**Bukti**:
- `apps/client-portal/src/config/navigation.ts:15-28` - 12 item statis, tanpa field permission/entitlement
- `apps/owner-console/src/config/navigation.ts:13-24` - 10 item statis
- `packages/ui/src/app-shell.tsx:238-240` - `navigation.map(...)` merender semua
- Perintah: `Select-String -Path apps/**/config/navigation.ts -Pattern 'permission|entitlement|capability|requires'` → 0 hasil

**Yang kurang**: field entitlement/permission per item + filter di `AppShell` yang menyembunyikan item yang tak berhak (khususnya payments/shipments saat kapabilitas mati).

---

### REQ-03-005 - Owner Console route inventory (27 route §5.1) - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §5.1`): route map 27 baris (/, /tenants, /tenants/new, /tenants/:id[+/channels,/ai,/features,/usage], /channels, /connectors, /payments, /shipments, /ai/providers, /ai/models, /ai/routing, /ai/prompts, /ai/evaluations, /automations, /automation-runs, /usage, /billing, /reliability, /queues, /incidents, /audit, /access, /settings, /login).

**Kondisi nyata**: Ada 11 route (beberapa dengan nama berbeda dari spec): `/login`, `/`, `/tenants`, `/reliability`, `/ai-operations` (bukan `/ai/*`), `/automation` (bukan `/automations`), `/marketplace` (di luar peta spec — berfungsi sbg /connectors), `/whitelabel` (di luar peta), `/logistics` (bukan `/shipments`), `/audit`, `/settings`. **Tidak ada** (16+): `/tenants/new`, `/tenants/:id` (+4 subroute), `/channels`, `/connectors`, `/payments`, `/shipments`, `/ai/providers`, `/ai/models`, `/ai/routing`, `/ai/prompts`, `/ai/evaluations`, `/automation-runs`, `/usage`, `/billing`, `/queues`, `/incidents`, `/access`.

**Bukti**:
- Direktori `apps/owner-console/src/app/` - subfolder: login, tenants, reliability, ai-operations, automation(+builder), marketplace(+webhooks), whitelabel, logistics, audit, settings, api
- Perintah glob `apps/owner-console/src/app/**/[*]` (rute dinamis) → 0 hasil (tak ada `/tenants/:id`)
- Perintah: tidak ada folder `channels`, `connectors`, `payments`, `shipments`, `queues`, `incidents`, `access`, `billing`, `usage`, `automation-runs`, `ai`

**Yang kurang**: 16+ route belum dibangun (TIDAK ADA), dan penyelarasan nama (`/ai-operations`→`/ai/*`, `/logistics`→`/shipments`, `/automation`→`/automations`).

---

### REQ-03-006 - Owner Sign In: MFA challenge, recovery code, device list, states - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §5.2`): "Required: email/passwordless or OIDC; MFA challenge; recovery code flow; suspicious login notification; session/device list after login; no self-registration; rate-limit and generic error. States: invalid credentials; MFA required; account locked; recovery required; platform maintenance."

**Kondisi nyata**: Halaman login owner hanya email+password (server action). Tidak ada UI MFA challenge, recovery code, suspicious-login, maupun session/device list di owner-console — meski MFA ditegakkan di backend (Jalur A). `no-self-registration` terpenuhi. State-state UI tidak ada.

**Bukti**:
- `apps/owner-console/src/app/login/page.tsx:38-66` - hanya field email + password
- Perintah: `Select-String -Path apps/owner-console/src/**/*.tsx -Pattern 'MFA|mfa|recovery|device'` → hanya teks deskriptif di `owner-overview.tsx:341` + tes; tak ada halaman challenge
- Tidak ada folder `apps/owner-console/src/app/mfa` atau `/challenge`

**Yang kurang**: halaman MFA challenge, alur recovery code, daftar sesi/perangkat pasca-login, dan pemetaan 5 state login ke UI.

---

### REQ-03-007 - Platform Overview + KPI card wajib delta, freshness, link ke definition - SEBAGIAN - LOW

**Persyaratan** (`03_UX_UI §5.3`): "KPI card wajib menampilkan delta, freshness, dan link ke definition." + layout (alert rail, KPI cards, trend chart, tenant risk table, provider/channel health matrix, recent incidents & privileged actions).

**Kondisi nyata**: `owner-overview.tsx` punya critical alert rail, KPI cards, dan tenant risk table. Namun `MetricCard` **tidak punya link ke definition** — hanya `label`, `value`, `trend?`, `freshness` (`packages/ui/src/operational.tsx:3-31`). Tidak ada trend chart, provider/channel health matrix, maupun recent incidents/privileged actions. Data hardcoded (X-1).

**Bukti**:
- `packages/ui/src/operational.tsx:3-31` - `MetricCard` tanpa prop/elemen "link ke definition"
- `apps/owner-console/src/owner-overview.tsx:170-199` - KPI cards; tak ada trend chart/health matrix
- `apps/owner-console/src/owner-overview.tsx:36-71` - `MOCK_TENANTS_DATA` (X-1)

**Yang kurang**: tambahkan link-ke-definition pada `MetricCard`; bangun trend chart, provider/channel health matrix, dan panel recent incidents/privileged actions.

---

### REQ-03-008 - Tenant Directory: kolom & aksi lengkap, tanpa bulk destructive - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §5.4`): kolom (name/status, package, channel count/health, active conversations, month usage/cost, last activity, risk/incident, onboarding stage); aksi (create, open, suspend, begin deletion, impersonation/support access); "Bulk destructive action tidak tersedia pada MVP."

**Kondisi nyata**: `tenants-overview.tsx` menampilkan hanya name/slug/status/updatedAt + blok risk flag. Aksi: create (modal 2 field) & suspend/reactivate; **tanpa** open (rute detail tak ada), begin-deletion, impersonation. "No bulk destructive" terpenuhi. Data hardcoded & mutasi hanya state lokal (X-1). Suspend tanpa konfirmasi (X-3).

**Bukti**:
- `apps/owner-console/src/tenants-overview.tsx:8-15` - `TenantRow` hanya id/name/slug/status/updatedAt/riskFlag
- `apps/owner-console/src/tenants-overview.tsx:83-92` - suspend = toggle state lokal tanpa dialog
- `apps/owner-console/src/tenants-overview.tsx:19-40` - `INITIAL_TENANTS` hardcoded

**Yang kurang**: kolom package/channel-health/active-conv/usage-cost/onboarding-stage; aksi open/begin-deletion/impersonation; konfirmasi pada suspend; wiring ke API.

---

### REQ-03-009 - Tenant Creation Wizard (8 langkah, autosave, tak ACTIVE tanpa checklist) - HILANG - MEDIUM

**Persyaratan** (`03_UX_UI §5.5`): 8 langkah (Identity … Review and create draft), "Wizard autosaves draft. Tenant tidak ACTIVE sampai onboarding checklist lulus."

**Kondisi nyata**: Tidak ada rute `/tenants/new` maupun komponen wizard. `tenants-overview.tsx` hanya punya modal 2 field (name + slug) yang menambah tenant ber-status `ACTIVE` langsung ke state lokal — bertentangan dengan "tak ACTIVE sampai checklist lulus".

**Bukti**:
- Tidak ada folder `apps/owner-console/src/app/tenants/new`
- Perintah: `Select-String -Path apps/owner-console/src/**/*.tsx -Pattern 'wizard|autosave|onboarding checklist'` → 0 hasil
- `apps/owner-console/src/tenants-overview.tsx:70-79` - provision menambah status `'ACTIVE'` langsung

**Yang kurang**: wizard 8 langkah dengan autosave draft dan gerbang checklist sebelum ACTIVE (TIDAK ADA).

---

### REQ-03-010 - Tenant Detail (tabs + tenant identity banner lintas-tenant) - HILANG - MEDIUM

**Persyaratan** (`03_UX_UI §5.6`): header + tabs (Overview/Users/Channels/AI & Knowledge/Features/Usage/Audit/Data policy); "Cross-tenant navigation selalu menampilkan tenant identity banner untuk mencegah salah operasi."

**Kondisi nyata**: Tidak ada rute `/tenants/:id`. `owner-overview.tsx` punya "scoped view" saat memilih tenant di switcher, tetapi bukan halaman detail ber-tab dan tidak ada identity banner terstandar.

**Bukti**:
- Perintah glob `apps/owner-console/src/app/tenants/**/[*]` → 0 hasil (tak ada segmen `:id`)
- `apps/owner-console/src/app/tenants/page.tsx` (124 byte) hanya merender `TenantsOverview`

**Yang kurang**: halaman `/tenants/:id` ber-tab + banner identitas tenant persisten (TIDAK ADA).

---

### REQ-03-011 - Global Channel Health + Community Gateway high-risk badge - HILANG - MEDIUM

**Persyaratan** (`03_UX_UI §5.7`): views (account list, provider matrix, webhook latency/error, token/session expiry, delivery failure, rate limits); "Community Gateway menampilkan high-risk badge dan tidak boleh terlihat identik dengan Meta Direct."

**Kondisi nyata**: Tidak ada rute `/channels`. `marketplace/page.tsx` menampilkan katalog provider + kill switch, tetapi tanpa view kesehatan channel (webhook latency, token expiry, delivery failure) dan tanpa pembedaan Community Gateway vs Meta Direct.

**Bukti**:
- Tidak ada folder `apps/owner-console/src/app/channels`
- Perintah: `Select-String -Path apps/owner-console/src/**/*.tsx -Pattern 'Community Gateway|high-risk|webhook latency'` → 0 hasil
- `apps/owner-console/src/app/marketplace/page.tsx:35-105` - provider hardcoded, tanpa metrik kesehatan channel

**Yang kurang**: halaman channel health (latency/expiry/delivery/rate-limit) + badge high-risk khusus Community Gateway (TIDAK ADA).

---

### REQ-03-012 - AI Operations (provider/model/routing) + publish butuh validation & rollback - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §5.8`): provider screen, model registry, routing policy editor (use case, required capabilities, primary/fallback, budget, timeout, data sensitivity, canary %); "Publish requires validation summary and rollback target."

**Kondisi nyata**: `/ai-operations` (satu halaman) menampilkan registry provider + kartu alias model statis. Tidak ada editor routing policy (primary/fallback/budget/timeout/canary), tidak ada aksi publish dengan validation summary/rollback target, tidak ada prompt releases/evaluations. Rute `/ai/providers|models|routing|prompts|evaluations` tak ada. Data hardcoded (X-1).

**Bukti**:
- `apps/owner-console/src/app/ai-operations/page.tsx:34-70` - `INITIAL_LLM_PROVIDERS` hardcoded
- `apps/owner-console/src/app/ai-operations/page.tsx:236-259` - alias model = kartu statis, bukan editor routing
- Perintah: `Select-String ... ai-operations/page.tsx -Pattern 'canary|rollback|validation summary|primary.*fallback'` → 0 hasil

**Yang kurang**: editor routing policy dengan canary/budget/timeout, alur publish (validation summary + rollback target), layar prompt releases & evaluations.

---

### REQ-03-013 - Automation Operations (list + run detail/replay) - SEBAGIAN - LOW

**Persyaratan** (`03_UX_UI §5.9`): list (template/version, tenants using, active runs, failure rate, overdue timers, last publish); run detail (timeline, trigger, evaluated conditions, actions, retry, stop reason, trace, replay/dry-run).

**Kondisi nyata**: `/automation` menampilkan tabel flow (name/status/version/updated + Edit) ter-wire ke API, plus `/automation/builder`. Tidak ada run detail (timeline/trace/retry/stop reason) maupun replay/dry-run; kolom failure rate/overdue/tenants-using tidak ada. Rute `/automation-runs` tak ada.

**Bukti**:
- `apps/owner-console/src/app/automation/page.tsx:16-22` - fetch flows; tabel name/status/version/updated
- Tidak ada folder `apps/owner-console/src/app/automation-runs`
- Perintah: `Select-String ... automation/page.tsx -Pattern 'replay|dry-run|stop reason|trace'` → 0 hasil

**Yang kurang**: layar run detail + replay/dry-run + metrik failure/overdue; rute `/automation-runs`.

---

### REQ-03-014 - Usage & Billing + cost carry source (measured/estimated/reconciled) - HILANG - MEDIUM

**Persyaratan** (`03_UX_UI §5.10`): views (tenant usage, provider/channel cost, platform cost, estimated margin, quota breach, export/reconciliation); "Cost values carry source: measured, estimated, or reconciled."

**Kondisi nyata**: Tidak ada rute `/usage` maupun `/billing` di owner-console. Nilai biaya yang muncul di layar lain berupa string pra-format ("$14.50", "Rp 7.500.000 / bln") tanpa penanda source.

**Bukti**:
- Tidak ada folder `apps/owner-console/src/app/usage` atau `/billing`
- Perintah: `Select-String -Path apps/owner-console/src/**/*.tsx -Pattern 'measured|estimated|reconciled|margin'` → 0 hasil
- `apps/owner-console/src/app/ai-operations/page.tsx:186` - "Estimated Cost (Today) $14.50" tanpa penanda source terstruktur

**Yang kurang**: halaman Usage & Billing + penanda source (measured/estimated/reconciled) pada setiap nilai biaya (TIDAK ADA).

---

### REQ-03-015 - Reliability: 8 widget wajib - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §5.11`): "Required widgets: SLO status and burn; API latency/error; queue depth/lag; DB/cache saturation; provider/channel health; failed workflows; backup status; deploy markers." + "Incident creation pre-fills affected services/tenants from selected signal."

**Kondisi nyata**: `reliability-overview.tsx` hanya 3 MetricCard (webhook freshness, replay lag, stale tenants) + placeholder incidents. Tidak ada SLO/burn, API latency/error, queue depth, DB/cache saturation, backup status, deploy markers, failed workflows, maupun incident creation pre-fill. Nilai hardcoded.

**Bukti**:
- `apps/owner-console/src/reliability-overview.tsx:16-24` - 3 MetricCard nilai hardcoded
- `apps/owner-console/src/reliability-overview.tsx:27-37` - "Open incidents" hanya paragraf, tanpa pembuatan incident
- Perintah: `Select-String ... reliability-overview.tsx -Pattern 'SLO|burn|saturation|backup|deploy'` → 0 hasil

**Yang kurang**: 7 widget sisanya + alur incident-creation dengan pre-fill signal.

---

### REQ-03-016 - Security & Audit: filter lengkap + kategorisasi high-risk event - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §5.12`): filter (actor, tenant, action category, risk, source IP/device, date, correlation ID); high-risk events (owner login/recovery, secret rotation, support content access, export, deletion, provider switch, Community Gateway activation/session export, approval override).

**Kondisi nyata**: `/audit` menampilkan daftar log (timestamp/action/tenant/actor/resource/hashStatus) dari `SAMPLE_LOGS` hardcoded, dengan satu input filter teks bebas yang **tidak ter-wire** (tanpa state). Tak ada filter actor/risk/IP/date/correlation, tak ada kategorisasi high-risk event.

**Bukti**:
- `apps/owner-console/src/app/audit/page.tsx:20-24` - `SAMPLE_LOGS` hardcoded
- `apps/owner-console/src/app/audit/page.tsx:55-58` - input "Filter logs..." tanpa `value`/`onChange`
- Perintah: `Select-String ... audit/page.tsx -Pattern 'correlation|risk|source IP|high-risk'` → 0 hasil

**Yang kurang**: filter multi-dimensi ter-wire + kategorisasi high-risk event + wiring API.

---

### REQ-03-017 - Client Portal route inventory (26 route §6.1) - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §6.1`): 26 route termasuk /login, /accept-invite, /onboarding, /, /inbox, /inbox/:conversationId, /contacts, /contacts/:id, /leads, /leads/:id, /knowledge, /knowledge/:id, /bookings, /commerce, /payments, /payments/:id, /shipments, /shipments/:id, /shipment-exceptions, /automations, /analytics, /usage, /team, /settings, /settings/{channels,ai,payments,shipping}.

**Kondisi nyata**: Ada 13 route: `/login`, `/`, `/inbox`, `/analytics`, `/customers` (spec menyebut `/contacts`), `/leads`, `/knowledge`, `/bookings`, `/commerce`, `/payments`, `/shipments`, `/team`, `/settings`. **Tidak ada** (13+): `/accept-invite`, `/onboarding`, semua rute `:id`, `/shipment-exceptions`, `/automations`, `/usage`, dan subrute `/settings/{channels,ai,payments,shipping}` (settings memakai tab, bukan rute).

**Bukti**:
- Direktori `apps/client-portal/src/app/` - login, inbox, customers, analytics, settings, commerce, bookings, knowledge, leads, shipments, payments, team, api
- Perintah glob `apps/client-portal/src/app/**/[*]` → 0 hasil (tak ada rute `:id`)
- `apps/client-portal/src/app/settings/page.tsx:21` - subhalaman = tab (`'profile'|'channels'|'api'|'guardrails'`), bukan rute `/settings/*`

**Yang kurang**: 13+ route belum dibangun (TIDAK ADA); penamaan `/customers`→`/contacts`; subrute settings menjadi rute tersendiri bila diperlukan guarded + recent-auth.

---

### REQ-03-018 - Invite + onboarding checklist (§6.2) - HILANG - MEDIUM

**Persyaratan** (`03_UX_UI §6.2`): invite flow (verify token, show tenant/role, create identity, accept terms, configure MFA, enter portal) + onboarding checklist (business profile … go-live approval).

**Kondisi nyata**: Tidak ada rute `/accept-invite` maupun `/onboarding`. Halaman login hanya memberi teks "invite-only" tanpa alur verifikasi token/checklist.

**Bukti**:
- Tidak ada folder `apps/client-portal/src/app/accept-invite` atau `/onboarding`
- Perintah: `Select-String -Path apps/client-portal/src/**/*.tsx -Pattern 'accept-invite|onboarding|invite token|go-live'` → 0 hasil

**Yang kurang**: halaman accept-invite (verifikasi token, terima terms, setup MFA) dan onboarding checklist bergerbang go-live (TIDAK ADA).

---

### REQ-03-019 - Client Home: alerts, KPI, trend, funnel, workload - SEBAGIAN - LOW

**Persyaratan** (`03_UX_UI §6.3`): 8 seksi (alerts/recommended actions; KPI; conversation trend; outcome funnel; queue/agent workload; unanswered/low-evidence topics; upcoming bookings; usage summary).

**Kondisi nyata**: `client-home.tsx` hanya 2 seksi: "Outcomes today" (3 MetricCard nilai hardcoded) + "Needs your attention" (paragraf statis). Tidak ada trend, funnel, workload, unanswered topics, upcoming bookings, usage summary; tidak ter-wire API.

**Bukti**:
- `apps/client-portal/src/client-home.tsx:16-40` - 3 MetricCard hardcoded ("128", "9", "96%")
- `apps/client-portal/src/client-home.tsx:42-60` - seksi attention statis
- Tidak ada chart/funnel di file

**Yang kurang**: 6 seksi sisanya + wiring KPI ke API.

---

### REQ-03-020 - Unified Inbox: 3-pane, composer lengkap, critical interactions - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §6.4`): layout 3-kolom (queue | timeline+composer | customer context); composer (text, attachment, template selector, internal note, AI suggested reply, channel window warning); critical interactions (Take Over, Assign, Resolve, Escalate, Pause/Resume AI, internal note, view AI evidence); mobile "no three-column compression".

**Kondisi nyata**: `unified-inbox.tsx` ter-wire API dengan penanganan konkurensi kuat (If-Match versi + idempotency key). Namun hanya 2 kolom (queue + thread), **tanpa panel konteks pelanggan kanan**. Composer hanya text; tanpa attachment/template/internal-note/AI-suggested-reply/channel-window-warning. **Tidak ada** tombol Take Over/Assign/Resolve/Escalate/Pause-Resume AI/AI evidence — padahal UX goal #3 mensyaratkan takeover ≤2 tindakan. Bubble AI vs human tidak dibedakan (lihat REQ-04-015).

**Bukti**:
- `apps/client-portal/src/unified-inbox.tsx:203-410` - grid `lg:grid-cols-3`: queue (1) + thread (2), tanpa kolom konteks
- `apps/client-portal/src/unified-inbox.tsx:333-360` - composer hanya `<input type="text">` + Send
- `apps/client-portal/src/unified-inbox.tsx:126-141` - If-Match + idempotencyKey (kuat, benar)
- Perintah: `Select-String ... unified-inbox.tsx -Pattern 'Take ?Over|Assign|Resolve|Escalate|Pause|Resume|evidence'` → 0 hasil

**Yang kurang**: kolom konteks pelanggan; tombol Take Over/Assign/Resolve/Escalate/Pause-Resume AI + AI evidence; composer attachment/template/internal-note/suggested-reply/channel-window-warning.

---
