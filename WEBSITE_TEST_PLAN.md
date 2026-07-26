# Skema Testing Website — Chai Platform

> **Tanggal**: 24 Juli 2026
> **Berdasarkan**: audit `feature_audit_report.md` + Blueprint v1.2
> **Tujuan**: Panduan QA manual via browser. Untuk setiap fitur: status aktual, cara test, hasil yang diharapkan (correct behavior), prioritas.
> **Catatan**: Mayoritas frontend masih mock — test ini sekaligus jadi checklist untuk verifikasi setelah refactor (Fase 2 wiring) selesai.

---

## 0. Prasyarat & Setup

### 0.1 Jalankan stack lokal
```powershell
# Dari root D:\Games\Agent\Chai
pnpm install
# Start database + infra (di terminal terpisah)
docker compose -f infra/compose/docker-compose.yml up -d postgres redis
# Run migration
pnpm --filter @chai/database db:migrate
# Seed (jika ada script seed — cek packages/database/package.json)
# Start API
pnpm --filter @chai/api dev          # http://localhost:3001
# Start realtime-gateway
pnpm --filter @chai/realtime-gateway dev   # http://localhost:3002
# Start frontend
pnpm --filter @chai/client-portal dev      # http://localhost:3000
pnpm --filter @chai/owner-console dev      # http://localhost:3000 (port beda, cek .env)
```

### 0.2 Akun test (perlu cek seed script)
Cek `packages/database` apakah ada seed yang buat akun founder + tenant owner + client user. Jika belum, daftar via owner-console login page (`createLoginAction` flow). Catat:
- **Owner Console**: URL + kredensial founder
- **Client Portal**: URL + kredensial client user per tenant

### 0.3 Tools QA
- Browser Chrome/Firefox dengan DevTools (Network tab wajib untuk lihat API call)
- Optional: `curl`/Postman untuk test webhook WhatsApp Meta (butuh ngrok untuk callback)

### 0.4 Konvensi dokumen
- **TC-ID**: Test Case identifier unik
- **Status aktual**: ✅ berfungsi / 🟡 sebagian / 🔴 mock atau rusak / ⚠️ ada tapi bug
- **Prioritas**: P0 (blocker MVP) / P1 (penting) / P2 (nice-to-have)
- **Hasil diharapkan**: behavior CORRECT sesuai Blueprint (bukan behavior aktual saat ini)

---

## 1. Client Portal (apps/client-portal)

Aplikasi untuk end-user client tenant: inbox, customer management, bookings, payments, dll. Audience = `client-portal`.

### 1.1 Autentikasi & Session

| TC-ID | Fitur | Status aktual | Cara test | Hasil diharapkan | Prioritas |
|---|---|:---:|---|---|:---:|
| CP-AUTH-01 | Login page render | ✅ | Buka `/login` | Form email/password, logo, link ke owner console sign-in | P0 |
| CP-AUTH-02 | Submit login valid | ✅ | Isi kredensial valid → submit | POST ke `/api/auth/login` → 200 → set HttpOnly session cookie → redirect ke `/inbox` (atau `next` param) | P0 |
| CP-AUTH-03 | Submit login invalid | 🟡 | Isi password salah → submit | 401 → tampilkan error "Kredensial tidak valid" → tetap di `/login` | P0 |
| CP-AUTH-04 | Protected route redirect | ✅ | Buka `/inbox` tanpa login (clear cookie) | Redirect ke `/login?next=/inbox` | P0 |
| CP-AUTH-05 | Session expiry | 🟡 | Login → tunggu token expire → refresh | Redirect ke `/login` dengan pesan session expired, bukan error 500 | P1 |
| CP-AUTH-06 | Logout | ✅ | Klik tombol logout | Clear session cookie → redirect `/login` → back button tidak restore session | P0 |
| CP-AUTH-07 | Re-login modal (token refresh fail) | 🟡 | Login → invalidate refresh token di DB → lakukan aksi | Modal re-login muncul (bukan hard crash) — lihat `@chai/auth-client` `re-login-modal.tsx` | P1 |

