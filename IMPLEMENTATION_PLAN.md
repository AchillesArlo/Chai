# Rencana Implementasi — Chai Omnichannel AI Platform

> **Analogi:** Membuat jajanan. Ada **Menu Utama** (kerangka inti, butuh koki kompeten) dan **Pelengkap** (sisa yang repetitif, bisa dikerjakan asisten).
>
> **Sumber kebenaran:** `feature_audit_report.md` (audit 21 Jul 2026) + verifikasi ulang 22 Jul 2026.
>
> **Status terverifikasi: ~38% selesai.** Bukan 58%. Backend campuran (beberapa nyata, banyak dangkal), frontend <20% route blueprint & statis, tidak ada login flow end-to-end, UI library hanya 3 komponen, konektor real ada tapi belum di-wiring.

---

## KOREKSI STATUS (verifikasi 22 Jul 2026)

Klaim lama salah. Realita setelah cek langsung:

| Klaim sebelumnya | Realita terverifikasi |
|---|---|
| Backend "matang 82%" | Campuran. `iam`/`payments`/`channels` nyata (RBAC, webhook verify). `analytics` cuma 1 endpoint. `ai-agent` CRUD via `@Query('tenantId')` — anti-pattern. ~15-20 modul punya struktur tapi kedalaman bervariasi. |
| Frontend "~35-45%" | Client portal: 6 dari 27 route, semua statis. Owner: 10 dari 28, sebagian statis. <20%. |
| Login "perlu konfirmasi" | **Tidak ada login flow.** Backend `session.controller` cuma GET (read session). Tidak ada POST login. Tidak ada UI login. Middleware client-portal TIDAK enforce auth (cuma handle whitelabel custom domain). |
| Konektor "real 70%" | Konektor real ditulis (whatsapp-meta/midtrans/jne) tapi modul `payments` masih `import mock-payment`. Belum di-wiring/env-activated. |
| UI library tidak diaudit | Hanya `app-shell`, `operational`, `page-state`. DataTable/Form/Modal/Chart/Notification ❌. |

---

## DUA JALUR KERJA

### MENU UTAMA — untuk agent KUAT (kerangka inti)
> Butuh pemahaman arsitektural, keputusan desain, risiko tinggi. Tidak boleh salah — fondasi untuk semua.

### PELENGKAP — untuk agent LEMAH (sisa, finishing)
> Repetitif, pola sudah ditetapkan agent kuat, risiko rendah. Asalkan ikut spec & contoh, aman.

**Aturan ketergantungan:** Pelengkap TIDAK boleh mulai sebelum Menu Utama yang jadi landasannya selesai & ditandai ✅. Tiap task Pelengkap sebut "butuh: [ID Menu Utama]".

---

# MENU UTAMA (Agent Kuat)

## M1 — Fondasi Auth & Session (gerbang semua)
> Tanpa ini, tidak ada page yang aman. Agent kuat wajib.

- [ ] M1.1 Endpoint login: `POST /api/auth/login` (owner) + `POST /api/client/v1/auth/login` → issue token (JWT/session), return permissions+tenantId. Verify password via `local-identity.ts`.
- [ ] M1.2 Token verification middleware di Fastify → inject `request.principal` + `request.tenantContext`. Hubungkan ke `AudienceGuard`.
- [ ] M1.3 Next.js middleware enforcement di kedua app: cek token cookie, redirect ke `/login` bila invalid. (Client-portal: pertahankan logika whitelabel, tambah auth check.)
- [ ] M1.4 Refresh/logout endpoint.
- [ ] M1.5 RBAC fix global: hapus pola `@Query('tenantId')` (ai-agent dll), wajib ambil dari `tenantContext` token. Tenant isolation certification test.
- [ ] M1.6 Session provider React (`useSession()`) di `packages/auth` untuk frontend.

**Bukti selesai:** Login → dapat token → akses page terproteksi → 403 untuk tenant lain. Test isolation: user A tidak bisa baca data tenant B.

---

## M2 — API Client & Realtime Foundation
- [ ] M2.1 `packages/api-client`: typed fetch, auto-inject token+tenantId, parse error envelope, retry idempotency. Generate types dari OpenAPI (`pnpm gen:api`).
- [ ] M2.2 React Query/SWR setup + cache strategy di kedua app.
- [ ] M2.3 SSE hook (`useInboxStream`) — subscribe realtime-gateway, auto-reconnect, backpressure handling.
- [ ] M2.4 Global error/toast/loading/empty-state plumbing (butuh P3 selesai dulu untuk komponen).

