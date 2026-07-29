# Jalur F — Observability, QA, DevOps/SRE, Arsitektur

> Audit dimulai 2026-07-29 (lanjutan dari rencana `docs/plans/2026-07-27-rencana-audit-blueprint.md`).
> Dokumen dalam cakupan jalur ini: `02_SYSTEM_ARCHITECTURE.md` (437), `11_ANALYTICS_AND_KPI_DICTIONARY.md`
> (453), `12_QA_AND_TEST_STRATEGY.md` (456), `13_DEVOPS_SRE_AND_RUNBOOKS.md` (428).
>
> Jalur A (`10_SECURITY`, `05_DATA_MODEL`) sudah selesai di
> `docs/audit/2026-07-27/jalur-a-keamanan-tenancy.md` dan tidak dikerjakan ulang di sini;
> item lintas-jalur dirujuk, bukan diaudit ulang secara mendalam.
>
> Setiap REQ diverifikasi terhadap kode pada commit kerja saat ini (riwayat 19 commit,
> `git remote -v` nol keluaran). Dokumen internal (README, dokumen remediasi) **bukan bukti**.
> Aturan bukti: `TERPENUHI` hanya bila berkas dibuka **dan** kodenya terbukti terpanggil
> (call site atau tes yang menjalankannya); `HILANG` wajib disertai perintah pencarian nol hasil.
>
> **Konteks terverifikasi hari ini** yang dipakai (bukan temuan baru): PITR sudah ada dengan
> RPO = lag arsip WAL ~60s; baseline performa pertama ada di `docs/testing/2026-07-28-baseline-performa.md`
> (hanya 3 endpoint baca, target 1000 conversation belum teruji); CI di `.github/workflows/ci.yml`
> memuat lint/typecheck/build/test/verify:infra + 4 suite integrasi tetapi belum pernah dieksekusi
> runner (tanpa git remote); `pnpm run verify:infra` memvalidasi tiap config infra lewat consumer
> aslinya; healthcheck worker masih liveness-only (`pgrep`).

---

## Ringkasan Jalur F

### DOKUMEN 8/13 — 02_SYSTEM_ARCHITECTURE.md (437 baris)

| ID | Persyaratan | Kelas | Severity |
|---|---|---|---|
| REQ-02-001 | Mutasi menulis state bisnis + audit + outbox dalam satu transaksi | SEBAGIAN | MEDIUM |
| REQ-02-002 | Realtime gateway menerima notifikasi domain tersanitasi, bukan webhook mentah | TERPENUHI | - |
| REQ-02-003 | Channel edge: tidak ada panggilan AI di dalam siklus request | TERPENUHI | - |
| REQ-02-004 | Tidak ada impor repository lintas batas modul | TERPENUHI | - |
| REQ-02-005 | Provider adapter bergantung pada kontrak, bukan internal domain | TERPENUHI | - |
| REQ-02-006 | AI runtime tidak boleh mengimpor connector SDK | SEBAGIAN | MEDIUM |
| REQ-02-007 | Analytics tidak boleh memutasi tabel operasional | SEBAGIAN | LOW |
| REQ-02-008 | Web app memakai kontrak yang di-generate, bukan tipe database | TERPENUHI | - |
| REQ-02-009 | AI tidak pernah mengimpor/memanggil provider SDK | SEBAGIAN | LOW |
| REQ-02-010 | CI wajib menolak impor terlarang | TERPENUHI | - |
| REQ-02-011 | Idempotency wajib untuk ingest webhook/kirim keluar/dll + struktur record | SEBAGIAN | MEDIUM |
| REQ-02-012 | RLS di semua tabel bertenant; role runtime tak bisa bypass | TERPENUHI | - |
| REQ-02-013 | Setiap query vektor menyertakan predikat tenant; versi embedding eksplisit | TIDAK-TERVERIFIKASI | MEDIUM |
| REQ-02-014 | Managed PostgreSQL dengan point-in-time recovery | TERPENUHI | - |
| REQ-02-015 | Production baseline: ≥2 replika, autoscale, HA, secret manager/KMS | TIDAK-TERVERIFIKASI | MEDIUM |
| REQ-02-016 | Community WhatsApp Gateway sebagai zona deployment terpisah | HILANG | LOW |
| REQ-02-017 | Anggaran performa (7 target p95) | SEBAGIAN | MEDIUM |
| REQ-02-018 | Tes integrasi isolasi tenant lulus | TIDAK-TERVERIFIKASI | HIGH |
| REQ-02-019 | Setiap mutasi menghasilkan keputusan audit | SEBAGIAN | MEDIUM |
| REQ-02-020 | Tidak ada provider SDK bocor ke modul domain | TERPENUHI | - |
| REQ-02-021 | Queue overload punya tes backpressure | HILANG | MEDIUM |
| REQ-02-022 | Backup restore dan failover dilatih sebelum production-ready | SEBAGIAN | MEDIUM |
| REQ-02-023 | Sertifikasi provider payment/shipment + kill switch + runbook teruji | TIDAK-TERVERIFIKASI | HIGH |