### 1.2 Inbox / Unified Inbox

| TC-ID | Fitur | Status aktual | Cara test | Hasil diharapkan | Prioritas |
|---|---|:---:|---|---|:---:|
| CP-INBOX-01 | Render inbox | 🔴 mock | Buka `/inbox` | Tampilkan daftar conversation (kiri) + thread pesan (kanan) + composer | P0 |
| CP-INBOX-02 | Load conversation list dari API | 🔴 mock | Buka inbox → cek Network | `GET /api/client/v1/channels/conversations` → 200 → render data real (bukan `MOCK_CONVERSATIONS`) | P0 |
| CP-INBOX-03 | Filter per channel | 🔴 mock | Klik filter WhatsApp/Email/Webchat | List ter-filter sesuai channel source | P1 |
| CP-INBOX-04 | Kirim balasan outbound | 🔴 mock | Pilih conversation → ketik → send | `POST /api/client/v1/channels/messages` → message terkirim via connector (WhatsApp Meta untuk channel WA) → tampil di thread | P0 |
| CP-INBOX-05 | Realtime update via SSE | 🔴 mock | Buka 2 tab inbox → kirim pesan dari tab A | Tab B terima pesan baru via SSE stream (`/api/realtime/conversations`) tanpa refresh | P1 |
| CP-INBOX-06 | Assignment ke agent | 🔴 mock | Klik conversation → assign ke team member | Conversation assigned → muncul di inbox team member tsb | P1 |
| CP-INBOX-07 | Attachment upload | 🟡 | Drag file ke composer | File upload → attachment URL → terkirim ke customer | P1 |

### 1.3 Customers

| TC-ID | Fitur | Status aktual | Cara test | Hasil diharapkan | Prioritas |
|---|---|:---:|---|---|:---:|
| CP-CUST-01 | Render customer list | 🟡 hybrid | Buka `/customers` | Tampilkan list customer dengan search, avatar, last interaction | P0 |
| CP-CUST-02 | Data dari API (bukan mock) | 🔴 naïve | Buka → cek Network | `GET /api/v1/customers` via BFF proxy (dengan auth cookie, bukan hardcode `tenantId='demo-tenant-id'`) → data real | P0 |
| CP-CUST-03 | Search customer | 🔴 mock | Ketik di search box | List ter-filter real-time sesuai query | P1 |
| CP-CUST-04 | Detail customer | 🔴 mock | Klik customer | Tampilkan riwayat: conversation, bookings, payments, status | P1 |
| CP-CUST-05 | Add/edit customer | 🔴 mock | Form tambah customer | `POST` → persist → muncul di list | P1 |

### 1.4 Leads & Bookings

| TC-ID | Fitur | Status aktual | Cara test | Hasil diharapkan | Prioritas |
|---|---|:---:|---|---|:---:|
| CP-LEAD-01 | Leads list | 🔴 mock | Buka `/leads` | Tampilkan pipeline leads dengan stage | P0 |
| CP-LEAD-02 | Create lead | 🔴 mock | Form new lead | `POST /api/client/v1/leads` → persist (migration `0007_leads_and_appointments.sql` ada) | P0 |
| CP-LEAD-03 | Move lead stage | 🔴 mock | Drag lead antar stage | Stage update → audit log tercatat | P1 |
| CP-BOOK-01 | Bookings calendar | 🔴 mock | Buka `/bookings` | Tampilkan kalender/appointment list | P1 |
| CP-BOOK-02 | Create booking | 🔴 mock | Form booking → pilih lead + slot | `POST /api/client/v1/calendar/appointments` → persist → cek konflik slot | P1 |

### 1.5 Payments