**Bukti selesai:** `useApi('/conversations')` return typed data, toast muncul saat error, SSE reconnect otomatis.

---

## M3 — Connector Activation & Provider Wiring
- [ ] M3.1 Env-based adapter factory: `PROVIDER_PAYMENT=midtrans|mock`, `PROVIDER_CHANNEL=whatsapp-meta|mock`, dst. Refactor modul agar tidak hardcode `import mock-*`.
- [ ] M3.2 Wire `payments` → MidtransAdapter (bukan mock), `channels` → WhatsAppMetaAdapter, `logistics` → JneAdapter, `calendar` → GoogleCalendarAdapter.
- [ ] M3.3 Webhook route registration per provider + signature verification path aktif.
- [ ] M3.4 Kill switch runtime: env flag + DB flag, owner-console toggle (butuh P-measurement halaman, tapi logic di sini).
- [ ] M3.5 Conformance suite dijalankan ulang untuk semua connector real.

**Bukti selesai:** Set `PROVIDER_PAYMENT=midtrans` + key → checkout benar-benar hit Midtrans Snap. WhatsApp webhook masuk → conversation terbuat.

---

## M4 — AI Gateway Real LLM + RAG + Tool
> Inti value proposition. Hanya agent kuat.

- [ ] M4.1 Real LLM adapter (OpenAI + Anthropic, env-based) implement `MockAiAdapter` interface. Streaming + non-streaming.
- [ ] M4.2 RAG: pgvector atas `knowledge` table, retrieval pipeline, citation grounding.
- [ ] M4.3 Tool execution engine: function calling ke internal API (cek pesanan/pembayaran/buat tiket) dengan allowlist per tenant + policy dari `ai-agent` module.
- [ ] M4.4 Conversation mode state machine nyata: `AI_ACTIVE`↔`HUMAN_ACTIVE`↔`PAUSED` dengan audit trail + takeover endpoint.
- [ ] M4.5 Guardrail: PII redaction pre-LLM, output toxicity filter, max-turn, confidence threshold → auto-escalate.
- [ ] M4.6 Token/cost accounting per tenant → `usage` table.
- [ ] M4.7 Golden dataset Q&A per domain → regression test.

**Bukti selesai:** AI menjawab dari knowledge base, panggil tool cek pesanan, escalate ke manusia saat complaint, cost tercatat, golden test lulus.

---

## M5 — Realtime & Worker Event Chain
- [ ] M5.1 End-to-end chain: channel webhook → outbox → realtime-gateway → SSE → inbox (verifikasi <3s).
- [ ] M5.2 Outbox dispatcher at-least-once + idempotent consumer. Test: kill worker mid-flight, no duplicate.
- [ ] M5.3 Inbox dispatcher auto-assignment (round-robin/skill).
- [ ] M5.4 Temporal workflows aktif: follow-up (H+1), payment reconciliation, shipment milestone.
- [ ] M5.5 Dead-letter queue + retry dashboard.
- [ ] M5.6 Reconciliation & unknown-result handling penuh (idempotency replay).

**Bukti selesai:** Pesan WA masuk tampil <3s. Worker crash → recovery no data loss. Follow-up terkirim tepat waktu.

---

## M6 — Security, RBAC, Observability Core
- [ ] M6.1 RBAC audit semua endpoint (role check + negative test per role).
- [ ] M6.2 Tenant isolation certification (RLS audit + test suite penuh).
- [ ] M6.3 PII redaction pipeline (audit log + LLM input).
- [ ] M6.4 Retention job eksekusi nyata + audit immutability runtime verify.
- [ ] M6.5 OpenTelemetry instrumentation lintas API→worker→connector.
- [ ] M6.6 Secret management: vault, bukan .env plaintext di prod.
- [ ] M6.7 SAST + dependency scan di CI. DAST staging.

**Bukti selesai:** Isolation test lulus. Trace visible lintas service. SAST clean. Pentest- ready.

---

# PELENGKAP (Agent Lemah)

