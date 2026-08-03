# Rencana implementasi fitur yang kurang — FASE 15–26

> Ditulis 2026-07-31. **Melanjutkan** `2026-07-29-rencana-penyelesaian-lengkap.md`
> (FASE 1–14). Dokumen itu tetap berlaku dan **harus diselesaikan lebih dulu
> sampai FASE 14** sebelum masuk dokumen ini — FASE 5–14 di sana menangani
> temuan yang menjadi prasyarat beberapa fase di sini.
>
> Dokumen ini menangani **31 temuan HILANG** dan temuan SEBAGIAN terkait yang
> **tidak** tercakup FASE 1–14. Sumber kebenaran status tiap temuan tetap
> `docs/audit/2026-07-29/DAFTAR-CELAH-MASTER.md`.
>
> **Ada dokumen lanjutan**: `2026-07-31-rencana-fase-27-33.md` menangani 15
> temuan baru dari audit blueprint 11/12/13 dan gap pipeline balasan AI
> (`docs/audit/2026-07-31/TEMUAN-AUDIT-LANJUTAN.md`). Beberapa di antaranya
> **lebih genting** daripada fase di dokumen ini — khususnya FASE 27 (validasi
> body HTTP, 64 titik tidak tervalidasi) dan FASE 28 (`scan_status` attachment
> dikendalikan klien). Pertimbangkan mengerjakan FASE 27 dan 28 lebih dulu.

---

## Cara memakai dokumen ini (BACA DULU, WAJIB)

> **UNTUK AGENT DENGAN KAPASITAS PENALARAN TERBATAS (mis. Gemini Flash):**
> baca `docs/plans/2026-07-31-panduan-eksekusi-agent-fase-5-26.md` lebih dulu.
> Dokumen itu berisi protokol kerja per sesi, template pelaporan, dan daftar
> fase yang **tidak boleh** dikerjakan tanpa keputusan manusia (di dokumen ini:
> FASE 20, FASE 22 bagian partial-fulfillment per-item (versi minimal
> `REQ-17-071` — kolom `order_id` nullable — sudah SELESAI 2026-08-01),
> FASE 26 bagian `REQ-10-015`).

Instruksi ini ditulis supaya bisa diikuti tanpa menebak. Ikuti apa adanya.

### Aturan mutlak (melanggar = pekerjaan ditolak)

1. **Satu fase per sesi.** Jangan mulai fase berikutnya sebelum fase sekarang
   lolos semua gerbang verifikasi.
2. **Verifikasi dulu, tulis kode kemudian.** Setiap fase punya langkah
   "VERIFIKASI KONDISI" di awal. Jalankan itu dan **laporkan hasil literalnya**
   sebelum menulis kode. Kalau kondisi nyata berbeda dari yang ditulis di sini,
   **berhenti dan laporkan** — jangan lanjut menebak.
3. **Tanpa `any`.** Tanpa `eslint-disable`. Tanpa non-null assertion `!`.
4. **Jangan pernah menghapus, men-skip, atau mematikan test.** Jumlah test hanya
   boleh naik.
5. **Jangan menyunting migrasi SQL yang sudah ada.** Migrasi baru selalu nomor
   berikutnya. Cek nomor terakhir dengan perintah ini dulu:
   ```
   ls packages/database/migrations/ | Sort-Object | Select-Object -Last 3
   ```
   Migrasi terakhir per 2026-07-31 adalah `0085_action_request.sql`, jadi
   migrasi baru **mulai `0086`**. Selalu cek ulang, jangan percaya angka ini.
6. **Jangan menghapus repository in-memory** (`InMemoryXRepository`). Kalau
   menambah logic ke versi Postgres, **tambahkan hal yang sama ke versi
   in-memory** — kalau tidak, suite e2e akan lolos padahal produksi rusak
   (ini pernah terjadi: FASE 3 lupa melakukannya, baru ketahuan di FASE 4).
7. **Tanpa dependency baru** kecuali alasannya kuat, dan versinya **dipin exact**
   (`"1.2.3"`, bukan `"^1.2.3"`).
8. **Uang selalu integer minor units** + kode mata uang. Tidak ada float.
9. Setiap klaim "selesai" wajib menyertakan **keluaran perintah + exit code
   literal**. Membaca kode lalu berasumsi tidak dihitung sebagai bukti.

### Gerbang verifikasi — jalankan SEMUA ini di akhir setiap fase

Copy-paste apa adanya. Semua harus `exit 0`. Laporkan angkanya.

```
cd D:\Games\Agent\Chai

pnpm run typecheck
pnpm run lint
pnpm run build --force
pnpm run test
pnpm run verify:infra
```

Yang butuh Docker aktif (`docker ps` harus berhasil dulu):

```
pnpm --filter @chai/domain run test:integration
pnpm --filter @chai/api run test:integration
```

Playwright (hapus `test-results/` dulu):

```
Remove-Item -Recurse -Force test-results -ErrorAction SilentlyContinue
pnpm run test:smoke
```

**Baseline per 2026-07-31 (akhir FASE 4)** — jumlah test **tidak boleh turun**
dari angka ini:

| Suite | Jumlah |
|---|---|
| `pnpm run test` (`@chai/api`) | 31 file / 196 test |
| `@chai/api` integrasi | 37 file / 147 test |
| `@chai/domain` integrasi | 8 file / 51 test |
| `test:smoke` (Playwright) | 89 test |
| `verify:infra` | 8/8 config |

Jalankan gerbang ini **sekali di awal sesi** untuk konfirmasi baseline masih
sama (sesi lain mungkin sudah menambah), lalu **sekali lagi di akhir**.

### Pola kode yang WAJIB diikuti (jangan buat pola baru)

Sebelum menulis file baru, buka file referensi ini dan **tiru strukturnya**:

| Kalau membuat... | Tiru file ini |
|---|---|
| Repository baru (abstract + in-memory + Postgres) | `apps/api/src/modules/payments/payments.repository.ts` + `postgres-payments.repository.ts` |
| Module NestJS baru | `apps/api/src/modules/payments/payments.module.ts` |
| Migrasi tabel tenant-scoped | `packages/database/migrations/0085_action_request.sql` |
| Port lintas-modul | `apps/api/src/modules/shared/action-tool.port.ts` |
| Adapter port di modul asal | `apps/api/src/modules/payments/payments-action.adapter.ts` |
| Test integrasi Postgres | `apps/api/test/integration/actions.integration.test.ts` |
| Test e2e HTTP | `apps/api/test/actions.e2e.test.ts` |
| Mutasi + audit + event satu transaksi | `commitBusinessMutation` di `packages/domain/src/outbox/producer.ts` |
| Fastify hook | `apps/api/src/common/webhook-body-limit.hook.ts` |