| TC-ID | Fitur | Status aktual | Cara test | Hasil diharapkan | Prioritas |
|---|---|:---:|---|---|:---:|
| CP-PAY-01 | Payment list | 🔴 mock | Buka `/payments` | Tampilkan list payment session dengan status (PENDING/PAID/EXPIRED/FAILED) | P0 |
| CP-PAY-02 | Generate payment link | 🔴 mock | Form → input amount → Generate Link | `POST /api/client/v1/payments/checkout` → return Midtrans/Stripe URL → shareable | P0 |
| CP-PAY-03 | Payment status update | 🔴 mock | Trigger webhook simulasi paid | Status berubah PENDING→PAID via webhook handler → `payment-state-machine` transition valid | P0 |
| CP-PAY-04 | Kill switch | 🟡 | Owner toggle kill switch di owner-console → coba generate link | Generation blocked → tampilkan pesan maintenance | P1 |

### 1.6 Knowledge Base

| TC-ID | Fitur | Status aktual | Cara test | Hasil diharapkan | Prioritas |
|---|---|:---:|---|---|:---:|
| CP-KB-01 | Article list | 🔴 mock | Buka `/knowledge` | Tampilkan artikel kategori + search | P1 |
| CP-KB-02 | Create article | 🔴 mock | Form artikel | `POST /api/client/v1/knowledge` → persist (migration `0009_knowledge.sql` ada) → indexed untuk RAG | P1 |

### 1.7 Shipments / Logistics

| TC-ID | Fitur | Status aktual | Cara test | Hasil diharapkan | Prioritas |
|---|---|:---:|---|---|:---:|
| CP-SHIP-01 | Shipment list | 🔴 mock | Buka `/shipments` | List shipment dengan tracking number, carrier, status | P1 |
| CP-SHIP-02 | Track shipment | 🔴 mock | Input tracking number | `GET` → fetch status carrier (JNE/MockShipping) → tampilkan timeline | P1 |
| CP-SHIP-03 | Stale detection | 🟡 | Set lastSyncedAt tua → trigger worker | Status berubah STALE (logistics-worker `shouldMarkStale`) | P2 |

### 1.8 Commerce, Team, Settings, Analytics

| TC-ID | Fitur | Status aktual | Cara test | Hasil diharapkan | Prioritas |
|---|---|:---:|---|---|:---:|
| CP-COM-01 | Commerce catalog | 🔴 mock | Buka `/commerce` | List produk/order | P2 |
| CP-TEAM-01 | Team management | 🔴 mock | Buka `/team` | List member + role + invite | P1 |
| CP-TEAM-02 | Invite member | 🔴 mock | Form invite email | `POST /api/client/v1/iam/invitations` → email terkirim → accept → join tenant | P1 |
| CP-SET-01 | Settings page | 🔴 mock | Buka `/settings` | Profile tenant, notification pref, business hours | P1 |
| CP-ANA-01 | Analytics dashboard | 🔴 mock | Buka `/analytics` | Metric cards (conversation volume, response time, CSAT) + chart | P1 |
| CP-ANA-02 | Metrics dari API | 🔴 mock | Cek Network | `GET /api/client/v1/analytics/*` → data real (bukan `DEFAULT_METRICS`) | P1 |

---

## 2. Owner Console (apps/owner-console)

Aplikasi untuk platform owner/founder: manage tenants, AI ops, automation, marketplace, audit, dll. Audience = `owner-console`.

### 2.1 Autentikasi

| TC-ID | Fitur | Status aktual | Cara test | Hasil diharapkan | Prioritas |
|---|---|:---:|---|---|:---:|
| OC-AUTH-01 | Login founder | ✅ | Buka `/login` → submit kredensial founder | Redirect ke `/` (overview) dengan audience `owner-console` | P0 |
| OC-AUTH-02 | Audience isolation | ✅ | Coba akses owner-console pakai session client-portal | Ditolak (audience guard) → redirect login | P0 |

### 2.2 Platform Overview Dashboard