> Setiap task di sini punya pola jelas dari Menu Utama. Ikuti spec `03_UX_UI_SPECIFICATION.md` + komponen `packages/ui`. Butuh: M1 (auth), M2 (api-client), M3 (konektor) selesai.

## P1 — Komponen UI Library (butuh: —, bisa mulai awal)
> Isi `packages/ui/src`. Pattern: props typed, pakai `tokens.css`, storybook tidak wajib tapi test wajib.
- [ ] P1.1 `DataTable` (sort, pagination, row action)
- [ ] P1.2 `Form` + field components (Input/Select/Textarea/Checkbox) + validation hook
- [ ] P1.3 `Modal`/`Dialog` system (reusable, escape, focus trap)
- [ ] P1.4 `Chart` (line/bar/donut, wrap recharts yang sudah ada di dep)
- [ ] P1.5 `Notification`/`Toast` system
- [ ] P1.6 `Tabs`, `Dropdown`, `Pagination`, `Badge`, `Avatar`
- [ ] P1.7 Test per komponen (vitest + rtl)

## P2 — Login & Auth UI (butuh: M1)
- [ ] P2.1 Halaman `/login` client-portal + owner-console (form, submit ke M1.1 endpoint, simpan token cookie)
- [ ] P2.2 Redirect flow setelah login (kembali ke route asal)
- [ ] P2.3 Session expired → modal re-login / redirect
- [ ] P2.4 Logout button di app shell

## P3 — Client Portal Pages (butuh: M1, M2, P1)
> Ganti semua data hardcode dengan `useApi`. Pattern sama tiap page: fetch → DataTable/Form → toast.
- [ ] P3.1 `unified-inbox` — list conversation (SSE live), panel detail, send reply, assign, take over (butuh M4.4), resolve
- [ ] P3.2 `client-home` — dashboard metric real
- [ ] P3.3 `analytics` — 7 tab per spec (outcomes, sales, booking, AI quality, channel, agent, usage)
- [ ] P3.4 `payments` — list session, create checkout (butuh M3), status
- [ ] P3.5 `shipments` — list tracking, milestone refresh (butuh M3)
- [ ] P3.6 `team` — CRUD agent (butuh iam endpoint, perbaiki bila perlu)

## P4 — Client Portal Pages HILANG (butuh: M1, M2, P1)
> Per `03_UX_UI_SPECIFICATION.md`, route yang belum ada:
- [ ] P4.1 `Customer 360` — profil + riwayat (percakapan/pesanan/pembayaran/tiket)
- [ ] P4.2 `Lead Pipeline` (kanban) + `Lead Detail` (timeline, note, follow-up)
- [ ] P4.3 `Knowledge` — CRUD article, category, search, publish/draft (butuh M4.2 RAG)
- [ ] P4.4 `Bookings`/`Calendar` — pilih slot dari google-calendar (butuh M3)
- [ ] P4.5 `Commerce`/catalog — list produk, harga, link payment
- [ ] P4.6 `Settings` — tenant profile, billing, integration keys

## P5 — Owner Console Pages (butuh: M1, M2, P1)
- [ ] P5.1 `tenants` — list, provision, suspend, detail
- [ ] P5.2 `reliability` — SLO/SLI dashboard (butuh M6.5)
- [ ] P5.3 `audit` — immutable log viewer, filter
- [ ] P5.4 `automation/builder` — visual trigger/condition/action, validate, save (butuh automation endpoint)
- [ ] P5.5 `marketplace` + `webhooks` — register connector, set secret, test
- [ ] P5.6 `whitelabel` — branding config, custom domain, persist
- [ ] P5.7 `logistics` — shipment overview, exception queue
- [ ] P5.8 `AI Operations` — providers, models, routing, prompts, evaluations (butuh M4)
- [ ] P5.9 `Settings` — platform settings

## P6 — Backend Endpoint Lengkap (butuh: arsitektur M-series klarifikasi)
> Modul yang masih dangkal/anti-pattern. Pola: ikuti `iam.controller.ts` (RBAC + tenantScope).
- [ ] P6.1 `analytics` — tambah 6 endpoint (sales/booking/AI quality/channel/agent/usage) per `11_ANALYTICS_AND_KPI_DICTIONARY.md`
- [ ] P6.2 `ai-agent` — fix `@Query('tenantId')` → tenantContext, lengkapi endpoint
- [ ] P6.3 `sla` — enforcement timer + scheduler endpoint
- [ ] P6.4 `notification` — channel (email/WA/push), template render
- [ ] P6.5 `template` — CRUD + versioning
- [ ] P6.6 `contact-segment` — filter engine, dynamic segment
- [ ] P6.7 `campaign` — blast, schedule, report
- [ ] P6.8 `partner-ecosystem` — Partner API (saat ini ❌)

