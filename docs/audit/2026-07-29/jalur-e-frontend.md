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


### REQ-03-021 - Customer 360: tabs, PII masked by role, merge manager/admin-only - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §6.5`): "Tabs: Overview; Conversations; Lead activities; Bookings; Orders; Payments; Shipments; Notes; Data/privacy. PII fields masked based on role. Merge/unmerge is manager/admin only."

**Kondisi nyata**: Yang dirender hanya daftar kontak datar di `/customers` (ter-wire `/client/v1/contact-segments`), bukan halaman Customer 360 ber-tab di rute detail (`/contacts/:id` tak ada). Daftar itu menampilkan PII **tanpa masking** (telepon + email polos) untuk semua peran, tak ada 9 tab, dan tak ada aksi merge/unmerge.

**Bukti**:
- `apps/client-portal/src/app/customers/page.tsx:75-77` - item daftar: segment badge + `{cust.phone} • {cust.email}` polos (bukan halaman ber-tab, PII tak di-mask per-peran)
- glob `apps/client-portal/src/app/**/[*]/**` → hanya `api/[...path]/route.ts` (tak ada `/contacts/:id` maupun `/customers/:id`)
- Perintah: `Select-String -Path apps/client-portal/src -Pattern 'mask|unmerge|\bmerge\b'` → 2 hasil, keduanya tak relevan (`settings/page.tsx:534` label guardrail "PII Masking" untuk LLM; `unified-inbox.tsx:101` komentar `ponytail:`) — tak ada masking field UI maupun tooling merge

**Yang kurang**: halaman Customer 360 ber-tab di rute detail; masking PII per-peran pada telepon/email; aksi merge/unmerge khusus manager/admin.

---

### REQ-03-022 - Lead Pipeline: kanban/table/funnel, drag confirm bila automation trigger - SEBAGIAN - LOW

**Persyaratan** (`03_UX_UI §6.6`): "Views: Kanban by stage; table; funnel report. Card: contact/company; source; score and explanation; owner; next action; last activity; SLA/age. Drag stage requires confirmation if automation will trigger."

**Kondisi nyata**: Hanya Kanban-by-stage yang dirender (kolom per `STAGE_ORDER`, ter-wire `/client/v1/leads`). Tak ada tampilan table maupun funnel report. Tak ada drag-and-drop sama sekali (kolom statis), sehingga "drag stage requires confirmation" tak berlaku. Kartu hanya menampilkan `contactId`, status, dan score — tanpa source, score explanation, owner, next action, last activity, atau SLA/age.

**Bukti**:
- `apps/client-portal/src/app/leads/page.tsx:17` - `STAGE_ORDER`; kolom Kanban dirender via `stages.map(...)`
- `apps/client-portal/src/app/leads/page.tsx:82` - kartu = contactId + status + `Score {lead.score}` saja
- Perintah: `Select-String -Path apps/client-portal/src -Pattern 'onDrag|draggable|DndContext|funnel'` → 0 hasil

**Yang kurang**: tampilan table + funnel report; drag-and-drop antar-stage dengan konfirmasi bila memicu automation; kolom kartu source/score-explanation/owner/next-action/last-activity/SLA.

---

### REQ-03-023 - Lead Detail: AI-generated field ditandai & bisa confirm/correct - HILANG - LOW

**Persyaratan** (`03_UX_UI §6.7`): "AI-generated field is visually marked and can be confirmed/corrected."

**Kondisi nyata**: Tidak ada rute `/leads/:id` maupun komponen Lead Detail. Kanban leads (REQ-03-022) tak menautkan ke detail apa pun, jadi tak ada permukaan tempat field hasil-AI ditandai/dikonfirmasi.

**Bukti**:
- glob `apps/client-portal/src/app/**/[*]/**` → hanya `api/[...path]/route.ts` (nol segmen `:id` untuk leads); inventaris 13 `page.tsx` tak memuat leads detail
- Perintah: `Select-String -Path apps/client-portal/src -Pattern 'AI-generated|confirmCorrect|leads/\['` → 0 hasil