| TC-ID | Fitur | Status aktual | Cara test | Hasil diharapkan | Prioritas |
|---|---|:---:|---|---|:---:|
| OC-OV-01 | Render overview | 🔴 mock | Buka `/` | Card: total tenant, active tenant, AI client status, risk flags, webhook health | P0 |
| OC-OV-02 | Data real | 🔴 mock | Cek Network | `GET /api/.../tenants` + `/metrics` + `/sla` → data real (bukan `MOCK_TENANTS_DATA` Nusantara Dental dll) | P0 |
| OC-OV-03 | Ping webhook button | 🔴 mock | Klik "Uji Coba Ping Webhook" | Trigger health check webhook connector → tampilkan hasil real (latency, status) | P1 |
| OC-OV-04 | Hentikan AI klien | 🔴 mock | Klik "Hentikan Sementara AI Klien" | Kill switch aktif → semua outbound AI stopped → audit log | P1 |

### 2.3 Tenant Management

| TC-ID | Fitur | Status aktual | Cara test | Hasil diharapkan | Prioritas |
|---|---|:---:|---|---|:---:|
| OC-TEN-01 | Tenant directory | 🔴 mock | Buka `/tenants` | List tenant dengan status (ACTIVE/SUSPENDED/ARCHIVED), plan, risk flags | P0 |
| OC-TEN-02 | Tenant detail | 🔴 mock | Klik tenant | Detail: usage, users, connector config, billing, audit history | P0 |
| OC-TEN-03 | Suspend tenant | 🔴 mock | Action suspend | Tenant status → SUSPENDED → akses client portal blocked → audit log | P0 |
| OC-TEN-04 | Provisioning wizard | 🔴 mock | Create new tenant | Wizard: name → plan → owner user → initial connector → confirm → tenant aktif | P1 |

### 2.4 AI Operations

| TC-ID | Fitur | Status aktual | Cara test | Hasil diharapkan | Prioritas |
|---|---|:---:|---|---|:---:|
| OC-AI-01 | Agent profile list | 🟡 in-mem | Buka `/ai-operations` | List agent profile per tenant (DRAFT/ACTIVE/PAUSED/ARCHIVED) | P0 |
| OC-AI-02 | Create agent | 🟡 in-mem | Form profile (name, useCase, tone, language, businessRules) | `POST /api/.../ai-agent` → persist (PERHATIAN: saat ini in-memory, restart kehilangan data — perlu Fase 5.1 postgres repo) | P0 |
| OC-AI-03 | Tool policy | 🟡 in-mem | Config tool policy per agent | Policy tersimpan → enforced saat agent run | P1 |
| OC-AI-04 | Agent session runtime | 🔴 missing | Trigger agent conversation | **SAAT INI TIDAK ADA runtime loop** — hanya CRUD profile. AI gateway (6 file logic: conversation-state, rag, guardrails, tool-execution, cost-accounting) ada tapi tidak ter-wiring ke controller ai-agent | P0 |

### 2.5 Automation & Builder

| TC-ID | Fitur | Status aktual | Cara test | Hasil diharapkan | Prioritas |
|---|---|:---:|---|---|:---:|
| OC-AUTO-01 | Flow list | 🟡 | Buka `/automation` | List automation flow dengan status | P0 |
| OC-AUTO-02 | Flow builder | 🟡 | Buka `/automation/builder` | Visual builder: trigger → condition → action node | P1 |
| OC-AUTO-03 | Save flow | 🟡 | Drag node → save | `POST /api/client/v1/automation/flows` → persist (sudah ada call site) | P0 |
| OC-AUTO-04 | Execute flow | 🟡 | Trigger flow (manual/event) | Temporal workflow run → execution log → audit | P1 |

### 2.6 Marketplace & Connectors

| TC-ID | Fitur | Status aktual | Cara test | Hasil diharapkan | Prioritas |
|---|---|:---:|---|---|:---:|
| OC-MKT-01 | Connector catalog | 🟡 | Buka `/marketplace` | List connector (WhatsApp Meta, Midtrans, JNE, Google Calendar, OpenAI, Anthropic) dengan capability manifest | P1 |
| OC-MKT-02 | Activate connector | 🟡 | Klik activate → config credential | Connector config persist per tenant → health check pass | P1 |
| OC-MKT-03 | Webhook config | 🟡 | Buka `/marketplace/webhooks` | Generate webhook URL + secret per connector | P0 |
| OC-MKT-04 | Kill switch per connector | 🟡 | Toggle kill switch | Connector disabled → inbound/outbound blocked → audit | P1 |