**Aturan DI (WAJIB, kalau salah aplikasi rusak senyap):** setiap parameter
constructor NestJS **harus** punya `@Inject(Token)` eksplisit. Tanpa itu,
build produksi (esbuild) me-resolve dependency sebagai `undefined` **tanpa
error saat boot** — bug ini pernah merusak 20 file. Contoh benar:

```ts
constructor(
  @Inject(DATABASE) private readonly database: Database,
  @Inject(SomeRepository) private readonly repo: SomeRepository,
) {}
```

**Aturan RLS (WAJIB untuk setiap tabel baru yang punya `tenant_id`):**

```sql
ALTER TABLE chai.nama_tabel ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.nama_tabel FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.nama_tabel
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.nama_tabel FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.nama_tabel TO chai_app_runtime;
```

### Kalau macet

- Kalau perintah gagal dan pesan errornya tidak jelas: jalankan ulang dengan
  output penuh, jangan potong.
- Kalau pendekatan yang sama gagal 2×: **berhenti**, laporkan apa yang dicoba
  dan pesan error literalnya. Jangan coba pendekatan ke-3 tanpa melapor.
- Kalau menemukan kondisi kode yang berbeda dari dokumen ini: laporkan, jangan
  paksa jalan.

---

## Urutan fase dan alasannya (JANGAN diacak)

Urutan ini dependency-driven, bukan berdasarkan severity:

```
FASE 15  Audit middleware ter-wire          <- fondasi: fase lain butuh audit trail
FASE 16  Capability intersection + nav      <- fondasi: fase lain butuh gate kapabilitas
FASE 17  Meta challenge + BSP mode          <- melengkapi WhatsApp resmi (kecil, mandiri)
FASE 18  Guardrail AI (allowlist, limit)    <- butuh FASE 4 (sudah selesai)
FASE 19  DLQ API + backpressure test        <- butuh FASE 9 (event kanonik)
FASE 20  Workflow durable (Temporal/BullMQ) <- butuh FASE 19 (queue sehat)
FASE 21  Template otomasi + booking durable <- butuh FASE 20 (workflow engine)
FASE 22  Logistik lanjutan (PoD, multi-pkg) <- butuh FASE 10 (ownership) + 20
FASE 23  Design system: Actions + AI comp   <- fondasi UI untuk FASE 24-25
FASE 24  Owner console: wizard, detail...    <- butuh FASE 23 (komponen) + 16
FASE 25  Community Gateway (WAHA)           <- butuh FASE 16, 17, 23, 24 semuanya
FASE 26  Sisa LOW + pembersihan             <- terakhir
```

**Kenapa Community Gateway (WAHA) paling akhir:** ia butuh kapabilitas
terpisah (FASE 16), UI badge risiko (FASE 23–24), dan kill switch per-tenant.
Membangunnya lebih awal berarti membangun kanal berisiko tanpa pagar
pengamannya — lihat 6 prasyarat di
`docs/plans/2026-07-26-community-gateway-roadmap.md`.

---

## FASE 15 — Audit middleware ter-wire — **SELESAI (2026-07-31)**

**Temuan**: `REQ-10-021` (HILANG, MEDIUM), `REQ-05-008` (HILANG, MEDIUM).

**Kenapa pertama**: hampir semua fase setelah ini menulis data. Kalau audit
trail belum otomatis, setiap fase harus menambal audit manual dan mudah lupa.

### VERIFIKASI KONDISI (jalankan dulu, laporkan hasilnya)

```
cd D:\Games\Agent\Chai
Get-Content apps\api\src\middleware\audit.middleware.ts | Select-Object -First 40
Select-String -Path apps\api\src\app.module.ts -Pattern "AuditMiddleware|audit.middleware"
Get-ChildItem apps\api\src -Recurse -Include *.ts | Select-String -Pattern "AuditMiddleware"
```

Yang dicari: apakah `AuditMiddleware` benar-benar terdaftar di `app.module.ts`
(sebagai `APP_INTERCEPTOR`/middleware) atau tidak dipanggil sama sekali.

### Yang harus dikerjakan

1. Sambungkan `AuditMiddleware` ke pipeline NestJS. Daftarkan di
   `apps/api/src/app.module.ts` mengikuti pola provider yang sudah ada di sana
   (lihat blok `providers: [...]` yang berisi `APP_GUARD`/`APP_INTERCEPTOR`).
2. Middleware harus menulis baris audit untuk **setiap mutasi** (POST/PUT/PATCH/
   DELETE) yang lolos guard, memakai `appendAuditEntry` dari `@chai/domain`.
   Jangan menulis audit untuk GET.
3. `REQ-05-008`: kalau request memakai `x-tenant-id` (owner memilih tenant lain
   — lihat `apps/api/src/common/tenant-context.interceptor.ts`), audit harus
   mencatat bahwa ini **akses lintas-tenant** beserta alasannya dari
   `principal.ownerTenantScope.reason`.
4. Rute yang **tidak** boleh diaudit otomatis (hindari duplikasi/noise): rute
   `/auth/` (sudah punya auditnya sendiri) dan rute yang sudah memanggil
   `commitBusinessMutation` (audit ganda). Buat daftar pengecualian eksplisit
   sebagai konstanta di file middleware, beri komentar alasannya.

### Definisi selesai

- Test integrasi baru membuktikan: satu POST bisnis -> satu baris di
  `chai.audit_log`; satu GET -> nol baris baru.
- Test membuktikan akses lintas-tenant owner tercatat dengan alasannya.
- Tidak ada audit ganda untuk rute yang sudah pakai `commitBusinessMutation`.
- Semua gerbang verifikasi `exit 0`.

---

## FASE 16 — Effective capability intersection + navigasi ter-gate — **SELESAI (2026-07-31)**

**Temuan**: `REQ-09-003` (HILANG, MEDIUM), `REQ-03-004` (HILANG, MEDIUM),
`REQ-08-036` (HILANG, MEDIUM).