---

### REQ-02-001 - Mutasi menulis state bisnis + audit + outbox dalam satu transaksi - SEBAGIAN - MEDIUM

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §3.3`, §7.1): "Mutations write business state + audit + outbox in one transaction." + §7.1 mencantumkan `audit event associated with mutation` sebagai bagian dari satu transaksi PostgreSQL.

**Kondisi nyata**: Pola commit atomik state+outbox ada pada jalur konkret (mis. `sendMessage`, ingest webhook). Namun cakupan "audit event" pada setiap mutasi tidak seragam: `AuditMiddleware` yang dirancang untuk audit otomatis **tidak ter-wire** (Jalur A REQ-10-021 = HILANG, `apps/api/src/middleware/audit.middleware.ts` nol call site). Verifikasi mendalam transaksi outbox milik Jalur B; dari sudut arsitektur, klaim "setiap mutasi + audit + outbox satu transaksi" hanya sebagian terbukti.

**Bukti**:
- Lintas-jalur: Jalur A `docs/audit/2026-07-27/jalur-a-keamanan-tenancy.md` (REQ-10-021 HILANG — audit otomatis tak ter-wire).
- `apps/api/src/modules/channels/channels.controller.ts:96-104` — ingest → publish tanpa penulisan audit eksplisit di path ini.

**Yang kurang**: Bukti (tes) bahwa setiap mutasi bisnis menulis baris audit dalam transaksi yang sama; saat ini audit otomatis tak aktif.

---

### REQ-02-002 - Realtime gateway menerima notifikasi domain tersanitasi, bukan webhook mentah - TERPENUHI

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §3.4`): "Receives sanitized domain notifications, never raw provider webhook."

**Kondisi nyata**: `RealtimePublisher.publishConversationChange` membangun `ConversationEvent` domain dengan payload berbentuk field domain (id, status, mode, provider, version, contactId, lastMessageAt) — bukan envelope webhook provider mentah — lalu `realtimeBus.publish(tenantId, event)`. Publisher ini dipanggil dari jalur ingest webhook (`channels.controller.ts:96`).

**Bukti**:
- `apps/api/src/modules/channels/realtime-publisher.ts:9-40` — payload domain tersanitasi, bukan raw webhook.
- `apps/api/src/modules/channels/channels.controller.ts:96-101` — call site: dipanggil setelah `repository.ingest`.

---

### REQ-02-003 - Channel edge: tidak ada panggilan AI di dalam siklus request - TERPENUHI

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §3.5`): "No AI calls inside request lifecycle."

**Kondisi nyata**: `ChannelsController.ingestWebhook` melakukan: pilih adapter → verifikasi signature → `normalizeWebhook` → `repository.ingest(event)` (dedup inbox lewat `result.duplicate`) → publish realtime → `return { accepted }`. Tidak ada pemanggilan AI. Pencarian pemanggilan AI di seluruh modul channel menghasilkan nol.

**Bukti**:
- `apps/api/src/modules/channels/channels.controller.ts:49-106` — jalur webhook, tanpa AI.
- Perintah: `grep -r 'ai-gateway|aiGateway|generateCompletion|invokeAgent|@chai/connectors/mock-ai|runAgent' apps/api/src/modules/channels` → **0 hasil**.

---

### REQ-02-004 - Tidak ada impor repository lintas batas modul - TERPENUHI

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §5.1/§5.3`): "Module may read another module only through application service/query interface." / "No repository imports across module boundaries."