### 2.7 Reliability (SLA/Quarantine/Retention)

| TC-ID | Fitur | Status aktual | Cara test | Hasil diharapkan | Prioritas |
|---|---|:---:|---|---|:---:|
| OC-REL-01 | SLA monitoring | 🟡 | Buka `/reliability` | SLA breach list, response time p95, status per tenant | P1 |
| OC-REL-02 | Quarantine | 🟡 | Trigger message suspicious | Message → quarantine → review → release/drop | P1 |
| OC-REL-03 | Retention policy | 🟡 | Config retention | Old data purged sesuai policy → audit | P2 |

### 2.8 Audit, Logistics, Settings, Whitelabel

| TC-ID | Fitur | Status aktual | Cara test | Hasil diharapkan | Prioritas |
|---|---|:---:|---|---|:---:|
| OC-AUD-01 | Audit log | ✅ | Buka `/audit` | Immutable log per tenant: who/what/when → tidak bisa edit/delete (audit-immutability) | P0 |
| OC-AUD-02 | Audit tamper detection | ✅ | Coba modify audit row via SQL | Row reject (hash mismatch / trigger block) | P0 |
| OC-LOG-01 | Logistics overview | 🟡 | Buka `/logistics` | Cross-tenant shipment status, carrier performance | P1 |
| OC-SET-01 | Settings | 🔴 mock | Buka `/settings` | Platform config, billing, SMTP | P1 |
| OC-WL-01 | Whitelabel themes | 🟡 | Buka `/whitelabel` | Theme editor per tenant (color, logo, domain) → preview | P1 |

---

## 3. Cross-Cutting Tests (kritis, lintas fitur)

### 3.1 Multi-Tenant Isolation (SECURITY — P0)

| TC-ID | Fitur | Status aktual | Cara test | Hasil diharapkan |
|---|---|:---:|---|---|
| CC-ISO-01 | Tenant A tidak bisa baca data Tenant B | ✅ DB RLS | Login tenant A → coba GET resource tenant B (ubah tenantId di request) | 403/empty — RLS block di DB level (`current_tenant_id()`) |
| CC-ISO-02 | Cross-tenant query via SQL | ✅ | Connect sebagai `chai_app_runtime` → SELECT tanpa tenant filter | Hanya row tenant current return (RLS active) |
| CC-ISO-03 | Worker tenant scope | ✅ | Worker process tenant roster → coba leak data | Worker hanya akses tenant yang di-lease |
| CC-ISO-04 | Audience guard | ✅ | Pakai token client-portal → akses endpoint owner | 403 Forbidden (audience mismatch) |

### 3.2 Auth & Session

| TC-ID | Fitur | Status | Cara test | Hasil diharapkan |
|---|---|:---:|---|---|
| CC-AUTH-01 | HttpOnly cookie | ✅ | Login → cek cookie di DevTools | Session cookie `HttpOnly; Secure; SameSite` — JS tidak bisa baca |
| CC-AUTH-02 | Refresh token rotation | 🟡 | Login → tunggu access token expire → aksi → refresh otomatis | Refresh token rotate → access token baru → tidak logout |
| CC-AUTH-03 | CSRF protection | 🟡 | Submit form dari domain lain | Ditolak (jika ada CSRF token / SameSite strict) |
| CC-AUTH-04 | Rate limit login | 🔴 missing | Brute force 1000 password | **SAAT INI TIDAK ADA rate limit** — wajib Fase 5.2 dulu |

### 3.3 Realtime (SSE)