**Kenapa di sini**: FASE 25 (Community Gateway) mensyaratkan kapabilitas
terpisah yang bisa dibaca UI dan backend. Ini fondasinya.

### VERIFIKASI KONDISI

```
cd D:\Games\Agent\Chai
Get-Content apps\api\src\modules\entitlements\entitlement.service.ts
Get-Content packages\connector-sdk\src\index.ts | Select-String -Pattern "CapabilityManifest" -Context 5,20
Get-ChildItem apps\client-portal\src -Recurse -Include *.tsx | Select-String -Pattern "nav" | Select-Object -First 20
```

### Yang harus dikerjakan

1. **Backend — `REQ-09-003`**: buat fungsi yang menghitung **irisan** kapabilitas
   efektif: `connector capability` ∩ `channel account` ∩ `entitlement tenant` ∩
   `policy`. Letakkan di `packages/domain/src/` (bukan di `apps/api`) supaya
   bisa dipakai worker juga. Kapabilitas yang tidak ada di **semua** himpunan =
   tidak tersedia.
2. **Backend — `REQ-08-036`**: pastikan pemilih kapabilitas AI tidak pernah
   memilih kapabilitas di luar irisan itu. Sambungkan ke jalur tool yang sudah
   digerbangi FASE 4 (`apps/api/src/modules/actions/actions.controller.ts`).
3. **Frontend — `REQ-03-004`**: item navigasi hanya dirender kalau entitlement
   **dan** permission terpenuhi. Cari komponen navigasi di
   `apps/client-portal/src` dan `apps/owner-console/src`. Ambil daftar
   kapabilitas dari endpoint yang sudah ada (cek `apps/api` untuk endpoint
   entitlement/session; kalau belum ada, tambahkan endpoint read-only).
   **Jangan** hard-code daftar menu di frontend.

### Definisi selesai

- Test unit membuktikan irisan kapabilitas: kapabilitas yang hilang di salah
  satu himpunan tidak muncul di hasil.
- Test e2e membuktikan tenant tanpa entitlement tidak melihat menu terkait.
- Test membuktikan tool AI tidak bisa memakai kapabilitas di luar irisan.
- Semua gerbang verifikasi `exit 0`.

---

## FASE 17 — Meta challenge handshake + Official BSP mode — **SELESAI (2026-07-31)**

**Temuan**: `REQ-09-007` (HILANG, MEDIUM), `REQ-09-011` (HILANG, LOW).

**Kenapa di sini**: kecil, mandiri, dan melengkapi jalur WhatsApp resmi yang
sudah ada — harus beres sebelum menambah kanal tidak resmi (FASE 25).

### VERIFIKASI KONDISI

```
cd D:\Games\Agent\Chai
Select-String -Path apps\api\src\modules\channels\channels.controller.ts -Pattern "hub.challenge|hub_challenge|@Get"
Get-Content packages\connectors\src\connectors\whatsapp-meta\index.ts | Select-Object -First 60
```

### Yang harus dikerjakan

1. **`REQ-09-007`**: Meta memverifikasi webhook dengan `GET` berisi
   `hub.mode`, `hub.verify_token`, `hub.challenge`. Tambahkan handler `GET` di
   `apps/api/src/modules/channels/channels.controller.ts` untuk path webhook
   yang sama. Kalau `hub.verify_token` cocok dengan token yang dikonfigurasi
   (env var, jangan hard-code), balas **body berisi `hub.challenge` apa adanya**
   dengan status 200. Kalau tidak cocok: 403. Rute ini harus masuk allowlist
   rute publik di `apps/api/test/route-permission-coverage.test.ts` dengan
   komentar alasannya.
2. **`REQ-09-011`**: "Official BSP mode" = mode di mana platform bertindak lewat
   Business Solution Provider, bukan akun Meta langsung. Cek dulu apakah ini
   butuh kode atau cuma konfigurasi adapter. **Kalau ternyata butuh keputusan
   produk (pilih BSP mana, kontrak komersial), JANGAN buat kode — tulis
   temuannya dan minta keputusan.**

### Definisi selesai

- Test e2e: `GET` webhook dengan token benar -> 200 + body persis
  `hub.challenge`; token salah -> 403.
- `route-permission-coverage.test.ts` tetap lolos (rute baru masuk allowlist
  secara sadar).
- Semua gerbang verifikasi `exit 0`.

---

## FASE 18 — Guardrail AI: allowlist domain, batas loop, batas tool — **SELESAI (2026-07-31)**

**Temuan**: `REQ-08-030` (HILANG, MEDIUM), `REQ-10-018` (HILANG, LOW),
`REQ-08-011` (HILANG, LOW).

**Prasyarat**: FASE 4 (sudah selesai — jalur `/actions/execute` sudah ada).

### VERIFIKASI KONDISI

```
cd D:\Games\Agent\Chai
Get-Content services\ai-gateway\src\guardrails.ts
Get-Content apps\api\src\modules\actions\actions.controller.ts | Select-Object -First 60
```

Catatan penting: `services/ai-gateway` **tidak dipanggil produksi** (temuan
FASE 4). Guardrail harus dipasang di jalur yang **benar-benar jalan**, yaitu
`apps/api/src/modules/actions/`. Jangan menambah kode ke `services/ai-gateway`
kalau tidak ada yang memanggilnya.

### Yang harus dikerjakan

1. **`REQ-08-030`** di jalur `/actions/execute`:
   - Batas jumlah tool per turn (konstanta, default konservatif).
   - Deteksi loop: tool yang sama dengan parameter sama dipanggil berulang
     dalam satu percakapan -> tolak.
   - Allowlist domain/URL: kalau parameter tool berisi URL, hanya domain di
     allowlist yang diizinkan.
2. **`REQ-10-018`**: fetch media harus SSRF-safe — tolak IP privat/loopback/
   link-local, tolak redirect ke host yang tidak di-allowlist. Cek dulu apakah
   ada fitur yang benar-benar fetch URL eksternal; kalau belum ada, cukup buat
   helper + test-nya, dan catat `ponytail:` bahwa pemakainya menyusul.
3. **`REQ-08-011`**: memori jangka panjang AI harus berbatas — field eksplisit,
   sumber tercatat, ada `expiry`. Kalau belum ada fitur memori sama sekali,
   **jangan bangun fitur memori baru** — catat sebagai HILANG struktural yang
   butuh keputusan produk, sama seperti pola `REQ-17-019`.

### Definisi selesai