**Yang kurang**: halaman `/leads/:id` dengan penanda field hasil-AI dan aksi confirm/correct (TIDAK ADA).

---

### REQ-03-024 - Knowledge: list/detail, published vs draft dipisah jelas - SEBAGIAN - LOW

**Persyaratan** (`03_UX_UI §6.8`): "List: source name/type; status; version; freshness; documents/chunks; last sync; usage; error. Source detail: ingestion timeline; ... test query panel; publish/rollback. Published and draft are clearly separated."

**Kondisi nyata**: Yang dirender hanya daftar dokumen ter-index (`/client/v1/knowledge/documents`) + kotak upload. Item hanya menampilkan excerpt teks + `knowledgeBaseId` + jumlah chunk — tanpa kolom status/version/freshness/last-sync/usage/error. Tak ada pemisahan published vs draft, tak ada source detail (`/knowledge/:id` tak ada), tak ada test-query panel maupun publish/rollback.

**Bukti**:
- `apps/client-portal/src/app/knowledge/page.tsx:73-74` - item daftar: `excerpt(doc.text)` + `{doc.knowledgeBaseId} • {N} vector chunks` (tanpa status/version/freshness)
- glob `apps/client-portal/src/app/**/[*]/**` → tak ada `/knowledge/:id`
- Perintah: `Select-String -Path apps/client-portal/src -Pattern 'draft|published|rollback'` → hanya `client-home.tsx:39` (label KPI "AI used published knowledge"); nol di halaman knowledge

**Yang kurang**: kolom status/version/freshness/last-sync/usage/error; pemisahan published/draft; source detail dengan ingestion timeline, test-query panel, dan publish/rollback.

---

### REQ-03-025 - Bookings: calendar/list/resource, timezone saat berbeda - SEBAGIAN - LOW

**Persyaratan** (`03_UX_UI §6.9`): "Views: calendar; list; resource view. Actions: create; reschedule; cancel; mark completed/no-show; send reminder. All time displays show timezone when customer/resource differ."

**Kondisi nyata**: Hanya tampilan list yang dirender (ter-wire `/client/v1/appointments`); tak ada calendar grid maupun resource view (`resourceId` ada di tipe data tetapi tak dirender sebagai view). Satu-satunya aksi adalah tombol "New Booking" tanpa handler. Waktu ditampilkan sebagai string ISO mentah tanpa zona waktu/locale — tak ada penanganan "timezone when customer/resource differ".

**Bukti**:
- `apps/client-portal/src/app/bookings/page.tsx:45` - hanya tombol "New Booking" (tanpa reschedule/cancel/complete/no-show/reminder)
- `apps/client-portal/src/app/bookings/page.tsx:66` - waktu = `<time dateTime={booking.startsAt}>{booking.startsAt}</time>` (ISO mentah, tanpa timezone/locale)
- `apps/client-portal/src/app/bookings/page.tsx:12` - `resourceId` hanya field tipe; tak ada resource view

**Yang kurang**: tampilan calendar & resource; aksi reschedule/cancel/complete/no-show/reminder; tampilan zona waktu saat customer/resource berbeda.

---

### REQ-03-026 - Commerce: read-first, mutation hanya bila capability + approval - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §6.10`): "Read-first views: product search; inventory freshness; order lookup; fulfillment status; connector health. Mutation buttons only appear if connector capability and approval policy allow."

**Kondisi nyata**: Hanya katalog produk statis (`PRODUCTS_DATA` hardcoded, X-1) yang dirender — tanpa product search, inventory freshness, order lookup, fulfillment status, atau connector health. Tombol mutasi "Add Product" selalu tampil tanpa cek capability/approval, bertentangan dengan "mutation buttons only appear if connector capability and approval policy allow".