## P7 — Test, Seed, Docs (butuh: semua)
- [ ] P7.1 E2E Playwright: login→inbox→reply→resolve; payment; booking; AI flow
- [ ] P7.2 Contract test antar service
- [ ] P7.3 Seed data pilot (tenant, agent, knowledge, sample conversation)
- [ ] P7.4 Component test untuk P1
- [ ] P7.5 Multi-tenant isolation test suite penuh
- [ ] P7.6 Update `feature_audit_report.md` status tiap phase

---

# PENYAJIAN (Assembly & Integration)

> Setelah Menu Utama + Pelengkap bertemu. Agent kuat lead integrasi.

- [ ] S1 Integrasi frontend↔realtime↔worker end-to-end demo
- [ ] S2 Connector real activation di staging (Meta verify, Midtrans prod key, JNE)
- [ ] S3 Load test (100 agent, 1000 msg/min)
- [ ] S4 Chaos test (worker kill, DB failover, connector timeout)
- [ ] S5 Pentest eksternal + remediasi
- [ ] S6 Runbook lengkap per provider kill switch
- [ ] S7 Stage 1 pilot onboard + outcome metric 2 minggu
- [ ] S8 Stage gate sign-off → `docs/evidence/stage-1-signoff.md`
- [ ] S9 Production deploy (opentofu) + 72h soak
- [ ] S10 DR drill (backup/restore) + go/no-go → **GO LIVE**

---

# URUTAN EKSEKUSI

```
M1 ─┬─ M2 ─┬─ P1 (parallel)
    │      │
    │      └─ P2, P3, P4, P5 (frontend, setelah M1+M2+P1)
    │
    └─ P6 (backend lengkap, setelah M1 klarifikasi RBAC)

M3 ─── P3.4/P3.5/P4.4 (butuh konektor)
M4 ─── P4.3/P5.8 (butuh AI)
M5 ─── P3.1 (butuh realtime)
M6 ─── P5.2/P5.3 (butuh observability)

S1-S10 setelah Menu + Pelengkap bertemu
```

**Paralelisasi yang aman:** M3, M4, M5, M6 bisa jalan paralel (agent kuat banyak). P1 bisa mulai hari pertama. P2-P7 butuh fondasi M1+M2+P1.

---

# ESTIMASI

| Blok | Untuk | Estimasi (1 squad) |
|---|---|---|
| Menu Utama (M1-M6) | Agent kuat | 10-14 minggu |
| Pelengkap (P1-P7) | Agent lemah | 12-16 minggu (banyak paralel) |
| Penyajian (S1-S10) | Agent kuat lead | 4-6 minggu |
| **Total** | | **20-28 minggu** (kompresi ~30% bila paralel) |

Estimasi jujur: dari **38% → 100%**, bukan dari 58%.

---

# ATURAN UNTUK AGENT

**Agent kuat (Menu Utama):**
- Keputusan arsitektural boleh ambil, dokumentasikan di ADR
- Tidak boleh hack: RBAC wajib, tenant isolation wajib, idempotency wajib
- Tinggalkan 1 self-check (test) per task non-trivial
- Update `feature_audit_report.md` setelah selesai

**Agent lemah (Pelengkap):**
- IKUTI pola yang sudah ada (`iam.controller.ts`, `app-shell.tsx`, spec `03`)
- Jangan invent abstraksi baru — pakai `packages/ui` + `packages/api-client`
- Tiap page: fetch real (bukan hardcode), DataTable/Form dari P1, toast saat error
- Kalau bingung / pola tidak jelas → STOP, tanya, jangan menebak arsitektur
- Tinggalkan test per komponen/page

**Keduanya:** `pnpm lint && pnpm typecheck && pnpm test` wajib lulus sebelum tandai ✅. Tidak ada `git commit` tanpa instruksi eksplisit dari user.