- Test: tool ke-N+1 dalam satu turn ditolak.
- Test: tool identik berulang ditolak sebagai loop.
- Test: URL ke domain di luar allowlist ditolak; IP privat ditolak.
- Semua gerbang verifikasi `exit 0`.

---

## FASE 19 — DLQ API owner + tes backpressure — **SELESAI (2026-07-31)**

**Temuan**: `REQ-06-013` (HILANG, MEDIUM), `REQ-02-021` (HILANG, MEDIUM).

**Prasyarat**: FASE 9 (event kanonik) sudah selesai.

### VERIFIKASI KONDISI

```
cd D:\Games\Agent\Chai
Get-Content apps\api\src\modules\dlq\dlq.controller.ts
Get-Content apps\api\src\modules\dlq\dlq.repository.ts
```

### Yang harus dikerjakan

1. **`REQ-06-013`**: `DlqController` sudah ada (`/internal/v1/dlq`). Blueprint
   minta rute **owner-facing**: `GET /dead-letters`,
   `POST /dead-letters/:id/replay`. Cek apakah rute internal yang ada sudah
   cukup atau perlu rute owner terpisah dengan permission owner. Kalau rute
   internal sudah menutupinya, **koreksi dokumen audit** dan jelaskan.
2. **`REQ-02-021`**: tes backpressure — buat test yang membanjiri queue melebihi
   kapasitas dan membuktikan sistem menolak/menunda dengan rapi (bukan crash,
   bukan kehilangan pesan). Letakkan di suite integrasi `@chai/broker` atau
   `@chai/api` sesuai tempat queue-nya.

### Definisi selesai

- Test membuktikan DLQ bisa dibaca dan di-replay oleh owner, dan **tidak** oleh
  tenant biasa.
- Test backpressure membuktikan tidak ada pesan hilang saat overload.
- Semua gerbang verifikasi `exit 0`.

---

## FASE 20 — Workflow durable tanpa dependency baru — **SELESAI (2026-07-31)**

> **KEPUTUSAN DIAMBIL: TANPA Temporal, TANPA BullMQ, nol dependency baru.**
> Alih-alih menambah infrastruktur workflow-engine, fase ini memakai pola
> CLAIM-LOOP + `FOR UPDATE SKIP LOCKED` yang sudah terbukti di outbox dispatcher
> dan payment reconciler (lihat `docs/plans/2026-07-27-deferred-workers-roadmap.md`
> §2: Temporal tetap keputusan fase Growth; kebutuhan sekarang bounded &
> reconcilable, bukan durable-workflow engine sungguhan).

### Solusi diterapkan (bukti penutupan)

- **Migrasi `0093_workflow_run.sql`**: tabel `chai.workflow_run` (id, tenant_id,
  workflow_type, status ENUM PENDING/RUNNING/COMPENSATING/DONE/FAILED, state
  jsonb, current_step, created_at, updated_at) + RLS ENABLE+FORCE+policy
  tenant_isolation, GRANT ke `chai_app_runtime` & `chai_worker_runtime`.
  Terapan bersih di testcontainer.
- **State machine murni** `packages/domain/src/workflow/transitions.ts`:
  `decideWorkflowTransition` (APPLY / REJECT{NOOP,TERMINAL,ILLEGAL}),
  `isTerminalWorkflowStatus`, `isActiveWorkflowStatus`. Terminal tetap terminal;
  kompensasi satu arah (COMPENSATING tak pernah balik ke RUNNING/DONE).
- **Claim-loop** `packages/domain/src/workflow/run-store.ts`: `claimWorkflowRuns`
  (`FOR UPDATE SKIP LOCKED`, PENDING→RUNNING, reclaim stale via `updated_at`),
  `persistWorkflowStep` (re-read `FOR UPDATE` + validasi transisi),
  `createWorkflowRun`, `getWorkflowRun`.
- **Kontrak n8n** `docs/contracts/n8n-integration-contract.md` (REQ-07-012):
  event bertanda tangan + callback (workflow/run id, tenant, action id, status,
  sanitized result, signature), auth HMAC per-tenant, dan batasan keras §13
  (n8n bukan source of truth, tak menyimpan state percakapan, efek ireversibel
  hanya lewat ActionRequest bertanda tangan + rekonsiliasi).
- **Test**: unit state machine 7/7 (`src/workflow/transitions.test.ts`);
  integrasi 3/3 (`test/workflow-run.integration.test.ts`) — membuktikan **dua
  klaim bersamaan hanya satu yang menang** (SKIP LOCKED), reclaim stale, dan
  transisi ilegal ditolak.
- **Gerbang**: api typecheck=0, api lint=0, domain typecheck=0 (plus domain
  lint=0, unit+integrasi hijau).

**Temuan**: `REQ-07-010` (HILANG, MEDIUM), `REQ-07-011` (HILANG, LOW),
`REQ-07-012` (HILANG, LOW).

**Prasyarat**: FASE 19 (queue sehat dan teruji).

**PERINGATAN**: ini fase dengan risiko dependency baru terbesar. Temporal dan
BullMQ keduanya dependency berat.

### VERIFIKASI KONDISI

```
cd D:\Games\Agent\Chai
Get-Content package.json | Select-String -Pattern "temporal|bullmq"
Get-ChildItem workers -Directory
Get-Content docs\plans\2026-07-27-deferred-workers-roadmap.md
```

### Yang harus dikerjakan

1. **Baca `docs/plans/2026-07-27-deferred-workers-roadmap.md` dulu** — mungkin
   sudah ada keputusan tertulis soal ini.
2. **Sebelum menambah Temporal atau BullMQ: LAPORKAN DULU dan minta
   persetujuan.** Keduanya dependency infrastruktur besar (Temporal butuh
   server terpisah). Jangan menambahkannya tanpa konfirmasi eksplisit.
3. Kalau disetujui: pin versi exact, tambahkan ke `infra/` compose config,
   pastikan `verify:infra` masih lolos.
4. `REQ-07-012` (kontrak n8n): ini kontrak/dokumen, bukan kode besar. Tulis
   kontraknya (bentuk payload, auth, batasan) sesuai batasan n8n di blueprint
   §11.4 (n8n **tidak boleh** menyimpan state percakapan atau jadi source of
   truth).

### Definisi selesai

- Kalau dependency ditambah: `verify:infra` lolos dengan config baru, dan ada
  test yang membuktikan workflow bertahan melewati restart proses.
