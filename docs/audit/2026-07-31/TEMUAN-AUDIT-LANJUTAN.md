# Temuan audit lanjutan — 2026-07-31

Audit ini menutup area yang **belum pernah diaudit** oleh
`docs/audit/2026-07-29/DAFTAR-CELAH-MASTER.md`:

| Area | Sumber | Status sebelumnya |
|---|---|---|
| Analytics & KPI | blueprint 11 (453 baris) | belum pernah diekstrak jadi REQ |
| QA & Test Strategy | blueprint 12 (456 baris) | belum pernah diekstrak jadi REQ |
| DevOps/SRE & Runbooks | blueprint 13 (428 baris) | belum pernah diekstrak jadi REQ |
| Pipeline balasan AI | lintas dokumen | disinggung, tidak pernah dilacak tuntas |

Semua temuan di bawah **diverifikasi dengan eksekusi perintah**, bukan pembacaan
dokumen. Perintah dan hasil literalnya dicantumkan agar bisa diulang.

## Ringkasan: 15 temuan

| ID | Temuan | Kelas | Severity | Tercakup FASE 1–26? |
|---|---|---|---|---|
| T-01 | `services/ai-gateway` tidak tersambung ke apa pun | kode mati | **P0** | tidak |
| T-02 | Tidak ada pipeline balasan AI otomatis | fitur inti hilang | **P0** | tidak |
| T-03 | `RedisStreamsConsumer` nol pemakai produksi | kode mati | **P0** | tidak |
| T-04 | 64 titik `@Body()` tanpa DTO → body tidak divalidasi | validasi | **P0** | tidak |
| T-05 | `scan_status`/`mimeDetected` attachment dikendalikan klien | keamanan | **P0** | tidak |
| T-06 | `inbox-dispatcher` tidak memproses apa pun | utang diketahui | P1 | tidak |
| T-07 | Nol fact table dari 18 yang diminta | analytics | P1 | tidak |
| T-08 | 5 dari 33 metrik terdefinisi | analytics | P1 | tidak |
| T-09 | Metrik dihitung dari tabel operasional | analytics | P1 | tidak |
| T-10 | Nol test keamanan file | QA | P1 | tidak |
| T-11 | Nol scan keamanan/SBOM/signing di CI | supply chain | P1 | sebagian (FASE 13) |
| T-12 | 5 runbook wajib hilang, 3 sebagian | operasional | P2 | tidak |
| T-13 | Tidak ada alert cost/payment/shipment | operasional | P2 | tidak |
| T-14 | Seluruh syarat rilis main-branch hilang | rilis | P2 | sebagian (FASE 13) |
| T-15 | README menyebut worker yang tidak ada | dokumentasi | P3 | tidak |

Pola dominan: **struktur ada, wiring tidak ada** — sama seperti temuan FASE 4.
Lima temuan P0 semuanya berbentuk "kode/kolom sudah dibuat, tetapi tidak ada
yang memanggil atau mengisinya".

---

# BAGIAN 1 — Temuan P0

## T-01 `services/ai-gateway` tidak tersambung ke apa pun

**Kelas**: kode mati. **Severity**: P0.

Seluruh service (adapter model, guardrail, RAG, tool execution, budget cap)
tidak dipanggil dari mana pun.

Bukti:

```
# 1. siapa mengimpor paketnya
Get-ChildItem apps,packages,services,workers -Recurse -Include *.ts |
  Where-Object { $_.FullName -notmatch '\\node_modules\\' } |
  Select-String -Pattern "@chai/ai-gateway"
→ NOL pemanggil

# 2. siapa mendeklarasikannya sebagai dependency
Get-ChildItem apps,packages,services,workers -Recurse -Include package.json |
  Where-Object { $_.FullName -notmatch '\\node_modules\\' } |
  Select-String -Pattern "ai-gateway"
→ hanya services\ai-gateway\package.json baris "name" (dirinya sendiri)

# 3. siapa memanggil fungsi utamanya
Select-String -Pattern "createAiGateway|\.complete\("
→ services\ai-gateway\src\index.ts:45,94,115 + 3 file test saja
```

Artinya `apps/api` tidak bisa memanggil AI sama sekali — bukan karena salah
konfigurasi, tetapi karena dependency-nya tidak pernah dideklarasikan.

## T-02 Tidak ada pipeline balasan AI otomatis

**Kelas**: fitur inti hilang. **Severity**: P0.

Alur pesan masuk dilacak end-to-end:

```
ChannelsController.ingestWebhook
  → repository.ingest
    → ingestInboundEvent   (packages/domain/src/conversations/index.ts:77)
      → commitBusinessMutation:
          resolveContactId
          resolveActiveConversation
          appendInboundMessage
          audit  action    'message.received'
          outbox eventType 'message.received'
```

Jalur ini berhenti di situ. Tidak ada langkah yang memanggil model.

Dan tidak ada yang mengonsumsi event yang diterbitkan:

```
Select-String -Pattern "message\.received"
→ packages\domain\src\conversations\index.ts:73, 84, 100
  (ketiganya tempat event DIBUAT — nol consumer)
```

**Konsekuensi produk**: yang berjalan hari ini adalah inbox omnichannel (pesan
pelanggan tercatat, agen manusia membalas) plus eksekusi tool lewat
`POST /api/client/v1/actions/execute` yang dipicu dari luar. Klaim "AI customer
operations" belum didukung kode. Ini gap terbesar dan tidak tercakup FASE 1–26.

## T-03 `RedisStreamsConsumer` nol pemakai produksi

**Kelas**: kode mati. **Severity**: P0.

`packages/broker/src/consumer.ts` mengekspor `RedisStreamsConsumer` lengkap
dengan consumer group. Tidak ada yang memakainya:

```
Select-String -Pattern "createOutboxConsumer|consumeOutbox|startConsumer"
→ NOL hasil

# pemakai @chai/broker yang nyata:
apps\api\src\auth\auth-rate-limit.ts   (Redis untuk rate limit)
packages\broker\src\client.ts
workers\outbox-dispatcher\src\main.ts  (PUBLISHER, bukan consumer)
```

Jadi `outbox-dispatcher` menerbitkan event ke Redis Streams dan tidak ada yang
membacanya. Event menumpuk di stream tanpa pemroses. Ini akar dari T-02:
infrastruktur transport sudah ada, sisi konsumsinya tidak pernah dibangun.

## T-04 64 titik `@Body()` tanpa DTO — body tidak divalidasi

**Kelas**: validasi input. **Severity**: P0.

`ValidationPipe` global aktif dengan penjagaan ketat:

```
apps\api\src\bootstrap.ts:84  new ValidationPipe({
apps\api\src\bootstrap.ts:85    forbidNonWhitelisted: true,
apps\api\src\bootstrap.ts:87    whitelist: true,
```

Tetapi hanya ada **satu** file DTO di seluruh `apps/api`:

```
Get-ChildItem apps\api\src -Recurse -Include *.dto.ts
→ jumlah file .dto.ts: 1   (apps\api\src\auth\auth.dto.ts)
```

Sementara 64 handler memakai tipe TypeScript sebagai tipe body:

```
Select-String -Pattern "@Body\(\)\s*\w+:\s*(Omit<|Partial<|Pick<|Record<|\{)"
→ JUMLAH TITIK RAWAN: 64  (di 13 dari 42 controller)
```

Sebaran per controller: advanced-analytics 11, observability 9, enterprise 8,
ai-agent 6, multi-region 6, partner-ecosystem 6, sla 4, campaign 3, ticket 3,
attachment 2, contact-segment 2, notification 2, template 2.

**Mengapa ini bug, bukan gaya penulisan**: `Omit<>`, `Partial<>`, `Pick<>`,
`Record<>`, dan object literal inline adalah konstruksi tipe yang dihapus saat
kompilasi. Tidak ada class yang tersisa di runtime, sehingga `ValidationPipe`
tidak punya metadata untuk direfleksikan dan melewatkan body tanpa pemeriksaan.
`whitelist` dan `forbidNonWhitelisted` tidak berlaku. Klien bisa mengirim field
sembarang dan field itu diteruskan ke repository.

Ini melanggar `AGENTS.md` secara langsung: "`class-validator` + `ValidationPipe`
(`whitelist` + `forbidNonWhitelisted`) untuk body HTTP di `apps/api`".

Catatan hubungan dengan FASE 1.5: bug esbuild `emitDecoratorMetadata` yang sudah
diperbaiki adalah **prasyarat** agar validasi bekerja, bukan penyelesaiannya.
Dengan plugin SWC terpasang, rute `auth` kini benar-benar tervalidasi; 64 titik
ini tetap tidak tervalidasi karena memang tidak punya class DTO.

## T-05 Kolom keamanan attachment dikendalikan klien

**Kelas**: keamanan. **Severity**: P0.

Skema sudah dirancang mengantisipasi MIME spoofing:

```
mime_declared   text
mime_detected   text
checksum        text
byte_size       integer
scan_status     'PENDING' | 'CLEAN' | 'INFECTED' | 'FAILED'
```

Tetapi tidak ada kode produksi yang mengisinya:

```
Select-String -Pattern "mimeDetected|scanStatus|scan_status"
  (seluruh apps, packages, services, workers)
→ 30 hasil, SEMUANYA di:
   - apps\api\src\modules\attachment\attachment.repository.ts          (definisi tipe)
   - apps\api\src\modules\attachment\postgres-attachment.repository.ts (CRUD)
   - apps\api\test\attachment.test.ts, test\integration\attachment.integration.test.ts
→ NOL kode yang melakukan MIME sniffing atau virus scan
```

Digabung dengan T-04, controller-nya menerima nilai itu langsung dari klien:

```typescript
// apps/api/src/modules/attachment/attachment.controller.ts:26
@Post()
@RequirePermission('inbox.manage')
async create(
  @TenantId() tenantId: string,
  @Body() attachment: Omit<Attachment, 'id' | 'createdAt' | 'updatedAt'>,
) { return this.repo.createAttachment(tenantId, attachment); }

// baris 30
@Put(':id')
async update(..., @Body() update: Partial<Attachment>) { ... }
```

Yang bisa dilakukan pemegang `inbox.manage` hari ini:

- mengirim `scanStatus: 'CLEAN'` padahal tidak ada scanner yang pernah berjalan;
- mengirim `mimeDetected` palsu, sehingga perbandingan declared-vs-detected yang
  menjadi alasan keberadaan kedua kolom itu menjadi tidak bermakna;
- mengirim `checksum` dan `byteSize` yang tidak pernah diverifikasi terhadap byte
  sebenarnya;
- lewat `@Put(':id')`, mengubah `INFECTED` menjadi `CLEAN`.

`scan_status` saat ini adalah teater keamanan: kolomnya ada, penegakannya tidak.
Blueprint 12 §12 menuntut test MIME spoof, malware, decompression bomb, archive
traversal — nol di antaranya ada (lihat T-10), sehingga tidak ada yang menangkap
kondisi ini.

---

# BAGIAN 2 — Temuan P1

## T-06 `inbox-dispatcher` tidak memproses apa pun

**Kelas**: utang yang diketahui. **Severity**: P1.

Ini didokumentasikan dengan jujur di dalam kodenya sendiri
(`workers/inbox-dispatcher/src/main.ts`): efek domain dijalankan sinkron di API
edge; worker tidak punya payload store untuk merekonstruksi event mentah karena
`chai.inbox_event` hanya menyimpan `payload_reference` + hash. Handler
mengembalikan `'retry'` supaya event nyasar terlihat lewat jalur `DEAD_LETTER`
alih-alih di-ack diam-diam. Komentarnya menyebut: "Real async processing is
BLOCKED on a restricted payload store".

Dicatat bukan sebagai kejutan, melainkan karena T-02 tidak bisa diselesaikan
tanpa memutuskan hal yang sama: **di mana payload pesan disimpan** agar pemroses
asinkron bisa membacanya.

## T-07 Nol fact table dari 18 yang diminta

**Kelas**: analytics. **Severity**: P1.

Blueprint 11 menuntut 18 fact event kanonik (`message_fact`,
`ai_generation_fact`, `payment_request_fact`, `shipment_fact`, dan seterusnya).

```
Select-String -Path packages\database\migrations\*.sql -Pattern "_fact"
→ satu-satunya hasil: chai.user_mfa_factor
  (false positive — substring "factor", tidak ada kaitan dengan analytics)
```

Tabel bernama analytics yang ada — `analytics_dashboard`, `analytics_report`,
`analytics_report_execution` — adalah CRUD konfigurasi dashboard, bukan fact.

## T-08 5 dari 33 metrik terdefinisi

**Kelas**: analytics. **Severity**: P1.

Blueprint 11 §4.1–§4.33 mendefinisikan 33 metrik. Yang ada di
`packages/domain/src/analytics`:

```
automationRate, qualificationRate, conversionRate, averageCsat,
bookingExceptionRate
```

28 metrik belum ada, termasuk seluruh kelompok pembayaran (§4.23–§4.27: payment
conversion, time to pay, payment-attributed value, failure/expiry rate,
reconciliation mismatch) dan seluruh kelompok logistik (§4.28–§4.33: delivered
rate, on-time delivery, exception rate, stale shipment, exception resolution
time, tracking self-service containment).

Sisi positif: `MetricLineage` sudah ada, sehingga prinsip blueprint "denominator
visible" terpenuhi untuk 5 metrik yang ada. Ini pola yang benar dan layak
dipertahankan saat menambah metrik baru.

## T-09 Metrik dihitung langsung dari tabel operasional