**Kondisi nyata**: `eslint.config.mjs` mendefinisikan zona `no-restricted-imports` untuk `apps/api/src/modules/**` yang menolak `../*/*.repository` (kecuali `modules/shared`), dan tes `tests/import-boundary.test.ts` **membuktikan aturan menggigit** (kasus "rejects a module importing another module's repository") sekaligus **membuktikan workspace bersih** (kasus "keeps the whole workspace free of boundary violations"). Aturan ini dijalankan `pnpm run lint` (`eslint .`) dan tes ini dijalankan `pnpm run test` (`vitest run tests`).

**Bukti**:
- `eslint.config.mjs` — zona modul (grup `../*/*.repository`, pesan "Depend on a port in modules/shared").
- `tests/import-boundary.test.ts` — probe + gerbang workspace.
- Perintah: `pnpm exec vitest run tests/import-boundary.test.ts` → **7 passed** (32.14s), termasuk "rejects a module importing another module's repository" dan "keeps the whole workspace free of boundary violations". `BOUNDARY_EXIT=0`.

---

### REQ-02-005 - Provider adapter bergantung pada kontrak, bukan internal domain - TERPENUHI

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §5.4`): "Provider adapters depend on contracts, not domain internals."

**Kondisi nyata**: Zona `packages/connectors/**` di `eslint.config.mjs` menolak impor `@chai/domain` (dan `@chai/database`/`postgres`/`pg`). Tes boundary membuktikan aturan menggigit (kasus "rejects a connector importing the database") dan gerbang workspace membuktikan `packages/connectors/src/**` bersih.

**Bukti**:
- `eslint.config.mjs` — zona connectors: grup `@chai/domain` pesan "the dependency runs the other way"; grup `@chai/database` pesan "must not touch the database".
- `pnpm exec vitest run tests/import-boundary.test.ts` → 7 passed, kasus "rejects a connector importing the database" hijau; gerbang workspace melint `packages/connectors/src/**/*.ts`.

---

### REQ-02-006 - AI runtime tidak boleh mengimpor connector SDK - SEBAGIAN - MEDIUM

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §5.5`): "AI runtime cannot import connector SDK."

**Kondisi nyata**: Lapisan **keputusan** kebijakan terjaga: zona `packages/domain/src/ai-policy/**` menolak `@chai/connectors` (ADR-011), dan tes boundary membuktikannya menggigit (kasus "rejects the policy engine importing a connector"). Namun lapisan **eksekusi AI runtime** `services/ai-gateway/**` **tidak dicakup zona eslint mana pun**; saat ini ia mengimpor `@chai/connectors/mock-ai`. Tidak ada guard lint yang mencegah `services/ai-gateway` atau `workers/*` mengimpor connector efek-samping (payment/logistics/calendar).

**Bukti**:
- `eslint.config.mjs` — hanya `packages/domain/src/ai-policy/**` yang dizonasi terhadap `@chai/connectors`; tidak ada entri untuk `services/ai-gateway/**`.
- `services/ai-gateway/src/index.ts:7`, `prompt-context.ts:18`, `rag.ts:3` — impor `@chai/connectors/mock-ai`.
- Perintah: `grep 'from .@chai/connectors' services/ai-gateway` → hanya subpath `/mock-ai` (adapter model), bukan connector efek-samping.

**Yang kurang**: Zona `no-restricted-imports` untuk `services/ai-gateway/**` (dan `workers/ai-worker`) yang melarang impor connector efek-samping/provider SDK, agar §5.5 ditegakkan pada AI runtime, bukan hanya lapisan policy.

---