**Bukti**:
- `apps/client-portal/src/app/commerce/page.tsx:16` - `PRODUCTS_DATA` hardcoded (tak ada API, X-1)
- `apps/client-portal/src/app/commerce/page.tsx:42` - tombol "Add Product" dirender tanpa gerbang capability/approval
- `apps/client-portal/src/app/commerce/page.tsx:47` - daftar hanya katalog produk (tanpa order lookup/fulfillment/connector-health)

**Yang kurang**: view read-first (product search/inventory-freshness/order-lookup/fulfillment/connector-health) ter-wire API; gerbang capability + approval sebelum tombol mutasi muncul.

---

### REQ-03-027 - Payments UI: nav hidden saat disabled, no card/CVV/OTP, redirect≠Paid, copy beda - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §6.10A`): "Navigation is hidden when `payment_orchestration` is disabled. ... The UI never asks for card number, CVV, PIN, OTP, or bank-login credentials. `Link sent`, `Processing`, and `Paid` use different status/copy. Redirect success and customer screenshot cannot render a Paid badge."

**Kondisi nyata**: Daftar checkout session dirender via API dengan `MoneyAmount` (minor units). Kepatuhan tercapai sebagian: UI **tidak** meminta card/CVV/OTP/PIN (dikonfirmasi pencarian nol), dan badge status dibaca dari `payment.status` server sehingga redirect/screenshot tak bisa memaksa Paid. Namun navigasi `/payments` **tidak** disembunyikan saat kapabilitas mati (nav statis, X-4); tak ada overview (paid value/conversion/health); kolom daftar tak memuat customer/provider/merchant/reconciliation; tak ada detail `/payments/:id`.

**Bukti**:
- `apps/client-portal/src/app/payments/page.tsx:68` - `MoneyAmount` (minor units); `:16` `statusTone` memetakan PAID/PENDING/lainnya; badge dari `payment.status` API (redirect tak memaksa Paid)
- `apps/client-portal/src/config/navigation.ts:10` - `/payments` statis, tanpa gating kapabilitas (bandingkan §6.10A "hidden when disabled")
- Perintah: `Select-String -Path apps/client-portal/src -Pattern 'CVV|card number|\bOTP\b|\bPIN\b|bank-login'` → 0 hasil (patuh: UI tak minta data kartu)
- glob `apps/client-portal/src/app/**/[*]/**` → tak ada `/payments/:id`

**Yang kurang**: sembunyikan nav saat `payment_orchestration` mati; overview + provider/webhook/reconciliation health; kolom customer/provider/merchant/reconciliation; halaman detail `/payments/:id`; copy khusus untuk `Link sent`/`Processing`/`Paid`.

---

### REQ-03-028 - Shipments & Exceptions: nav hidden saat disabled, canonical state, identity-auth - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §6.10B`): "Navigation is hidden when `shipment_tracking` is disabled. ... active shipments by canonical status; ... filters for provider, store, carrier, state, exception, age, and owner. ... Customer-facing tracking shows only identity-authorized data."

**Kondisi nyata**: Hanya `EventTimeline` berisi shipment (trackingNumber — status) dirender via API, dengan `statusTone` yang mengenali canonical status + STALE/EXCEPTION/UNKNOWN. Namun navigasi `/shipments` tak disembunyikan saat kapabilitas mati (nav statis, X-4); tak ada hitungan per canonical status, tak ada filter, tak ada detail `/shipments/:id`, tak ada queue `/shipment-exceptions`, tak ada penanda source/freshness/ETA, tak ada penegakan identity-auth.

**Bukti**:
- `apps/client-portal/src/app/shipments/page.tsx:15` - `statusTone` canonical (DELIVERED/IN_TRANSIT/…) + STALE/EXCEPTION/UNKNOWN; `:67` `EventTimeline` dirender via API
- `apps/client-portal/src/config/navigation.ts:11` - `/shipments` statis, tanpa gating kapabilitas
- glob `apps/client-portal/src/app/**/[*]/**` → tak ada `/shipments/:id`; direktori app tak punya folder `shipment-exceptions`
- Perintah: `Select-String -Path apps/client-portal/src/app/shipments/page.tsx -Pattern 'freshness|reconcile|proof|resolve|assign|\bETA\b|source'` → 0 hasil

