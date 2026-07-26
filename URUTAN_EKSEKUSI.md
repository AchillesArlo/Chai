# Urutan Eksekusi — Chai Omnichannel AI Platform

Dokumen ini berisi struktur 14 tahap eksekusi proyek berdasarkan alokasi agent (Agent Kuat vs Agent Lemah) dan ketergantungan antar modul.

---

## Ringkasan Klasifikasi Agent

- **Langkah 1–8 (M1–M6, P1, P2):** Fondasi Inti (Butuh **Agent Kuat** — Arsitektur & Keamanan).
- **Langkah 9–13 (P3–P7):** Finishing & Repetitive (Dikerjakan **Agent Lemah** — UI Pages & CRUD Endpoint).
- **Langkah 14 (S1–S10):** Integrasi & Go-Live (Dicomandokan **Agent Kuat Lead**).

---

## 14 Tahap Urutan Eksekusi

### 1. M1 — Fondasi Auth & Session (Gerbang Utama)
> **Agent:** Kuat (Lead) | **Butuh:** —
- Endpoint login `POST /api/auth/login` (owner) & `POST /api/client/v1/auth/login`.
- Token verification middleware di Fastify & inject `request.principal` + `tenantContext`.
- Next.js middleware enforcement di Client Portal & Owner Console.
- Endpoint refresh/logout token.
- RBAC fix global: Hapus `@Query('tenantId')`, wajib via `tenantContext`.
- Session provider React (`useSession()`) di `packages/auth`.

### 2. M2 — API Client & Realtime Foundation
> **Agent:** Kuat | **Butuh:** M1
- `packages/api-client`: Typed fetch, auto-inject token+tenantId, error envelope, retry.
- React Query / SWR setup & cache strategy.
- SSE hook (`useInboxStream`) untuk `realtime-gateway`.
- Global error/toast/loading/empty-state plumbing.

### 3. M3 — Connector Activation & Provider Wiring
> **Agent:** Kuat | **Butuh:** M1
- Env-based adapter factory (`PROVIDER_PAYMENT`, `PROVIDER_CHANNEL`, `PROVIDER_LOGISTICS`).
- Wiring connector real: `payments` (Midtrans), `channels` (WhatsApp Meta), `logistics` (JNE), `calendar` (Google Calendar).
- Webhook route & signature verification.
- Kill switch runtime (env + DB flag + owner toggle).
- Conformance test suite untuk connector real.

### 4. M4 — AI Gateway Real LLM + RAG + Tool
> **Agent:** Kuat | **Butuh:** M1
- Real LLM adapter (OpenAI & Anthropic, streaming & non-streaming).
- RAG pipeline: `pgvector` atas `knowledge` table + citation grounding.
- Tool execution engine dengan allowlist & policy tenant.
- Conversation mode state machine: `AI_ACTIVE` ↔ `HUMAN_ACTIVE` ↔ `PAUSED`.
- Guardrails: PII redaction, output toxicity filter, confidence threshold.
- Token & cost accounting per tenant (`usage` table).
- Golden dataset Q&A regression test.

### 5. M5 — Realtime & Worker Event Chain
> **Agent:** Kuat | **Butuh:** M2
- Chain end-to-end: Webhook → Outbox → Realtime Gateway → SSE → Inbox (<3s).
- Outbox dispatcher at-least-once + idempotent consumer.
- Auto-assignment inbox (round-robin / skill).
- Temporal workflows: follow-up, payment reconciliation, shipment milestone.
- Dead-letter queue (DLQ) & retry dashboard.

### 6. M6 — Security, RBAC, Observability Core
> **Agent:** Kuat | **Butuh:** M1
- Audit RBAC semua endpoint (role check & negative test).
- Tenant isolation certification (RLS audit & test suite).
- PII redaction pipeline (audit log & LLM input).
- Retention job & audit immutability verification.
- OpenTelemetry instrumentation (API → Worker → Connector).
- Secret management (Vault / KMS) & SAST/DAST scan.