### REQ-02-007 - Analytics tidak boleh memutasi tabel operasional - SEBAGIAN - LOW

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §5.6`): "Analytics cannot mutate operational tables."

**Kondisi nyata**: Zona eslint untuk `apps/api/src/modules/analytics/**`, `advanced-analytics/**`, dan `packages/domain/src/analytics/**` menolak impor repository operasional (`**/modules/*/*.repository`), ditegakkan `eslint .` dan gerbang workspace melint `packages/domain/src/**`. Namun aturan itu hanya memblok impor repository sibling; ia **tidak** memblok analytics mengimpor `@chai/database` langsung dan menulis. Pencegahan mutasi sesungguhnya bertumpu pada RLS + pemisahan read-model (lintas-jalur A), bukan pada guard impor.

**Bukti**:
- `eslint.config.mjs` — zona analytics: grup `**/modules/*/*.repository`, pesan "Analytics must read its own projections".
- Zona tersebut tidak menyertakan `@chai/database` dalam daftar terlarang → impor DB langsung tidak tertangkap lint.

**Yang kurang**: Guard yang melarang lapisan analytics mengimpor `@chai/database`/repository tulis, atau bukti (tes) bahwa analytics hanya membaca proyeksi.

---

### REQ-02-008 - Web app memakai kontrak yang di-generate, bukan tipe database - TERPENUHI

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §5.8`): "Web apps consume generated contracts, not database types."

**Kondisi nyata**: Zona `apps/client-portal/src/**` dan `apps/owner-console/src/**` menolak impor `@chai/database`, `@chai/domain`, `postgres`, `pg`. Tes boundary membuktikan aturan menggigit (kasus "rejects frontend code importing a server-only package") dan gerbang workspace melint kedua app frontend.

**Bukti**:
- `eslint.config.mjs` — zona frontend: pesan "Frontend code must reach the backend over HTTP".
- `pnpm exec vitest run tests/import-boundary.test.ts` → 7 passed, kasus frontend hijau; gerbang workspace melint `apps/client-portal/src/**` + `apps/owner-console/src/**`.

---

### REQ-02-009 - AI tidak pernah mengimpor/memanggil provider SDK - SEBAGIAN - LOW

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §5.10`): "AI never imports or invokes provider SDKs."

**Kondisi nyata**: `packages/domain/src` tidak mengimpor provider SDK atau `@chai/connectors` sama sekali, dan tidak ada provider SDK nyata sebagai dependency di repo (semua connector provider-neutral/mock). Namun sama seperti REQ-02-006, lapisan `services/ai-gateway` tidak dizonasi lint, sehingga larangan ini tidak ditegakkan pada AI runtime — hanya benar secara faktual saat ini.

**Bukti**:
- Perintah: `grep "from '(stripe|googleapis|@google-cloud|midtrans|xendit|twilio|axios|node-fetch|@chai/connectors)'" packages/domain/src` → **0 hasil**.
- Perintah: `grep '"(stripe|googleapis|@google-cloud/*|midtrans-client|xendit-node|twilio|@sendgrid)"' **/package.json` → **0 hasil** (tak ada provider SDK sebagai dependency).

**Yang kurang**: Guard impor pada AI runtime (`services/ai-gateway`) untuk menegakkan larangan, bukan sekadar keadaan bersih saat ini.

---

### REQ-02-010 - CI wajib menolak impor terlarang - TERPENUHI

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §5` baris akhir): "CI must reject forbidden imports."

**Kondisi nyata**: `.github/workflows/ci.yml` menjalankan `pnpm run lint` sebagai langkah **blocking** paling awal; `lint` = `eslint . && turbo run lint`, dan `eslint .` menjalankan seluruh zona boundary. Tes `tests/import-boundary.test.ts` membuktikan bahwa `eslint` benar-benar menolak pelanggaran (bukan sekadar tercatat). Mekanisme penolakan terbukti berjalan lokal.

**Bukti**:
- `.github/workflows/ci.yml` — langkah `- run: pnpm run lint` (blocking, sebelum suite lambat).
- `package.json` — `"lint": "eslint . && turbo run lint"`.
- `pnpm exec vitest run tests/import-boundary.test.ts` → 7 passed (aturan menggigit + workspace bersih).

**Catatan**: CI **belum pernah dieksekusi runner** karena repo tanpa git remote (`git remote -v` → nol; K-01). Jadi "CI menolak" terbukti pada level mekanisme (lint + tes lokal), bukan lewat run CI nyata. Lihat temuan K-01 di dokumen 13.

---