**Yang kurang**: sembunyikan nav saat `shipment_tracking` mati; hitungan canonical + filter; detail `/shipments/:id`; queue `/shipment-exceptions`; penanda source/freshness/ETA; penegakan identity-auth pada tracking.

---

### REQ-03-029 - Automations client: template view, tanpa edit raw graph di MVP - HILANG - LOW

**Persyaratan** (`03_UX_UI §6.11`): "MVP client view: available templates; enabled/disabled; safe parameters; recent runs; failures; pause. Client does not edit raw workflow graph on MVP."

**Kondisi nyata**: Tidak ada rute `/automations` di client-portal. Katalog navigasi klien pun tak memuat Automations (padahal §3.2 mencantumkannya).

**Bukti**:
- glob `apps/client-portal/src/app/**/automations/**` → 0 hasil; inventaris 13 `page.tsx` tak memuat automations
- `apps/client-portal/src/config/navigation.ts:5-16` - 12 item nav; tak ada entri Automations
- Perintah: `Select-String -Path apps/client-portal/src -Pattern 'automations|raw workflow|workflow graph'` → 0 hasil

**Yang kurang**: halaman `/automations` klien (available templates, enable/disable, safe parameters, recent runs, failures, pause) tanpa editor raw graph (TIDAK ADA).

---

### REQ-03-030 - Analytics: tab + setiap metric definition/tz/comparison/freshness/export - SEBAGIAN - LOW

**Persyaratan** (`03_UX_UI §6.12`): "Tabs: Service; Sales; Bookings; AI Quality; Channels; Agents; Usage. Every metric supports: definition tooltip; date/timezone; current vs comparison; filters; freshness; export permission."

**Kondisi nyata**: Ada 7 tab yang dirender, tetapi namanya berbeda dari spec (overview/messages/ai/sla/revenue/logistics/csat vs Service/Sales/Bookings/AI-Quality/Channels/Agents/Usage). Metrik semata memakai `MetricCard`, yang dari 6 dukungan wajib hanya punya freshness — tanpa definition tooltip, date/timezone, current-vs-comparison, filters, atau export.

**Bukti**:
- `apps/client-portal/src/client-analytics.tsx` - `AnalyticsTab = 'overview'|'messages'|'ai'|'sla'|'revenue'|'logistics'|'csat'`; tiap tab merender `MetricCard`
- `packages/ui/src/operational.tsx:3-31` - `MetricCard` hanya `label`/`value`/`trend?`/`freshness`; tanpa prop definition/tz/comparison/filter/export

**Yang kurang**: dari 6 dukungan metrik hanya freshness ada; tambahkan definition tooltip, date/timezone, current-vs-comparison, filters, dan export; selaraskan nama tab dengan §6.12.

---

### REQ-03-031 - Team & Settings - SEBAGIAN - LOW

**Persyaratan** (`03_UX_UI §6.13`): "Team: invite; role; queue membership; status; last active; revoke. Settings: business profile; business hours; brand/tone; escalation; consent; fields; notifications; guarded AI settings; channel state."

**Kondisi nyata**: Team merender daftar members + pending invitations via `/client/v1/team`, tetapi tanpa aksi invite, edit role, queue membership, last active, maupun revoke (read-only). Settings punya 4 tab (channels/api/profile/guardrails) tetapi menyimpan ke `localStorage`, bukan API; hilang business hours, brand/tone, escalation, consent, fields, dan notifications.

**Bukti**:
- `apps/client-portal/src/team-management.tsx:20-24` - fetch `/client/v1/team`; render members + invitations (read-only, tanpa tombol invite/role/revoke)
- `apps/client-portal/src/app/settings/page.tsx:73-84` - `handleSaveSettings` menulis `localStorage.setItem('chai_client_settings', …)` (bukan API)
- `apps/client-portal/src/app/settings/page.tsx:19` - hanya 4 tab (`'profile'|'channels'|'api'|'guardrails'`)