| TC-ID | Fitur | Status | Cara test | Hasil diharapkan |
|---|---|:---:|---|---|
| CC-RT-01 | SSE connection | 🟡 | Buka inbox → cek Network EventStream | Connection ke `/api/realtime/conversations` → 200 → stream open |
| CC-RT-02 | Event push | 🟡 | Trigger event backend (inbound message) | Event terkirim ke subscriber yang benar (tenant-scoped) |
| CC-RT-03 | Reconnect on drop | 🟡 | Kill network 5s → restore | Client auto-reconnect → resync state |
| CC-RT-04 | Auth SSE | 🟡 stub | Connect SSE tanpa session | **Saat ini synthetic header** — wajib Fase 6 validasi session nyata |

### 3.4 Idempotency

| TC-ID | Fitur | Status | Cara test | Hasil diharapkan |
|---|---|:---:|---|---|
| CC-IDEM-01 | Duplicate request | ✅ | POST checkout 2x dengan same `Idempotency-Key` | Return cached result pertama, tidak buat double |
| CC-IDEM-02 | Key reuse beda payload | ✅ | Same key + body beda | 409 Conflict / 422 |

---

## 4. Backend API Tests (frontend mock — test via curl/Postman)

Karena mayoritas frontend mock, fitur backend berikut **harus test via API langsung** untuk verifikasi nyata.

### 4.1 WhatsApp Meta Webhook

```bash
# Setup webhook URL (ngrok untuk local)
ngrok http 3001

# Verify webhook (Meta GET challenge)
curl "http://localhost:3001/api/client/v1/channels/webhook?hub.mode=subscribe&hub.verify_token=<TOKEN>&hub.challenge=12345"
# Expected: 200, body = "12345"

# Inbound message webhook (Meta POST)
curl -X POST "http://localhost:3001/api/client/v1/channels/webhook" \
  -H "X-Hub-Signature-256: sha256=<HMAC>" \
  -H "Content-Type: application/json" \
  -d '{"entry":[{"changes":[{"value":{"messages":[{"from":"6281xxx","text":{"body":"halo"}}]}}]}]}'
# Expected: 200, message masuk inbox conversation

# Outbound send
curl -X POST "http://localhost:3001/api/client/v1/channels/messages" \
  -H "Authorization: Bearer <token>" \
  -d '{"to":"6281xxx","text":"balasan"}'
# Expected: 200, message terkirim via Graph API
```

**Validasi**: signature verification (`timingSafeEqual`), tenant resolution dari phone number id, idempotency.

### 4.2 Payment Webhook (Midtrans)

```bash
# Simulasi Midtrans webhook
curl -X POST "http://localhost:3001/api/client/v1/payments/webhook" \
  -H "X-Override-Notification: ..." \
  -d '{"transaction_status":"settlement","order_id":"order-123"}'
# Expected: state machine transition PENDING→PAID, idempotent
```

### 4.3 End-to-End Flow (sudah ada e2e test — verifikasi manual)

Flow ini sudah tercakup `tests/e2e/*.spec.ts` (84/84 lulus). Verifikasi manual untuk konfirmasi:
- Lead → Booking → Payment → Shipment (lead-booking.spec)
- Conversation flow WhatsApp inbound → assignment → reply (conversation-flow.spec)
- Multi-tenant isolation (multi-tenant-isolation.spec)
- Payment flow checkout → webhook → status (payment-flow.spec)

---

## 5. Test Matrix — Ringkasan Prioritas

### P0 (Blocker MVP — wajib hijau sebelum launch)
- Semua CP-AUTH (login/logout/session)
- CP-INBOX-01,02,04 (inbox render, API, send)
- CP-CUST-02 (customer API)
- CP-LEAD-02 (create lead)
- CP-PAY-01,02,03 (payment list, link, webhook)
- OC-AUTH-01,02 (owner login, audience)
- OC-OV-01,02 (overview real data)
- OC-TEN-01,02,03 (tenant CRUD + suspend)
- OC-AI-01,02,04 (agent CRUD + runtime — **04 missing, blocker**)
- OC-MKT-03 (webhook config)
- OC-AUD-01,02 (audit log + tamper)
- CC-ISO-01,02,03,04 (tenant isolation)
- CC-AUTH-01 (HttpOnly cookie)
- CC-IDEM-01,02 (idempotency)