### REQ-02-011 - Idempotency wajib untuk ingest webhook/kirim keluar/dll + struktur record - SEBAGIAN - MEDIUM

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §7.3`): "Required for: provider webhook ingestion; outbound send; ... Idempotency record contains tenant, operation, key, request hash, status, response reference, and expiry."

**Kondisi nyata**: Ingest webhook memakai dedup inbox (`result.duplicate` di `channels.controller.ts:90`) dan `sendMessage` menolak tanpa `Idempotency-Key` (`channels.controller.ts:135-140`, plus interceptor global). Cakupan penuh daftar §7.3 (payment request/link/refund/reconcile, shipment import/label, invoice, appointment, export) dan verifikasi bentuk record idempotency (tenant/operation/key/hash/status/response-ref/expiry) adalah teritori Jalur B/C.

**Bukti**:
- `apps/api/src/modules/channels/channels.controller.ts:90` (dedup inbox), `:135-140` (`IDEMPOTENCY_KEY_REQUIRED`).
- Lintas-jalur: verifikasi penuh di Jalur B (`06_API`/`07_EVENTS`) dan Jalur C (`17_PAYMENT`).

**Yang kurang**: Bukti idempotency untuk seluruh operasi §7.3 dan struktur record lengkap — diserahkan ke Jalur B/C.

---

### REQ-02-012 - RLS di semua tabel bertenant; role runtime tak bisa bypass - TERPENUHI

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §8.1`): "RLS on all tenant business tables. Runtime role cannot own tables or bypass RLS."

**Kondisi nyata**: Diverifikasi penuh oleh Jalur A (RLS default-deny + FORCE, role runtime `NOBYPASSRLS`) sebagai `TERPENUHI` (REQ-10-008, REQ-10-009). Suite isolasi tenant ada (`packages/domain/src/tenant-isolation/suite.test.ts`, `tests/security/tenant-isolation.spec.ts`, `tests/e2e/multi-tenant-isolation.spec.ts`) dan digerbangkan di CI.

**Bukti**:
- Lintas-jalur: `docs/audit/2026-07-27/jalur-a-keamanan-tenancy.md` REQ-10-008/009 (TERPENUHI, dengan path:baris migrasi RLS FORCE).
- `.github/workflows/ci.yml` — `pnpm --filter @chai/database run test:integration` (matriks isolasi tenant tingkat DB).

**Catatan**: "Lulus" pada runner belum pernah terjadi (K-01/K-02); lihat REQ-02-018.

---

### REQ-02-013 - Setiap query vektor menyertakan predikat tenant; versi embedding eksplisit - TIDAK-TERVERIFIKASI - MEDIUM

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §8.4`): "PostgreSQL full-text + pgvector at MVP. Every query must include tenant predicate before/with vector search. Embedding version is explicit."

**Kondisi nyata**: Retrieval knowledge belum hybrid dengan pgvector (K-08, teritori Jalur D). Verifikasi predikat tenant pada query vektor dan eksplisitas versi embedding memerlukan penelusuran modul knowledge/RAG yang menjadi cakupan Jalur D.

**Bukti**: Diserahkan ke Jalur D (`08_AI_AGENT_AND_KNOWLEDGE`). K-08 (dokumen remediasi) mencatat retrieval belum pgvector — bukan bukti, tetapi menandai area yang belum matang.

**Yang dibutuhkan untuk memutuskan**: Audit modul knowledge/RAG (Jalur D): apakah pgvector dipakai, apakah setiap query menyertakan `tenant_id`, apakah kolom versi embedding ada.

---

### REQ-02-014 - Managed PostgreSQL dengan point-in-time recovery - TERPENUHI

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §9.2`): "Managed PostgreSQL HA with point-in-time recovery."

**Kondisi nyata**: `infra/production/postgres.conf` mengaktifkan continuous WAL archiving: `wal_level = replica`, `archive_mode = on`, `archive_command = 'test ! -f /wal_archive/%f && cp %p /wal_archive/%f'` (idempoten), `archive_timeout = 60s` (membatasi RPO ke lag arsip ~60s, bukan interval dump 1 jam). Service `postgres-wal-init` menyiapkan volume arsip WAL sebelum postgres start. Config divalidasi lewat consumer aslinya oleh `verify:infra`.