**Kelas**: analytics. **Severity**: P1.

`postgres-analytics.repository.ts` menghitung metrik dengan query langsung:

```sql
SELECT mode, status, resolved_at, last_message_at   -- chai.conversation
SELECT stage, status FROM chai.lead
SELECT status, starts_at, ends_at FROM chai.appointment
```

Ini melanggar prinsip blueprint "operational and analytical stores are
separated". Tiga akibat konkret:

1. tidak ada time-series — hanya snapshot keadaan sekarang, sehingga tren dan
   perbandingan antar-kohort tidak mungkin;
2. angka historis berubah ketika baris operasional diubah atau diarsipkan;
3. beban query analitik jatuh ke tabel yang melayani inbox.

`workers/analytics-worker` tidak menutup celah ini — isinya hanya
`burn-rate-harvester.ts` (budget AI), dan grep `INSERT INTO` di worker itu tidak
menghasilkan apa pun.

Catatan: `InMemoryAnalyticsRepository` memakai `sourceUntil` yang dipatok
`'2026-07-19T00:00:00.000Z'`.

## T-10 Nol test keamanan file

**Kelas**: QA. **Severity**: P1.

Blueprint 12 §12 menuntut test untuk MIME spoof, malware, oversized, corrupt,
archive traversal, decompression bomb, SVG/HTML script, password-protected,
SSRF URL, redirect chain, timeout.

```
Select-String -Pattern "mime.?spoof|decompression|zip.?bomb|archive.?traversal|malware"
  (760 file sumber)
→ tidak ada hasil
```

Ini bukan gap yang bisa diabaikan sebagai "fitur belum ada": modul `attachment`
sudah berjalan dengan 4 endpoint. Tidak adanya test inilah yang membuat T-05
tidak terdeteksi.

## T-11 Nol scan keamanan, SBOM, atau signing di CI

**Kelas**: supply chain. **Severity**: P1.

```
Select-String -Path .github\workflows\ci.yml `
  -Pattern "audit|snyk|trivy|codeql|gitleaks|sbom|cosign|semgrep"
→ TIDAK ADA satu pun scan keamanan/SBOM/signing di CI
```

CI nyata (1 job `verify`, 10 step) kuat pada gerbang kualitas kode, dan memenuhi
poin 1, 2, 3, 5, 6 dari blueprint §4:

```
pnpm install --frozen-lockfile
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run test
pnpm run verify:infra
pnpm --filter @chai/database run test:integration
pnpm --filter @chai/domain   run test:integration
pnpm --filter @chai/api      run test:integration
pnpm --filter @chai/api      run test:e2e
```

Yang hilang: poin 7 (security/secret/dependency scan) total, poin 8 (build image
container — yang ada hanya build aplikasi), poin 9 (preview environment), poin 10
(required review, perlu branch protection). Poin 4 (schema/OpenAPI/event
validation) terpenuhi sebagian lewat `verify:infra`.

Perlu diingat: `git remote -v` masih **kosong**, sehingga CI belum pernah
dieksekusi satu kali pun. Ini konsisten dengan FASE 13 yang terblokir pemilik
repo.

---

# BAGIAN 3 — Temuan P2 dan P3

## T-12 Lima runbook wajib hilang, tiga sebagian

**Kelas**: operasional. **Severity**: P2.

Blueprint 13 §15–§24 menuntut 10 runbook. Ada 11 file di `docs/runbooks`.
Pemetaannya:

| Blueprint | Status | Berkas |
|---|---|---|
| §15 Cross-tenant exposure | ADA | `isolation-incident.md` |
| §16 Webhook backlog | SEBAGIAN | disinggung di `automation-worker.md`, `provider-outage.md` |
| §17 AI provider outage | ADA | `provider-outage.md`, `kill-switch.md` |
| §18 Community Gateway disconnected | HILANG | — (wajar: WAHA belum dibangun, FASE 25) |
| §19 Meta token/permission failure | HILANG | — (terkait FASE 17) |
| §20 Queue item in DLQ | SEBAGIAN | hanya disinggung `load-and-chaos.md` |
| §21 Database degradation | HILANG | — |
| §22 Cost spike | HILANG | — |
| §23 Payment webhook/reconciliation mismatch | SEBAGIAN | disinggung `provider-outage.md` |
| §24 Shipment tracking stale | HILANG | — |

"SEBAGIAN" berarti topiknya disebut dalam runbook lain, bukan ada prosedur
tersendiri dengan langkah diagnosis dan pemulihan.

Dua yang hilang punya alasan sah (§18 dan §19 menunggu fitur dibangun). Tiga
sisanya — database degradation, cost spike, shipment stale — adalah gap tanpa
alasan; ketiganya bisa terjadi hari ini di sistem yang sudah berjalan.

## T-13 Tidak ada alert untuk cost, payment, atau shipment

**Kelas**: operasional. **Severity**: P2.

11 alert terdefinisi di `infra/monitoring`:

```
SuspectedCrossTenantExposure   DatabaseUnavailable      WebhookIngestFailures
InboxQueueLag                  FollowUpJobBacklogHigh   FollowUpJobFailedSpike
FollowUpJobStuckClaimed        KnowledgeFailedDocsHigh  RealtimeGatewayDown
RealtimeIngestErrorRateHigh    RealtimeSseConnectionsMissing
```

Tidak ada alert untuk lonjakan biaya, ketidakcocokan rekonsiliasi pembayaran,
atau pengiriman yang macet. Ini sejajar dengan runbook §22/§23/§24 yang hilang:
tidak ada yang memberi tahu, dan tidak ada prosedur ketika diberi tahu.

Infrastruktur monitoring sendiri bukan gap — `prometheus.yml`,
`otel-collector.yaml`, `alerts.yml`, dan dashboard `stage-2-workers.json` ada,
termasuk IaC di `infra/opentofu`.

## T-14 Seluruh syarat rilis main-branch hilang

**Kelas**: rilis. **Severity**: P2.

Blueprint 13 §4 menuntut untuk main branch: immutable version/tag, SBOM, signed
container, migration artifact, release notes, deploy staging, smoke/E2E. Tidak
ada satu pun di `ci.yml` selain `test:e2e` yang berjalan sebagai bagian dari
`verify` (bukan setelah deploy staging).

Sebagian tumpang tindih dengan FASE 13, tetapi FASE 13 hanya mencakup
"menjalankan CI", bukan membangun rantai rilis.

## T-15 README menyebut worker yang tidak ada

**Kelas**: dokumentasi. **Severity**: P3.

README menulis: "plus worker channel, payment, logistics, analytics, automation,
**media**, dan **Temporal**".

```
Get-ChildItem workers -Directory
→ analytics-worker  automation-worker  channel-worker  inbox-dispatcher
  logistics-worker  outbox-dispatcher  payment-worker