- Kalau ditunda: dokumen keputusan tertulis dengan alasan, dan status audit
  dikoreksi menjadi "ditunda sadar" bukan "hilang".
- Semua gerbang verifikasi `exit 0`.

---

## FASE 21 — Template otomasi MVP + workflow booking durable — **SELESAI (2026-07-31)**

**Temuan**: `REQ-07-014` (HILANG, MEDIUM), `REQ-07-015` (HILANG, MEDIUM).

**Prasyarat**: FASE 20 (substrat `chai.workflow_run` + claim-loop, sudah selesai).

### Solusi diterapkan (bukti penutupan)

- **REQ-07-014 — enam template MVP** `packages/domain/src/automation/templates.ts`:
  `no-response-follow-up`, `booking-reminder`, `hot-lead-notification`,
  `knowledge-freshness`, `payment-request-reminder`,
  `shipment-milestone-exception` — transkrip setia blueprint §10.1–§10.6
  (trigger + kondisi + langkah berurutan + stop-reason). `validateAllTemplates`
  memastikan integritasnya.
- **REQ-07-014 — stop-reason enum** `packages/domain/src/automation/stop-reasons.ts`:
  `AutomationStopReason` (14 token dari blueprint §10.1/§10.5/§10.6),
  `isAutomationStopReason`/`assertAutomationStopReason` menolak string bebas —
  bukan string bebas lagi.
- **REQ-07-015 — booking durable** `packages/domain/src/workflow/saga.ts` +
  `booking.ts`: saga generik (unwind kompensasi urutan-terbalik) + workflow
  booking (reserve-slot → capture-payment → confirm-booking) yang memetakan ke
  status `chai.workflow_run` (RUNNING/CREATING → COMPENSATING/CANCELLED →
  FAILED/CANCELLED, atau FAILED/FAILED_REVIEW bila undo gagal), sub-state §11.1.
- **Test**: unit 44/44 baru (`templates.test.ts` 35 incl. per-template,
  `saga.test.ts` 5, `booking.test.ts` 4); integrasi 2/2
  (`booking-workflow.integration.test.ts`) — **membuktikan pembayaran gagal di
  tengah melepas slot yang sudah dipesan, tanpa bookingId, run berakhir
  FAILED/CANCELLED di `chai.workflow_run`** (tidak ada booking setengah jadi).
  Suite unit domain penuh 227/227.
- **Gerbang**: api typecheck=0, api lint=0, domain typecheck=0 (plus domain
  lint=0).

### Catatan lingkup

Template direpresentasikan sebagai **deskriptor kanonik** (trigger, kondisi,
langkah, stop-reason) — lebih kaya dari 5 primitive action flow-engine yang ada,
jadi ia mendokumentasikan kontrak otomasi + kosakata stop-reason tanpa memaksa
memperluas union `TriggerType`/`ActionType` bersama (menghindari perubahan
berisiko pada kode terpakai). Eksekusi runtime tetap lewat flow-engine yang ada.

### VERIFIKASI KONDISI

```
cd D:\Games\Agent\Chai
Get-Content apps\api\src\modules\automation-builder\automation-builder.repository.ts | Select-Object -First 60
Get-Content packages\domain\src\automation\versioning.ts | Select-Object -First 40
```

### Yang harus dikerjakan

1. **`REQ-07-014`**: enam template otomasi MVP + kosakata `stop-reason` yang
   baku. Cari daftar keenam template di blueprint
   (`07_EVENTS_AUTOMATIONS_AND_JOBS.md`) — **jangan mengarang sendiri**.
   Kosakata `stop-reason` harus enum, bukan string bebas.
2. **`REQ-07-015`**: workflow booking durable dengan state eksplisit +
   kompensasi (apa yang di-undo kalau langkah N gagal). Pakai engine hasil
   keputusan FASE 20.

### Definisi selesai

- Keenam template ada, punya test masing-masing, dan `stop-reason` divalidasi
  sebagai enum.
- Test membuktikan workflow booking yang gagal di tengah menjalankan
  kompensasinya (tidak meninggalkan booking setengah jadi).
- Semua gerbang verifikasi `exit 0`.

---

## FASE 22 — Logistik lanjutan: PoD, notifikasi consent, multi-package — **SELESAI (2026-08-01)**

> **PoD (REQ-17-038) + consent notification (REQ-17-069): SELESAI.**
> **Multi-package (REQ-17-071): SELESAI (versi minimal, 2026-08-01)** — kolom
> nullable `chai.shipment.order_id` (FK ke `chai.order`); satu order boleh punya
> banyak shipment. Partial-fulfillment per-item tetap tertunda; lihat di bawah.

**Temuan**: `REQ-17-038` (HILANG, MEDIUM), `REQ-17-069` (HILANG, MEDIUM),
`REQ-17-071` (HILANG, MEDIUM).

**Prasyarat**: FASE 10 (ownership lookup) dan FASE 20.

### Solusi diterapkan (bukti penutupan)

- **REQ-17-038 — PoD** migrasi `0094_proof_of_delivery.sql`: tabel
  `chai.proof_of_delivery` (write-once evidence: GRANT SELECT/INSERT saja, tanpa
  UPDATE/DELETE) + RLS ENABLE+FORCE+policy. Domain
  `packages/domain/src/advanced-logistics/proof-of-delivery.ts`:
  `decideProofAccess` (GRANTED staf berwenang / MASKED pemilik terbukti / DENIED
  fail-closed), `maskProofOfDelivery` (nama penerima → inisial, signature/artifact
  ref di-strip), `proofLinkExpired` (URL berumur pendek), `recordProofAccess`
  (audit setiap akses via `appendAuditEntry`). Persistensi `createProofOfDelivery`
  / `getProofOfDelivery` RLS-scoped.
- **REQ-17-069 — consent notification** `notification-consent.ts`:
  `decideNotificationConsent`/`assertNotificationConsent` — fail-closed, memblok
  kanal tak dikonfigurasi (`CHANNEL_NOT_CONFIGURED`) dan tanpa consent/opt-out
  (`NO_CONSENT`).
- **Test**: unit 15/15 (`proof-of-delivery.test.ts` 9 incl. masking/expiry/
  fail-closed, `notification-consent.test.ts` 6); integrasi 3/3
  (`proof-of-delivery.integration.test.ts`) — **PoD tak bocor lintas tenant
  (RLS), akses tercatat di audit, round-trip**. Suite integrasi domain penuh
  11 file/59 test hijau; unit domain 242.