**Bukti**:
- `infra/production/postgres.conf` — blok "Continuous archiving for point-in-time recovery (K-04)": `wal_level=replica`, `archive_mode=on`, `archive_command=...`, `archive_timeout=60s`.
- `infra/production/docker-compose.yml:29-34` — service `postgres-wal-init` (chown/chmod `/wal_archive`).
- Perintah: `pnpm run verify:infra` → `OK postgres.conf (production)`, `8/8 config valid`, `VERIFY_INFRA_EXIT=0`.

**Catatan**: Ini mengoreksi K-04 (yang menyebut "RPO ≈ 1 jam, tanpa WAL archiving/PITR") — PITR kini terpasang, RPO ≈ 60s. Aspek "HA" multi-node dan restore ber-timing nyata belum dilatih (REQ-02-022).

---

### REQ-02-015 - Production baseline: >=2 replika, autoscale, HA, secret manager/KMS - TIDAK-TERVERIFIKASI - MEDIUM

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §9.2`): "Minimum two API replicas across failure domains. Minimum two webhook edge replicas. Workers autoscale by queue depth/lag. Managed PostgreSQL HA ... Managed Redis HA. ... Secret manager and KMS. ... OpenTelemetry collector. CDN ..."

**Kondisi nyata**: Compose produksi mendefinisikan beberapa service dan baseline mengukur "3 replika API, 2 realtime-gateway" pada satu node Docker. Namun "across failure domains", autoscale-by-queue-depth, HA multi-node PostgreSQL/Redis, dan integrasi secret-manager/KMS/CDN adalah properti runtime yang hanya bisa dibuktikan pada deployment sungguhan; stack penuh belum pernah dijalankan di lingkungan multi-domain (K-02).

**Bukti**: Memerlukan lingkungan deploy nyata; tak bisa diputuskan statis. `docs/testing/2026-07-28-baseline-performa.md` menyebut single-node Docker Desktop.

**Yang dibutuhkan untuk memutuskan**: Deployment produksi/staging multi-node dengan pengujian failover dan autoscale.

---

### REQ-02-016 - Community WhatsApp Gateway sebagai zona deployment terpisah - HILANG - LOW

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §9.3`): "Separate deployment group ... No public management API. Per-session resource quota. Session storage encrypted outside application database. Failure cannot crash Core API ..."

**Kondisi nyata**: Tidak ada implementasi kode community gateway; hanya roadmap (`docs/plans/2026-07-26-community-gateway-roadmap.md`). Status `REAUTH_REQUIRED` (§12 Failure Handling) juga tak ada di kode.

**Bukti**:
- Perintah: `grep 'REAUTH_REQUIRED|community.*gateway|whatsapp.*community|session.*encrypt' *.ts` (seluruh repo) → **0 hasil di kode** (hanya berkas `.md`: blueprint + roadmap).

**Yang kurang**: Seluruh komponen community gateway. Fitur ini terdefer secara eksplisit (roadmap), sehingga severity LOW.

---