```

Tujuh worker; `media` dan `Temporal` tidak ada. Perlu diperbaiki karena FASE 20
(workflow durable) dalam rencana mengasumsikan Temporal sebagai pilihan yang
belum diputuskan — README yang menyebutnya sudah ada bisa menyesatkan.

---

# BAGIAN 4 — Catatan metode

Dua kesalahan pengukuran yang saya lakukan dan koreksinya, dicatat supaya audit
berikutnya tidak mengulang:

**1. `node_modules` tetap ikut terpindai di monorepo pnpm.** Setiap paket punya
`node_modules` sendiri, sehingga `Get-ChildItem apps\... -Recurse` tetap masuk ke
dependency. Hitungan pertama saya menghasilkan 4885 "match visual regression"
yang sepenuhnya palsu. Bentuk yang benar:

```powershell
Get-ChildItem apps,packages,services,workers -Recurse -Include *.ts,*.tsx |
  Where-Object { $_.FullName -notmatch '\\node_modules\\' -and
                 $_.FullName -notmatch '\\dist\\' -and
                 $_.FullName -notmatch '\\.next\\' }
```

Angka acuan sesudah difilter: **760 file sumber**.

**2. `Get-ChildItem . -Recurse` mengeluarkan ratusan error** dari symlink
`node_modules/.pnpm` yang menggantung. Sebutkan folder sumber secara eksplisit.

Keduanya sudah dimasukkan sebagai aturan 0.4 di
`docs/plans/2026-07-31-panduan-eksekusi-agent-fase-5-26.md`.

---

# BAGIAN 5 — Hubungan dengan audit sebelumnya

Temuan di sini **tidak mengubah** status REQ mana pun di
`DAFTAR-CELAH-MASTER.md`, karena blueprint 11/12/13 tidak pernah diekstrak
menjadi REQ. Jadi statistik audit lama (tabel §1: 17 TERPENUHI / 159 SEBAGIAN /
42 HILANG dari 244 baris REQ) tetap berlaku apa adanya.

Yang berubah adalah **cakupan**: sebelum ini, 1.337 baris blueprint tidak pernah
diperiksa. Rekonsiliasi penomoran REQ untuk area baru ini adalah keputusan
manusia, bukan tugas agent.

Rencana implementasinya ada di
`docs/plans/2026-07-31-rencana-fase-27-33.md`.