**Yang kurang**: aksi Team (invite/role/queue-membership/last-active/revoke); Settings persist ke API + seksi business-hours/brand-tone/escalation/consent/fields/notifications.

---

### REQ-03-032 - Hosted payment link flow (6 langkah §7.4) - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §7.4`): "1 Show authoritative amount, currency, purpose, merchant, expiry. 2 Require confirmation or approval according to risk policy. 3 Create/send the provider-hosted link once using an idempotency key. 4 Show `Waiting for payment` while provider evidence is absent. 5 Update to `Paid` only after verified webhook/query... 6 If status is stale/uncertain, show reconcile/handover instead of success."

**Kondisi nyata**: Halaman payments hanya menampilkan sesi yang sudah ada — amount (`MoneyAmount`, minor units), currency, expiry, dan status server. Ini memenuhi langkah 1 sebagian (tanpa purpose/merchant) dan menampilkan status secara pasif (langkah 5). Tak ada alur create di UI: tanpa langkah confirmation/approval, tanpa pembuatan link ber-idempotency-key, tanpa state khusus "Waiting for payment", dan tanpa aksi reconcile/handover saat stale.

**Bukti**:
- `apps/client-portal/src/app/payments/page.tsx:68` - `MoneyAmount` (amount/currency); daftar hanya menampilkan status/expiry/checkout link
- `packages/ui/src/money-and-timeline.tsx:38-56` - `formatMoneyMinor` menjaga minor units tanpa aritmetika float (uang authoritative)
- Perintah: `Select-String -Path apps/client-portal/src/app/payments/page.tsx -Pattern 'Waiting for payment|reconcile|handover|idempot|approval|purpose|merchant'` → 0 hasil

**Yang kurang**: alur create 6-langkah (konfirmasi/approval per risk; create link sekali ber-idempotency-key; state "Waiting for payment"; reconcile/handover saat stale) — plus purpose/merchant pada tampilan.

---

### REQ-03-033 - Shipment tracking & exception flow (5 langkah §7.5) - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §7.5`): "1 Verify customer/order ownership or authorized client session. 2 Show canonical current state, last provider event, source, and freshness. 3 Render the immutable timeline and provider ETA only when supplied. 4 For stale/failed/lost/damaged/return state, create an exception and surface contact/escalation actions. 5 Do not promise a new ETA unless the source provides it."

**Kondisi nyata**: Halaman shipments memenuhi sebagian langkah 2-3: menampilkan canonical state + last event lewat `EventTimeline` (urut per `lastSyncedAt`), dan tak mengarang ETA (memang tak ada ETA sama sekali). Namun tak ada verifikasi ownership (langkah 1), tak ada penanda source/freshness (langkah 2), dan tak ada pembuatan exception + aksi contact/escalation untuk state stale/failed/lost (langkah 4).

**Bukti**:
- `apps/client-portal/src/app/shipments/page.tsx:67` - `EventTimeline` dirender via API; `:37-45` entri diurutkan per `lastSyncedAt` (last event)
- `apps/client-portal/src/app/shipments/page.tsx:15` - `statusTone` canonical + STALE/EXCEPTION
- Perintah: `Select-String -Path apps/client-portal/src/app/shipments/page.tsx -Pattern 'freshness|reconcile|proof|resolve|assign|\bETA\b|source'` → 0 hasil (tak ada source/freshness/ETA/aksi exception)

**Yang kurang**: verifikasi ownership/authorized session; penanda source + freshness; pembuatan exception + aksi contact/escalation untuk state stale/failed/lost/damaged/return.

---

### REQ-03-034 - Global UI States: 10 state di setiap data surface (§8) - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §8`): "Every data surface defines" 10 state — Loading, Empty-first-use, Empty-filter, Partial, Stale, Error-retryable, Error-permission, Offline, Saving, Success.