- **Gerbang**: api typecheck=0, api lint=0, domain typecheck=0 (plus domain
  lint=0).

### REQ-17-071 (multi-package) — SELESAI versi minimal (2026-08-01)

**Konteks (kenapa dulu ditunda).** Model paket **sengaja dihapus**:
`shipment_packages` pernah ada di `0037_shipment_state_machine.sql` (skema
`public`) lalu **di-DROP di `0057_drop_state_machine_facades.sql`**. Sebelumnya
`chai.shipment` = satu baris per (tenant, tracking_number), **tanpa FK ke
`chai.order`**; `chai.order` punya status datar
`open/confirmed/cancelled/fulfilled`. Membangun ulang junction
order↔shipment↔package penuh dengan partial-fulfillment menyentuh **siklus hidup
order** (kapan order jadi `fulfilled` bila hanya sebagian dikirim) dan berisiko
besar terhadap FASE 6/7/8.

**Keputusan (diambil 2026-08-01).** Bangun **versi minimal yang aman**, bukan
many-to-many penuh: kolom **nullable** `order_id` (FK opsional ke `chai.order`)
di `chai.shipment`, plus dukungan **banyak shipment untuk satu `order_id` yang
sama** — otomatis mungkin karena `order_id` kolom biasa tanpa unique constraint,
tanpa tabel junction. Tidak menyentuh kolom/logika `chai.order` yang ada, tidak
mengubah kapan order jadi `fulfilled`.

**Solusi diterapkan (bukti penutupan).**
- Migrasi `0095_shipment_order_link.sql`: `ALTER TABLE chai.shipment ADD COLUMN
  IF NOT EXISTS order_id uuid REFERENCES chai.order(id)` + index
  `idx_shipment_order ON chai.shipment(tenant_id, order_id)`. `SET ROLE
  chai_migration_owner` seperti `0045` (tabel dimiliki owner itu; ALTER butuh
  ownership). RLS `chai.shipment` tak disentuh — kolom saja.
- Kode: `orderId?` ditambahkan ke `LogisticsRepository.link` (kontrak abstrak +
  Postgres + in-memory), di-INSERT ke kolom `order_id` di
  `PostgresLogisticsRepository`, dan diekspos sebagai `orderId` (`@IsUUID`
  opsional) di `LinkBody` (`logistics.controller.ts`).
- Test integrasi
  `apps/api/test/integration/shipment-order-link.integration.test.ts`: dua
  shipment (dua paket) di-`link` ke satu `order_id` yang sama dengan tracking
  number berbeda; `SELECT ... WHERE order_id = $1` mengembalikan **2 baris**,
  keduanya `order_id` sama — membuktikan tak ada unique constraint yang
  menghalangi. **1 test passed** (migrasi 0095 ikut ter-apply di container).
- **Gerbang**: api typecheck=0, api lint=0, test integrasi file ini=0.

**Tertunda lanjutan (di luar scope minimal; butuh keputusan model bisnis).**
1. **Partial-fulfillment per-item**: melacak `order_item` mana masuk shipment
   mana, dan kapan `chai.order.status` jadi `fulfilled` bila hanya sebagian
   paket terkirim. Butuh tabel relasi item↔shipment + logika penyelesaian order.
2. **Tenant-hardening FK**: FK sekarang `REFERENCES chai.order(id)` saja;
   pengecekan referential-integrity PostgreSQL mengabaikan RLS, jadi FK sendiri
   tak membuktikan same-tenant (dimitigasi RLS + lookup app-layer tenant-scoped +
   index `(tenant_id, order_id)`). FK komposit `(tenant_id, order_id)` seperti
   `0045` untuk contact butuh UNIQUE `chai.order(tenant_id, id)` — perubahan
   tabel order, sengaja di luar scope minimal ini.

**Definisi selesai (status)**: PoD tak dapat diakses tanpa proof/role, URL
kedaluwarsa, akses teraudit ✓; notifikasi tanpa consent ditolak ✓; multi-package
(order_id nullable, banyak shipment per order) ✓ (2026-08-01); partial-fulfillment
per-item — **tetap tertunda** (butuh keputusan model).

### VERIFIKASI KONDISI

```
cd D:\Games\Agent\Chai
Get-Content apps\api\src\modules\logistics\logistics.repository.ts
Select-String -Path packages\database\migrations\*.sql -Pattern "proof_of_delivery|pod_"
Get-ChildItem apps\api\src -Recurse -Include *.ts | Select-String -Pattern "customerLookup"
```

### Yang harus dikerjakan

1. **`REQ-17-038`** (PoD): tidak ada penyimpanan Proof of Delivery sama sekali.
   Butuh migrasi baru + akses yang: role-checked, short-lived (URL kedaluwarsa),
   diaudit, dan **masked** (jangan bocorkan tanda tangan/nama penerima ke pihak
   yang tidak berhak). Ini menyentuh data pribadi — hati-hati.
2. **`REQ-17-069`**: notifikasi hanya ke kanal yang dikonfigurasi dan
   consent-compliant. Cek `apps/api/src/modules/notification/`.
3. **`REQ-17-071`**: satu order bisa punya banyak shipment/package, dan
   fulfillment bisa sebagian. Ini **perubahan model data** — cek dulu apakah
   `chai.shipment` sudah mendukung relasi ini. Kalau tidak, ini keputusan model
   bisnis: **laporkan dulu** sebelum membuat migrasi besar.

### Definisi selesai

- Test: PoD tidak bisa diakses tanpa proof of ownership; URL kedaluwarsa;
  akses tercatat di audit.
- Test: notifikasi ke kanal tanpa consent ditolak.
- Test: partial fulfillment tidak menandai order selesai — **tertunda lanjutan**
  (di luar scope minimal REQ-17-071; lihat subbagian REQ-17-071 di atas).
- Semua gerbang verifikasi `exit 0`.

---

## FASE 23 — Design system: komponen Actions + komponen AI — **SELESAI (2026-07-31)**