### REQ-02-017 - Anggaran performa (7 target p95) - SEBAGIAN - MEDIUM

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §11`): 7 anggaran p95 — webhook verify+persist 500 ms, read conversation list 600 ms, open conversation 800 ms, mutation ack 800 ms, realtime notify 1 s, queue claim 2 s, dashboard cached 1.5 s.

**Kondisi nyata**: Baseline pertama (`docs/testing/2026-07-28-baseline-performa.md`, 2026-07-28) mengukur **hanya 3 endpoint baca** pada stack staging (image produksi): `GET /health` p95 278 ms, `GET conversations` p95 291 ms, `GET leads` p95 159 ms — semua dalam anggaran. Namun 5 dari 7 jalur anggaran (webhook verify+persist, open conversation tunggal, mutation ack, realtime notify after commit, queue claim) **belum diukur**, dan target skala 1000 conversation belum teruji. Suite `tests/performance/*` tak bisa mengukur staging karena header `x-test-subject` hanya dihormati saat `APP_ENV=local/test` (`apps/api/src/auth/local-identity.ts`), sehingga request 401 di staging.

**Bukti**:
- `docs/testing/2026-07-28-baseline-performa.md` — tabel hasil 3 endpoint; catatan suite lama tak bisa ukur staging.
- `tests/load/s3-load-test.test.ts` — mengukur throughput event-chain **in-process** (`createEventChainProcessor` + store in-memory), bukan p95 sistem nyata melalui HTTP/queue.

**Yang kurang**: Pengukuran p95 untuk webhook persist, open conversation, mutation ack, realtime notify after commit, queue claim; dan uji skala 1000 conversation.

---

### REQ-02-018 - Tes integrasi isolasi tenant lulus - TIDAK-TERVERIFIKASI - HIGH

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §13`): "Tenant isolation integration test passes."

**Kondisi nyata**: Suite isolasi tenant tingkat DB ada dan digerbangkan di CI (`pnpm --filter @chai/database run test:integration`, plus `packages/domain/src/tenant-isolation/suite.test.ts`). Logika RLS diverifikasi Jalur A (TERPENUHI). Namun "lulus" memerlukan runtime testcontainers (Docker); di sesi audit read-only ini tes tidak dijalankan, dan CI belum pernah dieksekusi runner (K-01/K-02).

**Bukti**:
- `packages/domain/src/tenant-isolation/suite.test.ts`, `tests/security/tenant-isolation.spec.ts`, `tests/e2e/multi-tenant-isolation.spec.ts` — ada.
- `.github/workflows/ci.yml` — 4 suite integrasi digerbangkan, belum pernah dijalankan (K-01).

**Yang dibutuhkan untuk memutuskan**: Jalankan suite integrasi di lingkungan ber-Docker (`pnpm --filter @chai/database run test:integration`) dan catat hasilnya. Severity HIGH karena menyentuh isolasi tenant (release-blocking bila gagal).

---

### REQ-02-019 - Setiap mutasi menghasilkan keputusan audit - SEBAGIAN - MEDIUM

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §13`): "All mutations generate audit decision."

**Kondisi nyata**: Sama dengan REQ-02-001: audit otomatis (`AuditMiddleware`) tak ter-wire (Jalur A REQ-10-021 HILANG). Sebagian mutasi menulis audit lewat jalurnya sendiri, tetapi tidak ada gerbang yang memastikan **setiap** mutasi menghasilkan keputusan audit.

**Bukti**: Lintas-jalur Jalur A REQ-10-021 (HILANG, `apps/api/src/middleware/audit.middleware.ts` nol call site).

**Yang kurang**: Wiring audit otomatis atau tes yang menegakkan audit-per-mutasi.

---

### REQ-02-020 - Tidak ada provider SDK bocor ke modul domain - TERPENUHI

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §13`): "No provider SDK leaks into domain modules."

**Kondisi nyata**: `packages/domain/src` tidak mengimpor provider SDK atau `@chai/connectors` (grep 0), dan tidak ada provider SDK sebagai dependency di seluruh repo (grep 0). Zona connectors juga memblok arah sebaliknya (connectors → domain), yang diuji `tests/import-boundary.test.ts`.

**Bukti**:
- Perintah: `grep "from '(stripe|googleapis|@google-cloud|midtrans|xendit|twilio|axios|node-fetch|@chai/connectors)'" packages/domain/src` → **0 hasil**.
- Perintah: `grep provider-SDK **/package.json` → **0 hasil**.
- `tests/import-boundary.test.ts` → 7 passed (arah connectors→domain terblok).

**Catatan**: Keadaan bersih ini sebagian karena belum ada provider SDK nyata di repo (semua connector mock). Guard lint untuk mempertahankannya di `services/ai-gateway`/domain broad belum ada (lihat REQ-02-006/009), tetapi persyaratan keadaan saat ini terpenuhi.

---

### REQ-02-021 - Queue overload punya tes backpressure - HILANG - MEDIUM

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §13`): "Queue overload has backpressure test."

**Kondisi nyata**: Tidak ada tes yang menegakkan backpressure/pemadaman beban saat queue kelebihan. `tests/load/s3-load-test.test.ts` mengukur throughput (1000 msg/min, 500 konkuren, latency < 3s) terhadap fungsi in-process, bukan penolakan/backpressure di bawah overload. `tests/chaos/s4-chaos-test.test.ts` menguji propagasi kegagalan (DB/realtime/inbox down, worker kill), bukan overload queue.