**Kondisi nyata**: Komponen state tersedia dan sebagian benar-benar dirender: `PageState` (loading/empty/error) ter-wire di route-level `loading.tsx`/`error.tsx` untuk beberapa rute, dan `SavingIndicator` dipakai di inbox. Namun tiga komponen state **hanya didefinisikan, nol render**: `DataStateBanner` (partial/stale), `OfflineNotice` (offline), `SavingOverlay`. Dua state — **Empty-filter** dan **Error-permission** — tak punya implementasi sama sekali. Selain itu, sebagian besar halaman data (customers/leads/bookings/knowledge/team/payments) memakai div ad-hoc "Loading…"/"Failed to load", bukan sistem state — jadi 10-state contract tak berlaku "di setiap data surface".

**Bukti**:
- `packages/ui/src/page-state.tsx` - `PageState` hanya loading/empty/error (+correlationId, retry); dipakai di `apps/client-portal/src/app/{analytics,customers,inbox}/{loading,error}.tsx` dan `apps/owner-console/src/app/{automation,marketplace/webhooks,whitelabel}/…`
- `apps/client-portal/src/unified-inbox.tsx:338` - `SavingIndicator` (saving/saved) dipakai (satu-satunya render state Saving/Success)
- Perintah: `Select-String -Path apps -Pattern 'DataStateBanner|OfflineNotice|SavingOverlay'` → 0 hasil (didefinisikan di `packages/ui`, nol call-site di aplikasi)
- `apps/client-portal/src/app/customers/page.tsx:60-63` - contoh state ad-hoc ("Loading customers…"/"Failed to load"), bukan sistem state

**Yang kurang**: render `DataStateBanner` (partial/stale) & `OfflineNotice` di surface data; implementasi state Empty-filter & Error-permission; terapkan 10-state contract konsisten di setiap halaman (ganti div ad-hoc).

---

### REQ-03-035 - Confirmation patterns per risk + never color-alone - BERTENTANGAN - HIGH

**Persyaratan** (`03_UX_UI §9`): "High → Re-auth/approval plus typed confirmation where destructive. Critical → Two-person approval or Founder re-auth. Never use color alone to communicate risk."

**Kondisi nyata**: Aksi destruktif berisiko tinggi dieksekusi satu klik **tanpa** konfirmasi, re-auth, maupun typed-confirmation: circuit breaker AI klien, kill switch provider (→ SHUTDOWN), dan suspend tenant semuanya hanya men-toggle state lokal. Ini melanggar pola High/Critical §9. (Aturan "never color alone" sendiri dipatuhi: `StatusBadge` selalu menyertakan ikon + teks label.)

**Bukti**:
- `apps/owner-console/src/owner-overview.tsx:150-153` - tombol circuit breaker: `onClick={() => { setAiCircuitBreaker((prev) => !prev); … }}` (satu klik, tanpa konfirmasi/re-auth)
- `apps/owner-console/src/app/marketplace/page.tsx:106,176` - `toggleKillSwitch` di-invoke `onClick={() => toggleKillSwitch(p.id)}` (provider → SHUTDOWN tanpa dialog)
- `apps/owner-console/src/tenants-overview.tsx:83-92` - suspend = toggle state lokal tanpa dialog (lihat REQ-03-008, X-3)
- `packages/ui/src/operational.tsx:76-93` - `StatusBadge` selalu ikon + teks (bukan warna semata) — bagian "never color alone" terpenuhi
- Perintah: `Select-String -Path apps/owner-console/src -Pattern 'typed confirmation|re-auth|two-person|confirm\('` → hanya "Request Approval"/`PENDING_APPROVAL` pada publish automation; nol pada aksi destruktif

**Yang kurang**: gerbang konfirmasi per tier risiko — dialog + typed-confirmation/re-auth untuk High, two-person/founder re-auth untuk Critical — pada circuit breaker, kill switch, dan suspend.

---

### REQ-03-036 - Notifications: security/owner-critical tak bisa dinonaktifkan - SEBAGIAN - LOW

**Persyaratan** (`03_UX_UI §10`): "Users control non-critical notifications; security and owner-critical alerts cannot be fully disabled."