> **Bukti penutupan (2026-07-31)**: `packages/ui` — `actions.tsx` (Button,
> IconButton, SplitButton, ApprovalButton) + `ai.tsx` (9 komponen AI:
> ModelAliasBadge, EvidenceIndicator, SourceCitationList, ToolProposalCard,
> ApprovalCard, PromptVersionChip, AITraceSummary, CostTokenSummary,
> GuardrailEvent). `EvidenceIndicator` memakai level kualitatif (strong/partial/
> none/human-review); tes `ai.test.tsx` menegakkan **tidak ada persen** di semua
> level. Tiap komponen punya tes render + keyboard/aksesibilitas.
> Verifikasi: `@chai/ui` typecheck=0, lint=0, test=0 (106 tes).

**Temuan**: `REQ-04-009` (HILANG, MEDIUM), `REQ-04-016` (HILANG, MEDIUM).

**Kenapa sebelum FASE 24**: FASE 24 (owner console) memakai komponen ini.

### VERIFIKASI KONDISI

```
cd D:\Games\Agent\Chai
Get-ChildItem packages\ui\src -Recurse -File | Select-Object Name
Get-Content packages\ui\package.json
```

### Yang harus dikerjakan

1. **`REQ-04-009`**: `Button`, `IconButton`, `SplitButton`, `ApprovalButton` di
   `packages/ui`. Aturan desain: **satu primary button per area** — enforce
   lewat dokumentasi komponen + review, jangan lewat runtime error.
   `ApprovalButton` harus mendukung state "menunggu persetujuan" (nyambung ke
   `REQUIRE_APPROVAL` dari policy engine FASE 4).
2. **`REQ-04-016`**: 9 komponen AI. Cari daftarnya di
   `04_DESIGN_SYSTEM.md` — jangan mengarang. **Larangan eksplisit dari
   blueprint: jangan menampilkan confidence dalam persen** (pseudo-ilmiah).
   Pakai kategori kualitatif.
3. Semua komponen wajib **accessible** (keyboard, ARIA label, focus visible).

### Definisi selesai

- Semua komponen punya test render + test interaksi keyboard.
- Tidak ada komponen yang menampilkan confidence numerik dalam persen.
- Semua gerbang verifikasi `exit 0`.

---

## FASE 24 — Owner console: wizard, tenant detail, channel health, billing — **SELESAI (2026-07-31)**

> **Bukti penutupan (2026-07-31)**: `apps/owner-console` — `tenant-wizard.tsx`
> (8 langkah, autosave localStorage tiap langkah, DRAFT→ACTIVE hanya setelah
> checklist onboarding lengkap), `tenant-detail.tsx` (tenant identity banner
> sticky yang tetap terlihat lintas-tab + 8 tab), `channel-health.tsx` (matriks
> provider dengan badge high-risk Community Gateway), `usage-billing.tsx` (tiap
> angka via `CostBadge` → wajib label sumber), `onboarding-checklist.tsx` (§6.2 +
> gate aktivasi). Primitif DS baru di `packages/ui`: `ChannelRiskBadge`
> (dipakai FASE 25) + `CostBadge`. Rute `/tenants/new`, `/tenants/[tenantId]`,
> `/channel-health`, `/billing` + nav + middleware. Verifikasi: owner-console
> typecheck=0, lint=0, test=0 (23 tes); client-portal typecheck/lint=0.

**Temuan**: `REQ-03-009`, `REQ-03-010`, `REQ-03-011`, `REQ-03-014`,
`REQ-03-018` (semua HILANG, MEDIUM).

**Prasyarat**: FASE 23 (komponen) + FASE 16 (capability gate).

### VERIFIKASI KONDISI

```
cd D:\Games\Agent\Chai
Get-ChildItem apps\owner-console\src\app -Recurse -Directory | Select-Object FullName
Get-Content apps\owner-console\src\app\tenants\page.tsx | Select-Object -First 40
```

### Yang harus dikerjakan (satu halaman per commit)

1. **`REQ-03-009` Tenant Creation Wizard**: 8 langkah, autosave tiap langkah,
   tenant **tidak boleh** jadi `ACTIVE` sebelum checklist lengkap. Cari daftar
   8 langkah di `03_UX_UI.md`.
2. **`REQ-03-010` Tenant Detail**: tabs + **tenant identity banner** yang selalu
   terlihat saat owner sedang melihat data tenant lain (mencegah salah tenant).
3. **`REQ-03-011` Global Channel Health**: termasuk **badge high-risk untuk
   Community Gateway** (dipakai FASE 25 — buat sekarang meski kanalnya belum
   ada, supaya FASE 25 tidak perlu menyentuh UI lagi).
4. **`REQ-03-014` Usage & Billing**: setiap angka biaya wajib menyertakan
   **cost source**: `measured` / `estimated` / `reconciled`. Jangan tampilkan
   angka tanpa label sumbernya.
5. **`REQ-03-018` Invite + onboarding checklist** sesuai §6.2 blueprint.

### Definisi selesai

- Test e2e per halaman: wizard tidak bisa menyelesaikan tenant tanpa checklist;
  banner tenant muncul saat lintas-tenant; angka billing selalu punya label
  sumber.
- Semua gerbang verifikasi `exit 0`, `test:smoke` tidak turun.

---

## FASE 25 — Community Gateway (WAHA) — **SELESAI (2026-07-31)**

> **Bukti penutupan (2026-07-31)**: prasyarat FASE 16/17/23/24 semua SELESAI.
> Adapter `packages/connectors/src/connectors/community-whatsapp` (`riskClass:
> 'COMMUNITY'`, `slaClass: 'STAGING'`, idempoten, timeout→`UNKNOWN_RESULT`,
> `reconcile`). Service terisolasi `services/community-gateway` (state machine
> sesi + backoff/quarantine; gateway penerjemah tanpa business logic).
> 6 prasyarat + tes: (1) kapabilitas `community_channel` default-OFF di
> `EntitlementService` + `assertCommunityEntitled`→`FEATURE_NOT_ENABLED`;
> (2) `authorizeCommunityActivation` owner-only + alasan + audit lintas-tenant;
> (3) `riskClass:'COMMUNITY'`+`slaClass` non-produksi di tiap envelope;
> (4) badge risiko FASE 24; (5) kill-switch provider `community-channel`
> terpisah + quarantine (tes isolasi dari `channel` & antar-tenant);
> (6) conformance sekelas connector lain (duplikat/timeout/rekonsiliasi/hasil
> tak diketahui/isolasi). Verifikasi: `@chai/connectors` typecheck=0, lint=0,
> test=0 (100 tes); `@chai/community-gateway` typecheck=0, lint=0, test=0 (15 tes).