### 7. P1 — Komponen UI Library
> **Agent:** Lemah / Paralel | **Butuh:** —
- Komponen dasar di `packages/ui`: `DataTable`, `Form` + Validation, `Modal`/`Dialog`, `Chart`, `Toast`, `Tabs`, `Dropdown`, `Badge`, `Avatar`.
- Unit test per komponen (Vitest + RTL).

### 8. P2 — Login & Auth UI
> **Agent:** Lemah | **Butuh:** M1, P1
- Halaman `/login` Client Portal & Owner Console.
- Flow redirect setelah login.
- Modal re-login saat session expired.
- Button Logout pada App Shell.

### 9. P3 — Client Portal Pages
> **Agent:** Lemah | **Butuh:** M1, M2, P1
- Connect data real via `useApi` pada: `unified-inbox`, `client-home`, `analytics` (7 tab), `payments`, `shipments`, `team`.

### 10. P4 — Client Portal Pages HILANG
> **Agent:** Lemah | **Butuh:** M1, M2, P1
- Implementasi halaman baru: `Customer 360`, `Lead Pipeline`, `Knowledge` (RAG interface), `Bookings`/`Calendar`, `Commerce`/catalog, `Settings`.

### 11. P5 — Owner Console Pages
> **Agent:** Lemah | **Butuh:** M1, M2, P1
- Halaman manajemen owner: `tenants`, `reliability`, `audit` log viewer, `automation/builder`, `marketplace` + `webhooks`, `whitelabel`, `logistics`, `AI Operations`, `Settings`.

### 12. P6 — Backend Endpoint Lengkap
> **Agent:** Lemah | **Butuh:** M1 (Klarifikasi RBAC)
- Melengkapi endpoint backend: `analytics` (6 endpoint tambahan), `ai-agent` (fix `@Query`), `sla` timer, `notification`, `template`, `contact-segment`, `campaign`, `partner-ecosystem`.

### 13. P7 — Test, Seed, Docs
> **Agent:** Lemah / Paralel | **Butuh:** P1-P6
- E2E Playwright testing (Login → Inbox → Reply → Payment → Booking → AI Flow).
- Contract testing antar service.
- Seed data pilot.
- Component testing & Multi-tenant isolation test suite.
- Update `feature_audit_report.md`.

### 14. S1-S10 — Assembly & Go-Live
> **Agent:** Kuat Lead | **Butuh:** Seluruh M-Series & P-Series
- **S1:** Integrasi E2E Frontend ↔ Realtime ↔ Worker.
- **S2:** Connector real activation di Staging (Meta, Midtrans, JNE).
- **S3:** Load test (100 agent, 1000 msg/min).
- **S4:** Chaos test (worker kill, DB failover, timeout).
- **S5:** Pentest eksternal & remediasi.
- **S6:** Runbook provider kill switch.
- **S7:** Pilot onboard (Stage 1) & outcome metric 2 minggu.
- **S8:** Stage gate sign-off (`docs/evidence/stage-1-signoff.md`).
- **S9:** Production deploy (OpenTofu) + 72 jam soak test.
- **S10:** DR drill (backup & restore) + Go/No-Go → **GO LIVE**.

---

## Visualisasi Dependensi Eksekusi

```
M1 ─┬─ M2 ─┬─ P1 (paralel sejak awal)
    │      │
    │      └─ P2, P3, P4, P5 (frontend, setelah M1 + M2 + P1)
    │
    └─ P6 (backend lengkap, setelah M1)

M3 ─── P3.4 / P3.5 / P4.4 (butuh konektor)
M4 ─── P4.3 / P5.8 (butuh AI)
M5 ─── P3.1 (butuh realtime)
M6 ─── P5.2 / P5.3 (butuh observability)

S1-S10 ─── Menunggu seluruh Menu Utama (M) dan Pelengkap (P) selesai
```