### P1 (Penting — sebelum staging signoff)
- Realtime SSE (CC-RT-01,02,03)
- Filter/search inbox
- Attachment upload
- Customer detail/edit
- Booking calendar + create
- Payment kill switch
- Knowledge article CRUD
- Shipment tracking
- Team invite + member management
- Settings page
- Analytics real metrics
- OC automation builder + execute
- OC marketplace activate connector + kill switch
- OC SLA/quarantine
- OC whitelabel themes
- OC-OV-03,04 (webhook ping, kill switch real)
- OC-TEN-04 (provisioning wizard)
- CC-AUTH-02,03 (refresh rotation, CSRF)
- CC-RT-04 (SSE auth)

### P2 (Nice-to-have — post-MVP)
- CP-COM-01 (commerce)
- CP-SHIP-03 (stale detection)
- OC-REL-03 (retention)
- Banner/widget SDK frontend

---

## 6. Known Issues (dari audit — jangan lapor sebagai bug baru)

Saat menjalankan test ini, kondisi berikut **sudah diketahui** (lihat `feature_audit_report.md`):

1. **Mayoritas page mock** — `MOCK_*` hardcoded, 0 panggilan API via BFF (kecuali login). Test akan FAIL sampai Fase 2 wiring selesai.
2. **ai-agent in-memory** — data hilang saat restart. Schema `0023_ai_agent.sql` ada tapi repo postgres belum.
3. **Contract drift** — backend route prefix 5+ skema inkonsisten. Frontend harus tebak path.
4. **Rate limit tidak ada** — login endpoint bisa di-brute force.
5. **Temporal worker** — fail startup di docker-compose (tidak ada Temporal server).
6. **Structured logger** — hanya console.log, correlationHook tanpa backend logger.
7. **Tes owner-console stale** — 3/5 expect label EN, komponen render ID.
8. **Widget SDK frontend** — hilang (backend endpoint ada).
9. **Realtime auth stub** — synthetic header, bukan session validation.
10. **`AGENTS.md` misleading** — klaim Prisma/Mongo/Redis, aktual Drizzle+Postgres.

---

## 7. Eksekusi Test — Workflow

### 7.1 Smoke test (5 menit, sebelum deep dive)
1. Start stack (§0.1)
2. Login owner-console → cek overview render
3. Login client-portal → cek inbox render
4. Cek Network tab: ada API call? 200?
5. Cek console: error?

### 7.2 Regression per build
- Jalankan P0 matrix setiap merge ke main
- Otomatisasi via Playwright (`tests/e2e/` sudah ada 5 spec — extend)

### 7.3 Pre-launch checklist
- [ ] Semua P0 hijau
- [ ] 80% P1 hijau
- [ ] `pnpm test:e2e` 84/84
- [ ] `turbo run test` 36/36 (perbaiki owner-console stale)
- [ ] Tenant isolation penetration test (CC-ISO-*)
- [ ] Rate limit aktif (Fase 5.2)
- [ ] Structured logger aktif (Fase 5.2c)

---

## 8. Bug Report Template

Saat menemukan bug, catat dengan format:
```
**TC-ID**: CP-INBOX-02
**Fitur**: Inbox load conversation dari API
**Lingkungan**: localhost:3000, Chrome 126, API localhost:3001
**Langkah**: 
1. Login client-portal
2. Buka /inbox
3. Cek Network tab
**Hasil aktual**: Tidak ada request GET /conversations, list kosong
**Hasil diharapkan**: GET /api/client/v1/channels/conversations → 200 → render data
**Screenshot/Log**: (attach)
**Severity**: P0 (blocker)
**Status known issue**: Ya (lihat §6.1 — frontend mock, Fase 2 belum selesai)
```

---

*Skema testing · 24 Juli 2026 · Berdasarkan audit evidence-based + Blueprint v1.2*