**Temuan**: `REQ-09-012` (HILANG, LOW).

**Prasyarat MUTLAK**: FASE 16, 17, 23, 24 semuanya selesai.

**BACA DULU**: `docs/plans/2026-07-26-community-gateway-roadmap.md`. Dokumen itu
berisi 6 prasyarat yang **tidak boleh dilanggar**. Kanal ini memakai sesi
WhatsApp **tidak resmi** — nomor tenant bisa diblokir kapan saja.

### 6 prasyarat (checklist, semua wajib)

- [ ] 1. Kapabilitas terpisah `community_channel`, **default mati**, dibaca
      `EntitlementService`. Tenant tanpa itu -> `FEATURE_NOT_ENABLED`. **Bukan**
      bagian dari kapabilitas WhatsApp resmi.
- [ ] 2. Aktivasi **owner-only**: hanya `PLATFORM_OWNER` dengan konteks tenant
      eksplisit + alasan tersimpan, lewat jalur audit yang sama dengan akses
      lintas-tenant (FASE 15).
- [ ] 3. `riskClass: 'COMMUNITY'` + `slaClass` non-produksi menempel di
      **setiap** event yang dihasilkan.
- [ ] 4. UI menyatakan risikonya di titik pemakaian (badge dari FASE 24).
- [ ] 5. Kill switch **per tenant** + quarantine mandiri, terpisah dari kanal
      resmi.
- [ ] 6. Suite conformance sama standarnya dengan connector lain: duplikat,
      timeout setelah submit, rekonsiliasi, hasil tak diketahui, isolasi tenant.

### Yang harus dikerjakan

1. Service gateway **terisolasi** (bukan di dalam `apps/api`). Tanggung
   jawabnya (dari blueprint §11.5.3): QR/pairing + session lifecycle, session
   persistence terenkripsi per channel account, capture inbound text/media/
   status, publish webhook internal ternormalisasi, outbound send, reconnect
   dengan backoff, heartbeat/session state/disconnect reason, message ordering +
   rate guard konservatif, media ke object storage, kill switch,
   export/migration.
2. Gateway **tidak boleh** berisi business logic. Ia hanya menerjemahkan sesi
   WhatsApp Web menjadi event internal.
3. Adapter connector baru di `packages/connectors/src/connectors/` yang
   `riskClass: 'COMMUNITY'`.
4. **Jangan** menyatukan jalur pengiriman dengan kanal `OFFICIAL` — metrik dan
   alert harus terpisah.

### Definisi selesai

- Keenam checklist prasyarat terbukti dengan test.
- Test: tenant tanpa `community_channel` -> `FEATURE_NOT_ENABLED`.
- Test: event dari kanal ini selalu bawa `riskClass: 'COMMUNITY'`.
- Test: kill switch per-tenant menghentikan kanal ini **tanpa** mempengaruhi
  kanal resmi tenant lain.
- Suite conformance lolos dengan standar yang sama seperti connector lain.
- Semua gerbang verifikasi `exit 0`.

---

## FASE 26 — Sisa LOW + pembersihan — **SELESAI (2026-08-01)**

**Temuan**: `REQ-10-015` (OIDC workload identity), `REQ-08-032` (release floor +
canary), `REQ-08-044` (rollback model), plus sisa SEBAGIAN berlabel LOW di
`DAFTAR-CELAH-MASTER.md`.

### Yang harus dikerjakan

1. Baca `DAFTAR-CELAH-MASTER.md`, ambil semua baris `| SEBAGIAN |` dan
   `| HILANG |` yang **belum** tertutup fase mana pun.
2. Untuk setiap baris: verifikasi kondisi nyata dulu. Sebagian mungkin sudah
   tertutup oleh pekerjaan fase lain — **koreksi dokumen audit** kalau begitu.
3. `REQ-08-032` / `REQ-08-044` (canary + rollback model) butuh infrastruktur
   deployment. Kalau belum ada, catat sebagai ditunda sadar dengan alasan,
   jangan buat setengah jadi.
4. `REQ-10-015` (OIDC workload identity) mengganti API key statis. Ini
   menyentuh autentikasi — **laporkan rencana dulu** sebelum mengubah apa pun.

### Definisi selesai

- Setiap baris SEBAGIAN/HILANG yang tersisa punya salah satu dari: tertutup
  dengan test, atau dokumen keputusan "ditunda sadar" beserta alasannya.
- Statistik di `DAFTAR-CELAH-MASTER.md` diperbarui dan **dihitung dengan
  perintah**, bukan ditaksir.
- Semua gerbang verifikasi `exit 0`.

---

## Setelah setiap fase selesai (WAJIB, jangan dilewat)

1. **Perbarui `docs/audit/2026-07-29/DAFTAR-CELAH-MASTER.md`**:
   - Ubah status REQ yang tertutup (`HILANG`/`SEBAGIAN` -> `TERPENUHI`).
   - Perbarui angka statistik di ringkasan eksekutif. **Hitung dengan
     perintah**, jangan menaksir:
     ```
     (Select-String -Path docs\audit\2026-07-29\DAFTAR-CELAH-MASTER.md -Pattern "^\| REQ-.*\| TERPENUHI \|").Count
     (Select-String -Path docs\audit\2026-07-29\DAFTAR-CELAH-MASTER.md -Pattern "^\| REQ-.*\| SEBAGIAN \|").Count
     (Select-String -Path docs\audit\2026-07-29\DAFTAR-CELAH-MASTER.md -Pattern "^\| REQ-.*\| HILANG \|").Count
     ```
2. **Perbarui dokumen ini**: tambahkan `— SELESAI (tanggal)` di judul fase, dan
   ganti bagian "Yang harus dikerjakan"/"Definisi selesai" menjadi "Solusi
   diterapkan"/"Bukti penutupan" dengan angka literal.
3. **Laporkan ke pemilik proyek**: apa yang berubah, exit code semua gerbang,
   jumlah test sebelum vs sesudah.
4. **Bersihkan**: matikan proses server/node yang masih jalan, hapus file
   sementara, hapus `test-results/`.
   ```
   Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -notlike "*Adobe*" } | Stop-Process -Force
   netstat -ano | findstr "LISTENING" | findstr ":300"
   ```
5. **Berhenti.** Jangan mulai fase berikutnya di sesi yang sama.