**Kondisi nyata**: Ada notification center yang dirender (`AppShell`) dengan daftar + "Mark all read", tetapi datanya `MOCK_NOTIFICATIONS` hardcoded (X-1). Tak ada UI kontrol preferensi notifikasi sama sekali, dan tak ada kategorisasi security/owner-critical sebagai tak-bisa-dinonaktifkan.

**Bukti**:
- `packages/ui/src/app-shell.tsx:66-70` - `MOCK_NOTIFICATIONS` hardcoded; dropdown hanya render daftar + "Mark all read"
- Perintah: `Select-String -Path apps -Pattern 'notification.*preference|preferences|cannot be disabled|owner-critical'` → 0 hasil

**Yang kurang**: UI preferensi notifikasi (kontrol non-critical) + penandaan kategori security/owner-critical yang tak dapat dinonaktifkan; wiring data notifikasi ke API.

---

### REQ-03-037 - Search permission-aware, tak bocorkan eksistensi luar scope, tracking≠bypass identity - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §11`): "Global search is permission-aware. Owner searches tenant/channel/incident/correlation ID; Client searches contact/conversation/lead/booking/order. Payment and shipment search is tenant/permission-aware; tracking reference alone never bypasses identity. Search result never reveals object existence outside current scope."

**Kondisi nyata**: Ada modal Quick Search yang dirender, tetapi hanya menyaring **item navigasi** berdasarkan label (`navigation.filter(...)`) — bukan pencarian entitas. Tak mencari tenant/contact/conversation/lead/booking/order; tak permission-aware terhadap data; tak ada pencarian tracking reference. Karena hanya menyaring label nav, tak ada kebocoran eksistensi objek, tetapi juga bukan pencarian yang disyaratkan.

**Bukti**:
- `packages/ui/src/app-shell.tsx:141-143` - `filteredSearchItems = navigation.filter((item) => item.label.toLowerCase().includes(searchQuery…))`
- `packages/ui/src/app-shell.tsx` (modal Quick Search) - hanya render "Navigation Links" hasil filter label; tak ada query entitas/API

**Yang kurang**: pencarian entitas per-surface (tenant/channel/incident vs contact/conversation/lead/booking/order) yang permission-aware; pencarian payment/shipment yang tak mem-bypass identity via tracking reference.

---

### REQ-03-038 - Accessibility WCAG 2.2 AA (§12) - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §12`): antara lain "Keyboard-complete navigation for inbox and tables; Visible focus ring; Semantic heading order; Labels for all inputs; Live region for message arrival and save status; Chart data table alternative; Minimum touch target 44×44 px; Contrast ≥4.5:1; Reduced motion respected; Captions/transcript for audio."

**Kondisi nyata**: Sebagian terpenuhi: focus ring terlihat (`focus-visible:outline-2`), target sentuh 44px (`min-h-11`/`size-11`), live region untuk status (aria-live pada `PageState`, `SavingIndicator`, `OfflineNotice`), reduced motion (`motion-reduce:animate-none`), urutan heading semantik (h1/h2/h3), dan aria-label pada tombol ikon. Namun: `Chart` **tak menyediakan data-table alternative** (dan `Chart` bahkan tak dirender di rute mana pun); sebagian input hanya `placeholder` tanpa `<label>` (mis. input search); captions/transcript audio tak ada; kontras & keyboard-complete tables tak dapat diverifikasi statis.

**Bukti**:
- `packages/ui/src/app-shell.tsx:44-49` - `focus-visible:outline-2` + `min-h-11` (focus ring + touch target 44px)
- `packages/ui/src/page-state.tsx:16-20` - `role="status"`/`aria-live`; `:100` `motion-reduce:animate-none`
- `packages/ui/src/chart.tsx:44-52` - SVG `role="img"` + aria-label, tetapi tanpa tabel data alternatif
- Perintah: `Select-String -Path apps -Pattern '<Chart|LineChart|BarChart'` → hanya ikon `BarChart3` di `navigation.ts` (komponen `Chart` nol render)