**Bukti**:
- Perintah: `grep 'backpressure|back-pressure|overload|queue.?depth.*test|maxDepth.*reject' **/*.ts` → hanya `packages/api-client/src/sse-client.ts` (backpressure sisi klien SSE) dan komentar `packages/database/src/migrator.ts` — **tidak ada tes backpressure queue**.
- `tests/load/s3-load-test.test.ts` — throughput, bukan backpressure; store in-memory.

**Yang kurang**: Tes yang menyaturasi queue melampaui kapasitas dan menegaskan backpressure (penolakan/antrean terbatas/pemadaman), sesuai gerbang §13.

---

### REQ-02-022 - Backup restore dan failover dilatih sebelum production-ready - SEBAGIAN - MEDIUM

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §13`): "Backup restore and failover are exercised before production-ready status."

**Kondisi nyata**: `scripts/pilot/backup-restore-drill.mjs` adalah **runner checklist**: keempat langkah (`pg-dump`, `restore-fresh`, `rpo-rto`, `redis-loss`) berstatus `DOCUMENTED` dan skrip hanya menulis JSON bukti; catatan eksplisit "Full timed restore is an ops exercise against staging". Restore ber-timing nyata dan failover belum dieksekusi. PITR (config WAL) ada (REQ-02-014) tetapi belum diuji pemulihannya.

**Bukti**:
- `scripts/pilot/backup-restore-drill.mjs:12-45` — langkah berstatus `DOCUMENTED`; `note: "... Full timed restore is an ops exercise against staging."`

**Yang kurang**: Eksekusi nyata restore dari backup (dan replay WAL untuk membuktikan RPO ~60s) plus latihan failover, dengan hasil ber-timing tercatat.

---

### REQ-02-023 - Sertifikasi provider payment/shipment + kill switch + runbook teruji - TIDAK-TERVERIFIKASI - HIGH

**Persyaratan** (`02_SYSTEM_ARCHITECTURE §13`): "Payment and shipment providers pass signed-webhook, idempotency, unknown-result, reconciliation, and tenant-isolation certification. Payment/Logistics production rollout has provider-specific kill switches, SLO exclusions, and tested runbooks."

**Kondisi nyata**: Sertifikasi provider payment/logistics (signed-webhook, idempotency, unknown-result → UNKNOWN, reconciliation, isolasi tenant) dan kill switch adalah teritori Jalur C (`17_PAYMENT_AND_LOGISTICS_SPEC`). Dari sudut arsitektur, gerbang ini tidak bisa diputuskan tanpa audit Jalur C.

**Bukti**: Diserahkan ke Jalur C. "Runbook teruji" juga bergantung pada eksekusi runbook nyata (lihat dokumen 13).

**Yang dibutuhkan untuk memutuskan**: Audit Jalur C untuk sertifikasi provider + verifikasi kill switch, dan bukti eksekusi runbook payment/logistics.

---

#### Self-check DOKUMEN 8/13 (02_SYSTEM_ARCHITECTURE)

1. **Dibaca penuh?** Ya, baris 1–437 (dua baca 1–220, 220–437). Tidak ada bagian dilewati. §10 (Scaling) dan §12 (Failure Handling) dibaca; item normatifnya yang paling relevan diserap ke REQ terkait (queue partition → REQ-02-011/021 area; failure handling → REQ lintas-jalur B/C), sisanya prosa aspiratif fase.
2. **REQ dihasilkan:** 23. TERPENUHI 9 · SEBAGIAN 8 · HILANG 2 · BERTENTANGAN 0 · TIDAK-TERVERIFIKASI 4.
3. **Tiap TERPENUHI punya path:baris + bukti terpanggil?** Ya — boundary (tes dijalankan, 7 passed), realtime/channel (call site controller), RLS (Jalur A + CI gate), PITR (verify:infra dijalankan).
4. **Tiap HILANG punya perintah nol hasil?** Ya — REQ-02-016 (grep community gateway = 0 di kode), REQ-02-021 (grep backpressure = 0 tes).
5. **Di-append ke berkas?** Ya, `docs/audit/2026-07-29/jalur-f-operasional.md`.
6. **git status --porcelain hanya docs/audit/?** Diverifikasi di akhir sesi.