**Yang kurang**: data-table alternative untuk chart (dan penggunaan chart yang sebenarnya); `<label>` eksplisit untuk semua input; captions/transcript audio; verifikasi kontras & keyboard-complete pada tabel/inbox.

---

### REQ-03-039 - Localization: string externalized, locale date, UTC store, relative+absolute - SEBAGIAN - LOW

**Persyaratan** (`03_UX_UI §13`): "UI strings externalized. Dates use tenant locale; timestamps store UTC. Relative time always has absolute tooltip. Numbers/currency use locale. Copy avoids unexplained English jargon in Indonesian UI."

**Kondisi nyata**: Hanya currency yang locale-aware (`MoneyAmount`/`formatMoneyMinor` via `Intl.NumberFormat`). String UI **tidak** di-externalize — tak ada framework i18n; teks di-hardcode inline dan bercampur Inggris + Indonesia. Tanggal di client-portal ditampilkan sebagai ISO mentah (`<time>{...}</time>`) tanpa format locale dan tanpa tooltip relative+absolute.

**Bukti**:
- `packages/ui/src/money-and-timeline.tsx:38-56` - `formatMoneyMinor` memakai `Intl.NumberFormat(locale, { style:'currency' })` (currency locale-aware)
- Perintah: `Select-String -Path apps -Pattern 'next-intl|i18next|useTranslation|react-intl|FormattedMessage|formatRelative'` → 0 hasil (string tak di-externalize; tak ada relative-time util)
- `apps/owner-console/src/app/logistics/page.tsx:92,137` - satu-satunya `toLocaleDateString()`; client-portal memakai ISO mentah (mis. `payments/page.tsx` expiry, `bookings/page.tsx:66`)

**Yang kurang**: externalisasi string (i18n) + audit jargon Inggris di UI Indonesia; format tanggal per locale; tooltip absolut untuk waktu relatif.

---

### REQ-03-040 - UX Acceptance Checklist 12 butir (§14) - SEBAGIAN - MEDIUM

**Persyaratan** (`03_UX_UI §14`): 12 butir — route in permission matrix; loading/empty/error/partial states; primary action clear; destructive actions show impact; freshness for external/analytical data; payment status distinguishes requested/processing/verified-paid/expired/refunded; shipment timeline exposes source/freshness/exception tanpa mengarang ETA; mobile critical path tested; keyboard path tested; analytics has definitions; AI-generated content identified; owner-only controls never render for client.

**Kondisi nyata**: Checklist terpenuhi sebagian. Yang ada: freshness pada `MetricCard`; mobile nav; focus ring; pemisahan surface owner/client via prop `surface`. Yang **gagal/parsial**: destructive actions tak menampilkan impact (REQ-03-035, BERTENTANGAN); state loading/empty/error/partial tak konsisten di semua surface (REQ-03-034); analytics tanpa definitions (REQ-03-030); AI-generated content tak ditandai (REQ-03-023, REQ-04-015/016); route tanpa gating permission (REQ-03-004/017); payment status tanpa refunded/disputed & shipment tanpa source/freshness (REQ-03-027/028).

**Bukti**:
- `packages/ui/src/operational.tsx:20-24` - `MetricCard` menampilkan freshness (butir 5 terpenuhi)
- `packages/ui/src/app-shell.tsx:24-27` - prop `surface: 'client' | 'owner'` memisah permukaan (butir 12, sebagian)
- Butir gagal dirujuk ke bukti REQ terkait: REQ-03-035 (impact destruktif), REQ-03-034 (states), REQ-03-030 (definitions), REQ-03-023 (AI-content), REQ-03-004/017 (permission), REQ-03-027/028 (payment/shipment)

**Yang kurang**: penuhi butir yang gagal — tampilkan impact aksi destruktif, lengkapi 4 state di tiap surface, definitions di analytics, penanda konten AI, gating permission per route, status refunded/disputed & source/freshness pada payment/shipment.

---
