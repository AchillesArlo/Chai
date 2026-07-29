# Jalur B — Kontrak API & Realtime, Event/Otomasi/Jobs

> Audit terhadap `Omnichannel_AI_Platform_Engineering_Blueprint_v1.2/06_API_AND_REALTIME_CONTRACT.md` (482 baris)
> dan `07_EVENTS_AUTOMATIONS_AND_JOBS.md` (545 baris). Metode: `docs/plans/2026-07-27-rencana-audit-blueprint.md` §3 dan §10.
> Read-only. Bukti = path:baris atau perintah + keluaran. Dokumen internal (README, dokumen remediasi) **bukan** bukti.
> ADR/DEC yang dinilai jalur ini: ADR-006 (REST+Realtime), ADR-007 (Inbox/Outbox), ADR-008 (BullMQ→Temporal), ADR-021 (Contract-First), DEC/GAP-006 & GAP-015 (idempotency/UNKNOWN_RESULT).

Kedua dokumen dibaca dari baris pertama sampai terakhir (dalam potongan berurutan). Tidak ada bagian yang dilewati.

Fokus terverifikasi: bentuk envelope, idempotency (header/request-hash/UNKNOWN_RESULT), operation-state lima status, inbox/outbox transaksional, SSE replay `Last-Event-ID`, DLQ, kontrak event kanonik.

Catatan faktual yang diperiksa terhadap blueprint: payload `message.created` kini payload-by-reference (hanya `messageId`, tanpa teks). Diverifikasi **selaras** dengan 07 §1 — bukan penyimpangan (lihat REQ-06-011 & REQ-07-002).

---

## Ringkasan Jalur B

### Dokumen 06 — API and Realtime Contract

| ID | Persyaratan | Kelas | Severity |
|---|---|---|---|
| REQ-06-001 | Bentuk response envelope (single `data/meta{request_id,freshness_at}`, collection `page{next_cursor,has_more}`) | SEBAGIAN | MEDIUM |
| REQ-06-002 | Error contract problem-details + kode kanonik | SEBAGIAN | MEDIUM |
| REQ-06-003 | Mutasi klien membawa `Idempotency-Key` | TERPENUHI | - |
| REQ-06-004 | Kunci sama + request beda → `IDEMPOTENCY_CONFLICT` | TERPENUHI | - |
| REQ-06-005 | Concurrency optimistik `If-Match`/`expected_version` | TERPENUHI | - |
| REQ-06-006 | Correlation ID diterima/dibangkitkan/dikembalikan | SEBAGIAN | LOW |
| REQ-06-007 | Page size maks 100/default 25 + cursor buram | SEBAGIAN | MEDIUM |
| REQ-06-008 | Realtime reconnect via `last_event_id` + replay window terbatas | TERPENUHI | - |
| REQ-06-009 | Klien menerapkan event hanya bila versi lebih baru, else refetch | TERPENUHI | - |
| REQ-06-010 | Event kanonik benar-benar terkirim ke subscriber (end-to-end) | SEBAGIAN | HIGH |
| REQ-06-011 | `message.created` payload = message resource (privasi by-reference) | TERPENUHI | - |
| REQ-06-012 | Session bootstrap mengembalikan permission efektif + hint | SEBAGIAN | MEDIUM |
| REQ-06-013 | Owner API DLQ: `GET /dead-letters`, `POST /dead-letters/:id/replay` | HILANG | MEDIUM |
| REQ-06-014 | Webhook: persist inbox sebelum ack; tak ada aksi konektor sebelum ack; dedup | TERPENUHI | - |
| REQ-06-015 | Skema event membawa versi; konsumen enum menangani UNKNOWN | SEBAGIAN | LOW |
| REQ-06-016 | Audit contract mutasi (actor/tenant/action/object/reason/diff/correlation) | SEBAGIAN | MEDIUM |

### Dokumen 07 — Events, Automations, and Jobs

| ID | Persyaratan | Kelas | Severity |
|---|---|---|---|
| REQ-07-001 | Outbox: mutasi + audit + event dalam SATU transaksi (ADR-007) | TERPENUHI | - |
| REQ-07-002 | Inbox: event terverifikasi persist dengan unique key, duplikat balikkan ack | TERPENUHI | - |
| REQ-07-003 | Envelope event kanonik (correlation_id, causation_id, actor, occurred_at, ...) | SEBAGIAN | MEDIUM |
| REQ-07-004 | Publisher outbox: claim → publish → mark published → retry aman → pantau usia | TERPENUHI | - |
| REQ-07-005 | Efek sampingan tak pasti rekonsiliasi sebelum retry (`UNKNOWN_RESULT`) | TERPENUHI | - |
| REQ-07-006 | `PAID` tak pernah mundur; status terminal tetap terminal | TERPENUHI | - |
| REQ-07-007 | Layar DLQ + tata kelola replay (reason, dry-run, replay tertaut) | SEBAGIAN | MEDIUM |
| REQ-07-008 | Kebijakan retry: backoff, jitter, max attempts, Retry-After, circuit breaker, DLQ | SEBAGIAN | MEDIUM |
| REQ-07-009 | Topologi antrean 15 queue (prioritas, ordering key, retry) | SEBAGIAN | MEDIUM |
| REQ-07-010 | Temporal untuk workflow durable multi-hari (ADR-008) | HILANG | MEDIUM |
| REQ-07-011 | BullMQ untuk kerja async pendek (ADR-008) | HILANG | LOW |
| REQ-07-012 | Kontrak integrasi n8n (allowed/forbidden, callback bertanda) | HILANG | LOW |
| REQ-07-013 | Model definisi otomasi immutable + lifecycle DRAFT→VALIDATED→PUBLISHED→DEPRECATED | SEBAGIAN | MEDIUM |
| REQ-07-014 | Enam template otomasi MVP + kosakata stop-reason | HILANG | MEDIUM |
| REQ-07-015 | Workflow booking durable (states + kompensasi) | HILANG | MEDIUM |
| REQ-07-016 | Workflow data-deletion & export durable | TIDAK-TERVERIFIKASI | MEDIUM |
| REQ-07-017 | Monitoring: queue depth/lag, oldest job, outbox unpublished age, DLQ growth | SEBAGIAN | LOW |

Pra-isi §5 relevan jalur B: **K-10** (generator ID `Math.random`) — diverifikasi ulang, lihat bagian akhir.

---

## Dokumen 06 — API and Realtime Contract

### REQ-06-001 — Bentuk response envelope — SEBAGIAN — MEDIUM

**Persyaratan** (`06_API §4`): single resource `{ "data": { "id","type","version","attributes" }, "meta": { "request_id","freshness_at" } }`; collection `{ "data": [], "page": { "next_cursor","has_more" }, "meta": { "request_id" } }`.

**Kondisi nyata**: Interceptor global membungkus setiap hasil sebagai `{ data, meta: { correlationId } }` saja — tanpa `request_id`, tanpa `freshness_at`, tanpa amplop `page` untuk koleksi.

**Bukti**:
- `apps/api/src/common/response-envelope.interceptor.ts:14-18` — `map((data) => ({ data, meta: { correlationId: request.correlationId } }))`.
- `apps/api/src/app.module.ts:107` — `ResponseEnvelopeInterceptor` terpasang sebagai `APP_INTERCEPTOR` (jadi benar-benar terpanggil di jalur produksi).
- `packages/contracts/src/api/envelope.ts:5-18` — `ApiMetaSchema = z.strictObject({ correlationId })`; `apiSuccessEnvelopeSchema` hanya `{ data, meta }`. Tidak ada skema `page`/`next_cursor`/`has_more`/`freshness_at`.

**Yang kurang**: `meta.request_id` dan `meta.freshness_at`; amplop koleksi `page: { next_cursor, has_more }`. (Nama `correlationId` menggantikan `request_id`; keduanya tidak keduanya hadir.)

### REQ-06-002 — Error contract problem-details + kode kanonik — SEBAGIAN — MEDIUM

**Persyaratan** (`06_API §5`): "Use problem-details style" dengan field `type,title,status,code,detail,request_id,correlation_id,errors`, dan tabel 15 kode kanonik (`VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `VALIDATION_FAILED`, `RESOURCE_NOT_FOUND`, `TEMPORARILY_UNAVAILABLE`, dst.).

**Kondisi nyata**: Filter error global memancarkan `{ error: { code, correlationId, message, retryable } }` — bukan bentuk problem-details, dan peta kode default berbeda nama dari kanonik.

**Bukti**:
- `apps/api/src/common/error.filter.ts:70-82` — body respons `{ error: { code, correlationId, message, retryable } }`. Tidak ada `type/title/status/detail/errors`.
- `apps/api/src/common/error.filter.ts:10-18` — peta status→kode memakai `VALIDATION_ERROR` (bukan `VALIDATION_FAILED`), `NOT_FOUND` (bukan `RESOURCE_NOT_FOUND`), `CONFLICT` (generik), `SERVICE_UNAVAILABLE` (bukan `TEMPORARILY_UNAVAILABLE`).
- `apps/api/src/app.module.ts:108` — `ApiErrorFilter` terpasang `APP_FILTER` (terpanggil).
- Sisi positif: kode kanonik spesifik dipancarkan oleh controller saat relevan — `channels.controller.ts:151-152` (`IDEMPOTENCY_CONFLICT`), `:149-150` (`VERSION_CONFLICT`); `common/concurrency.ts` memancarkan `PRECONDITION_REQUIRED`/`VALIDATION_FAILED`.

**Yang kurang**: adopsi bentuk problem-details (`type/title/status/detail/errors`) dan penyelarasan nama peta-kode default filter ke kosakata kanonik.

### REQ-06-003 — Mutasi klien membawa Idempotency-Key — TERPENUHI — -

**Persyaratan** (`06_API §3`): "Client-generated mutation request uses Idempotency-Key."

**Kondisi nyata**: Interceptor global menolak mutasi (non-GET/HEAD/OPTIONS) tanpa `Idempotency-Key` yang valid, kecuali rute auth dan rute service (yang diverifikasi tanda tangan provider + dedup inbox).

**Bukti**:
- `apps/api/src/common/idempotency.interceptor.ts:50-58` — `throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED' })` bila header hilang/tak cocok pola `^[A-Za-z0-9._:-]{8,200}$`.
- `apps/api/src/app.module.ts:105` — `IdempotencyKeyInterceptor` `APP_INTERCEPTOR` (terpanggil untuk semua rute).
- `apps/api/src/common/idempotency.interceptor.test.ts:26-38` — tes menegakkan GET lolos, POST tanpa key ditolak, POST dengan key valid lolos.
- Controller memperkuat: `channels.controller.ts:138-141` menolak `sendMessage` tanpa key.

### REQ-06-004 — IDEMPOTENCY_CONFLICT untuk kunci sama + request beda — TERPENUHI — -

**Persyaratan** (`06_API §5`): `IDEMPOTENCY_CONFLICT | 409 | Same key, different request`.

**Kondisi nyata**: Store idempotensi menghitung `request_hash` (stable stringify) dan mengembalikan `CONFLICT` bila kunci ada tetapi hash berbeda; controller memetakannya ke `409 IDEMPOTENCY_CONFLICT`.

**Bukti**:
- `packages/domain/src/idempotency/store.ts:35-40` — `requestHash` sha256 atas kanonikalisasi (urutan kunci tak mengubah hash).
- `packages/domain/src/idempotency/store.ts:175-185` — `findRecord`: `existing.request_hash !== hash` → `{ outcome: 'CONFLICT' }`.
- `apps/api/src/modules/channels/postgres-conversation.repository.ts:216-224` — `claimIdempotentOperation(...)` dipanggil di jalur produksi; `CONFLICT` → `{ kind: 'idempotency_conflict' }`.
- `apps/api/src/modules/channels/channels.controller.ts:151-152` — `throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT' })`.
- Tes penegak: `apps/api/test/conversation-reply.e2e.test.ts:176` — `expect(conflict.json().error.code).toBe('IDEMPOTENCY_CONFLICT')`.
- Perlindungan DB: `packages/database/src/schema/idempotency.ts:90-96` — kolom `request_hash` + unique `(tenant_id,audience,operation,idempotency_key)`.

### REQ-06-005 — Concurrency optimistik If-Match/expected_version — TERPENUHI — -

**Persyaratan** (`06_API §3`): "Optimistic mutation uses If-Match or expected_version."

**Kondisi nyata**: Helper `resolveExpectedVersion` membaca `If-Match` (kanonik), menerima `expectedVersion` sebagai fallback, memaksa 428 bila keduanya hilang, dan menolak bila keduanya tak sepakat. Dipakai di controller reply; ketidakcocokan versi dipetakan ke `VERSION_CONFLICT`.

**Bukti**:
- `apps/api/src/common/concurrency.ts:17-46` — `If-Match` diprioritaskan; hilang keduanya → `428 PRECONDITION_REQUIRED`; tak sepakat → `VALIDATION_FAILED`.
- `apps/api/src/modules/channels/channels.controller.ts:129-135` — `resolveExpectedVersion(request, body.expectedVersion)` dipanggil di `sendMessage` (produksi).
- `apps/api/src/modules/channels/postgres-conversation.repository.ts:262-266,288-292` — guard versi di dalam transaksi; balapan kalah → `version_conflict`.
- `channels.controller.ts:149-150` — `ConflictException({ code: 'VERSION_CONFLICT' })`.

### REQ-06-006 — Correlation ID diterima/dibangkitkan/dikembalikan — SEBAGIAN — LOW

**Persyaratan** (`06_API §3` + tabel header): "Correlation ID accepted/generated and returned"; header respons `X-Request-Id`; `Retry-After` untuk throttle.

**Kondisi nyata**: `x-correlation-id` diterima (divalidasi UUIDv7) atau dibangkitkan, dan dikembalikan sebagai header respons. Namun `X-Request-Id` (header respons terpisah) tidak diset, dan `request_id`/`freshness_at` tidak ada di meta.

**Bukti**:
- `apps/api/src/common/correlation.ts:6-11` — hook `onRequest` set `request.correlationId` (dari header atau `uuidV7()`) dan `reply.header('x-correlation-id', ...)`.
- Tidak ditemukan penyetelan `x-request-id` sebagai header respons di jalur umum (hanya `correlationId` yang dibawa; lihat REQ-06-001).

**Yang kurang**: header respons `X-Request-Id` yang berbeda dari correlation id; pemeriksaan `Retry-After` throttle belum diverifikasi di sini (tak terlihat di filter error).

### REQ-06-007 — Page size maks 100/default 25 + cursor buram — SEBAGIAN — MEDIUM

**Persyaratan** (`06_API §3`, §6): "Maximum page size 100; default 25"; "Cursor opaque and bound to filter/sort."

**Kondisi nyata**: Endpoint daftar yang diperiksa memakai `LIMIT` tetap tanpa cursor, page meta, atau parameter ukuran halaman.

**Bukti**:
- `apps/api/src/modules/channels/postgres-conversation.repository.ts:126-138` — `listConversations` memakai `ORDER BY c.last_message_at DESC LIMIT 100` (keras), tanpa `next_cursor`/`has_more`/param ukuran.
- Amplop `page` tidak ada di kontrak (lihat REQ-06-001; `packages/contracts/src/api/envelope.ts` tak punya skema koleksi).

**Yang kurang**: konvensi paginasi cursor buram + `page.has_more` + default 25/maks 100 di lapisan daftar dan kontrak.

### REQ-06-008 — Realtime reconnect via last_event_id + replay window terbatas — TERPENUHI — -

**Persyaratan** (`06_API §11`): "reconnect with last_event_id"; window replay per-tenant yang bertahan lintas proses.

**Kondisi nyata**: Gateway SSE membaca header `Last-Event-ID` sebagai cursor, mendeteksi gap (cursor melewati retensi) → mengirim `refetch-required`, jika tidak me-replay dari store durable Postgres yang di-scope RLS.

**Bukti**:
- `apps/realtime-gateway/src/main.ts:112-140` — `const cursorHeader = request.headers['last-event-id']`; `if (cursor && await store.hasGap(...)) → serializeRefetchRequired`; else `store.replay(tenantId, position, REPLAY_LIMIT)`.
- `apps/realtime-gateway/src/main.ts:196-214` — `resolveEventStore` **wajib** `DATABASE_URL` → `PostgresRealtimeEventStore` (in-memory hanya untuk tes).
- `packages/domain/src/realtime/event-store.ts:37-108` — `append`/`replay`/`hasGap` per-tenant di `chai.realtime_event` dalam transaksi ber-RLS; urut `seq`.
- `packages/database/migrations/0042_realtime_event.sql:14-40` — tabel `chai.realtime_event` + RLS FORCE + retensi via prune (worker-only DELETE).

### REQ-06-009 — Terapkan event hanya bila versi lebih baru, else refetch — TERPENUHI — -

**Persyaratan** (`06_API §11`): "Client applies event only if version is newer; otherwise refetch."

**Kondisi nyata**: Frame SSE membawa `{ aggregateId, version, payload }` dan `id` telanjang untuk `Last-Event-ID`; helper gate versi memutuskan APPLY/IGNORE_STALE/REFETCH_REQUIRED.

**Bukti**:
- `apps/realtime-gateway/src/sse.ts:15-27` — `serializeServerSentEvent` menaruh `version` di frame `data` dan `id` = event id.
- `packages/contracts/src/realtime/envelope.ts:41-58` — `decideVersionGate`: `<= seen` → IGNORE_STALE; `seen+1` → APPLY; gap → REFETCH_REQUIRED; tanpa versi → APPLY.
- `apps/realtime-gateway/src/sse.ts:30-33` — `serializeRefetchRequired` untuk control event.

### REQ-06-010 — Event kanonik terkirim ke subscriber (end-to-end) — SEBAGIAN — HIGH

**Persyaratan** (`06_API §11`, ADR-006): kanal realtime (tenant/queue/conversation/user/owner) mengirim event kanonik ke klien; SSE untuk update langsung.

**Kondisi nyata**: Mekanisme replay window durable ada dan ter-wire di gateway, **tetapi tidak ada produsen produksi yang mengisinya**. Satu-satunya penulis window (`/publish/:tenantId`) hanya dipanggil di tes; jalur bus in-process tak bisa melintasi proses; stream outbox Redis tak punya konsumen produksi.

**Bukti**:
- `apps/realtime-gateway/src/main.ts:154-172` — penulisan window hanya lewat `POST /publish/:tenantId` (`store.append`).
- Pemanggil `/publish/` (perintah): `Select-String -Path apps,workers,services,packages -Pattern '/publish/' -Include *.ts` → hanya berkas tes (`apps/realtime-gateway/test/gateway.test.ts:40,149`, `.../isolation/realtime-isolation.e2e.test.ts:38,88,99,111`). Nol pemanggil non-tes.
- `apps/api/src/modules/channels/realtime-publisher.ts:3,32` — `RealtimePublisher` memakai `realtimeBus.publish` (bukan store durable, bukan gateway).
- `apps/realtime-gateway/src/bus.ts:1,57` — `realtimeBus` adalah singleton `EventEmitter` in-process (`// ponytail: ... swap for Redis pub/sub when multi-instance`); publish di proses API tak sampai ke subscriber di proses lain.
- `apps/client-portal/src/app/api/realtime/conversations/route.ts:88` — subscribe `realtimeBus` di proses client-portal (proses berbeda dari `apps/api`).
- Konsumen stream outbox: `Select-String -Pattern 'RedisStreamsConsumer' -Include *.ts` → hanya definisi kelas `packages/broker/src/consumer.ts:56` + tes `packages/broker/test/redis-streams.integration.test.ts`. Nol wiring worker produksi.

**Yang kurang**: satu bridge produksi (konsumen stream outbox Redis) yang menulis event kanonik ke `chai.realtime_event`/`/publish`, sehingga event yang sudah dipublikasikan dispatcher benar-benar sampai ke klien SSE. Tanpa itu, kontrak realtime terbukti hidup hanya di tes.

### REQ-06-011 — message.created payload = message resource (privasi by-reference) — TERPENUHI — -

**Persyaratan** (`06_API §11`): `message.created | Payload minimum: message resource`. Dibaca bersama `07_EVENTS §1`: "Event payload is minimal and references large/sensitive data."

**Kondisi nyata**: Event `message.created` membawa referensi (`messageId`, `conversationId`, `direction`, `senderType`, `contentType`) — **tanpa teks pesan**. Ini justru menegakkan prinsip 07 §1 (minimal + referensi data sensitif) karena payload keluar ke stream Redis di luar RLS/pipeline retensi. **Bukan penyimpangan.**

**Bukti**:
- `apps/api/src/modules/channels/postgres-conversation.repository.ts:268-282` — payload `{ contentType, conversationId, direction, messageId, senderType }`; komentar eksplisit "Payload-by-reference: messageId only, never the message text ... Consumers ... read chai.message by messageId under tenant RLS."
- `apps/api/src/modules/channels/postgres-conversation.repository.ts:245-260` — event di-append via `commitBusinessMutation` (satu transaksi dengan mutasi + audit).
- Konsisten dengan 07 §1; penilaian: selaras, bukan gap. (Bukti pendukung untuk pra-isi K-03 milik Jalur A: jalur produksi outbound tak lagi memuat teks di payload.)

### REQ-06-012 — Session bootstrap mengembalikan permission efektif + hint — SEBAGIAN — MEDIUM

**Persyaratan** (`06_API §12`): session bootstrap mengembalikan "resource.action strings; entitlement flags; data masking hints; risk/approval hints for payment and logistics actions; provider freshness/reconciliation metadata."

**Kondisi nyata**: Endpoint session mengembalikan string permission `resource.action` dan `role`/`tenantId`, tetapi tidak entitlement flags, masking hints, atau risk/approval/freshness metadata. Rute bernama `/session`, bukan `/me` (06 §8).

**Bukti**:
- `apps/api/src/auth/session.controller.ts:14-22` (owner) dan `:29-45` (client) — respons `{ audience, permissions, role, tenantId }`; `permissions` = `permissionsForRole(...)`/`PLATFORM_OWNER_PERMISSIONS`.
- `GET /me`: `Select-String -Pattern "'me'|\"me\"|client/v1/me" -Include *.ts` → 0 hasil (rute yang ada adalah `/api/{owner,client}/v1/session`).

**Yang kurang**: entitlement flags, data masking hints, dan risk/approval + provider freshness metadata di payload bootstrap.

### REQ-06-013 — Owner API DLQ endpoints — HILANG — MEDIUM

**Persyaratan** (`06_API §7` katalog Owner): `GET /dead-letters` (DLQ) dan `POST /dead-letters/:id/replay` (Approved replay), di bawah audiens `PLATFORM_OWNER` (`/api/owner/v1`).

**Kondisi nyata**: Tidak ada rute owner `/dead-letters`. Satu-satunya permukaan DLQ adalah `internal/v1/dlq` beraudiens `service`.

**Bukti**:
- `apps/api/src/modules/dlq/dlq.controller.ts:14-16` — `@Controller('internal/v1/dlq')` `@RequireAudience('service')` `@RequirePermission('inbox.dispatch')`.
- Perintah: `Select-String -Path apps/api/src -Pattern 'dead-letters' -Include *.ts` → 0 hasil (token `dead-letter` hanya muncul sebagai komentar di `dlq.repository.ts` dan di tes).

**Yang kurang**: endpoint owner-facing `GET /dead-letters` dan `POST /dead-letters/:id/replay` di namespace `/api/owner/v1` dengan audiens owner.

### REQ-06-014 — Webhook: persist inbox sebelum ack; tak ada aksi konektor sebelum ack; dedup — TERPENUHI — -

**Persyaratan** (`06_API §10`): verifikasi tanda tangan; persist inbox event; kembalikan ack; "Never perform model/connector action before acknowledgement"; dedup by tenant + provider account + external event identity; quarantine skema tak dikenal.

**Kondisi nyata**: Edge webhook memverifikasi tanda tangan lewat adapter, mencatat event ke inbox transaksional sebelum efek domain, menandai PROCESSED dalam satu transaksi, lalu mengembalikan `accepted`; panggilan provider (kirim keluar) ditunda ke worker outbox. Dedup dijamin unique constraint; quarantine tersedia.

**Bukti**:
- `apps/api/src/modules/channels/channels.controller.ts:70-90` — `adapter.normalizeWebhook(...)`; `if (!verification.verified) throw WEBHOOK_REJECTED`; lalu `repository.ingest(event)`; return `{ accepted }`.
- `apps/api/src/modules/channels/postgres-conversation.repository.ts:76-114` — `recordInboxEvent` (persist) → `ingestInboundEvent` → `markInboxEventProcessed`, semua dalam satu `withTenantTransaction`.
- `packages/domain/src/inbox/producer.ts:60-95` — `INSERT ... ON CONFLICT (tenant_id,provider,provider_account_id,external_event_id) DO NOTHING`; duplikat → `{ duplicate: true }`.
- `packages/domain/src/inbox/producer.ts:118-127` — `quarantineInboxEvent` (status `QUARANTINED`).
- Panggilan provider ditunda: `apps/api/src/modules/shared/conversation.port.ts:44-49` — "the actual send to the provider is a worker's job via the outbox."

**Yang kurang**: penegakan eksplisit "max body & replay window" (06 §10) tidak terlihat di edge ini — sub-butir itu belum diverifikasi (bukan bagian klaim TERPENUHI di atas).

### REQ-06-015 — Skema event membawa versi; enum menangani UNKNOWN — SEBAGIAN — LOW

**Persyaratan** (`06_API §14`): "Event schemas carry version"; "Enum consumers must handle UNKNOWN."

**Kondisi nyata**: Event membawa `schema_version` di baris outbox dan wire Redis. Penanganan UNKNOWN ada untuk kode provider (payment/logistics fail-safe → `UNKNOWN_RESULT`), tetapi tidak ada penegakan generik "handle UNKNOWN" untuk konsumen enum kontrak.

**Bukti**:
- `packages/domain/src/outbox/producer.ts:52-70` — kolom `schema_version` diisi (`Math.max(1, ...)`).
- `packages/broker/src/outbox-stream.ts:52-70` — `schema_version` disandikan ke wire.
- `packages/contracts/src/events/envelope.ts:34` — `schemaVersion: z.int().positive()`.
- UNKNOWN provider: `workers/payment-worker/src/reconcile.ts:38-45` — nilai tak dikenal → `UNKNOWN_RESULT`.

**Yang kurang**: bukti bahwa konsumen enum kontrak (mis. status) secara sistematis menoleransi nilai `UNKNOWN` masa depan.

### REQ-06-016 — Audit contract mutasi — SEBAGIAN — MEDIUM

**Persyaratan** (`06_API §13`): mutasi menyediakan actor, tenant, action, object, reason untuk aksi terjaga, "before/after fields or diff reference", correlation ID.

**Kondisi nyata**: Entri audit ditulis dalam transaksi bisnis dengan actor/tenant/action/resource/reason/metadata/correlation. Namun "before/after fields or diff reference" tidak terstandardisasi di helper audit.

**Bukti**:
- `packages/domain/src/outbox/producer.ts:90-112` — `appendAuditEntry` menulis `actor_id, action, resource_type, resource_id, reason, correlation_id, metadata`.
- Dipakai produksi: `postgres-conversation.repository.ts:246-256` (audit `message.created`), `workers/payment-worker/src/reconcile.ts:180-193` (audit `payment.reconcile` + `reason`).
- `AuditEntryInput` (`producer.ts:20-30`) tidak punya field `before/after`/`diff` yang eksplisit — hanya `metadata` bebas.

**Yang kurang**: representasi before/after (atau diff reference) yang eksplisit dan konsisten pada entri audit mutasi.

---

## Dokumen 07 — Events, Automations, and Job Processing

### REQ-07-001 — Outbox: mutasi + audit + event dalam SATU transaksi — TERPENUHI — -

**Persyaratan** (`07_EVENTS §8`, ADR-007): transaksi domain = validate → mutate aggregate → append audit → append outbox event → commit; "Database outbox is authoritative until publication succeeds."

**Kondisi nyata**: `commitBusinessMutation` menjalankan mutasi, audit, dan event outbox dalam satu transaksi, dan **melempar** bila tidak ada event (mutasi tak teramati = defect). Dipakai di beberapa jalur produksi.

**Bukti**:
- `packages/domain/src/outbox/producer.ts:130-145` — `mutate()` → `appendAuditEntry` → loop `appendOutboxEvent`; `if (events.length === 0) throw 'BUSINESS_MUTATION_REQUIRES_EVENT'`.
- Call site produksi: `apps/api/src/modules/channels/postgres-conversation.repository.ts:245`, `packages/domain/src/conversations/index.ts:81` (ingest `message.received`), `workers/payment-worker/src/reconcile.ts:164`, `workers/logistics-worker/src/reconcile.ts:164`, `workers/analytics-worker/src/burn-rate-harvester.ts:47` (`appendOutboxEvent`).
- Baris outbox lahir `PENDING`: `packages/domain/src/outbox/producer.ts:72` (`'PENDING'`).

### REQ-07-002 — Inbox: persist event terverifikasi dengan unique key; duplikat balikkan ack — TERPENUHI — -

**Persyaratan** (`07_EVENTS §7`): resolve → verify → compute event key/hash → insert `inbox_event` unique → duplicate returns prior acknowledgement → new scheduled. Status inbox: RECEIVED/PROCESSING/PROCESSED/RETRY_WAIT/DEAD_LETTER/IGNORED.

**Kondisi nyata**: `recordInboxEvent` menghitung hash integritas, insert dengan unique `(tenant,provider,account,external_event_id)`, `ON CONFLICT DO NOTHING`, dan mengembalikan `duplicate`. Dipanggil di edge webhook. Set status semantik lengkap tetapi **tiga nama berbeda** dari spesifikasi.

**Bukti**:
- `packages/domain/src/inbox/producer.ts:36-42` — `inboxPayloadHash` (`sha256:<hex>`).
- `packages/domain/src/inbox/producer.ts:60-95` — insert unique + `ON CONFLICT DO NOTHING` + jalur `duplicate`.
- Call site: `apps/api/src/modules/channels/postgres-conversation.repository.ts:84` (edge webhook, lihat REQ-06-014).
- Status: `packages/database/src/schema/inbox.ts:52-55` — CHECK `('PENDING','PROCESSING','PROCESSED','RETRY','DEAD_LETTER','QUARANTINED')`.

**Yang kurang**: penyelarasan nama status ke kosakata spesifikasi — `PENDING`↔`RECEIVED`, `RETRY`↔`RETRY_WAIT`, `QUARANTINED`↔`IGNORED` (semantik setara, nama beda). Severity rendah; catat sebagai penyimpangan penamaan, bukan fungsi.

### REQ-07-003 — Envelope event kanonik lengkap — SEBAGIAN — MEDIUM

**Persyaratan** (`07_EVENTS §2`): envelope kanonik memuat `event_id, event_type, schema_version, tenant_id, aggregate{type,id,version}, occurred_at, published_at, correlation_id, causation_id, actor{type,id}, data`.

**Kondisi nyata**: Skema `CanonicalEventSchema` mendefinisikan seluruh field, tetapi **hanya dipakai di tes/generator JSON-schema** — bukan di jalur produksi. Baris outbox aktif (`chai.outbox_event`) dan wire Redis **tidak** membawa `correlation_id`, `causation_id`, `actor`, maupun `occurred_at`.

**Bukti**:
- `packages/contracts/src/events/envelope.ts:23-37` — `CanonicalEventSchema` (lengkap; `actor.type` enum `USER|SERVICE|SYSTEM|PROVIDER|AI`).
- Call site `CanonicalEventSchema`: `Select-String -Pattern 'CanonicalEventSchema'` → hanya `contracts.test.ts`, `generate-json-schema.ts`, `json-schema.test.ts`. Nol di produsen/dispatcher/broker.
- `packages/domain/src/outbox/producer.ts:52-79` — `INSERT INTO chai.outbox_event (...)` hanya `event_type, schema_version, aggregate_*, partition_key, payload, status, traceparent`. Tak ada `correlation_id/causation_id/actor/occurred_at`.
- `packages/broker/src/outbox-stream.ts:52-71` — `encodeOutboxFields` memancarkan `event_id,tenant_id,event_type,schema_version,aggregate_*,partition_key,payload,traceparent` saja.
- Tabel legacy `outbox_events`/`domain_events` (`migrations/0034_outbox.sql`, `0035_command_events.sql`) memang punya kolom `correlation_id/causation_id` tetapi **bukan** tabel yang dipakai kode (`chai.outbox_event` adalah yang aktif).

**Yang kurang**: memuat `correlation_id`, `causation_id`, `actor`, dan `occurred_at` pada baris outbox aktif + wire, dan memvalidasi terhadap `CanonicalEventSchema` di jalur produksi.

### REQ-07-004 — Publisher outbox: claim → publish → mark → retry aman → pantau usia — TERPENUHI — -

**Persyaratan** (`07_EVENTS §8`): publisher "claims available rows; publishes/enqueues; marks published; retries safely; monitors oldest unpublished age."

**Kondisi nyata**: Dispatcher meng-claim batch di bawah lease (`FOR UPDATE SKIP LOCKED`, urut partition_key), publish ke Redis Streams, menandai PUBLISHED **hanya** saat broker benar-benar ack, dan retry → DEAD_LETTER melewati budget. Usia unpublished tertua dipantau via SLI.

**Bukti**:
- `packages/domain/src/outbox/dispatcher.ts:40-92` — `claimOutboxBatch` (`FOR UPDATE SKIP LOCKED`, `ORDER BY partition_key, available_at`), `markOutboxEventPublished` (hanya dari `PROCESSING`), `retryOutboxEvent` (`attempts >= maxAttempts → 'DEAD_LETTER'`), `reclaimStaleOutboxLeases`.
- `packages/broker/src/publisher.ts:60-84` — `XADD` mengembalikan id → `'acked'`, selain itu `'failed'` (tak pernah menandai PUBLISHED palsu).
- Wiring produksi: `workers/outbox-dispatcher/src/main.ts:16-46` (`RedisStreamsOutboxPublisher`, fail-hard tanpa `REDIS_URL`) → `runOutboxDispatcher` (`workers/outbox-dispatcher/src/index.ts:96-140`) menandai PUBLISHED/retry sesuai hasil.
- Pemantauan usia tertua: `packages/domain/src/slo/outbox-sli.ts` (oldest unpublished age / dead-letter → burn-rate).

### REQ-07-005 — Efek tak pasti rekonsiliasi sebelum retry (UNKNOWN_RESULT) — TERPENUHI — -

**Persyaratan** (`07_EVENTS §6`, §11.5): "Uncertain side effect must reconcile before retry"; "unknown submit result signals reconciliation rather than immediate retry." Operation-state lima status.

**Kondisi nyata**: Dua mekanisme. (1) Store idempotensi mendefinisikan tepat lima status eksekusi termasuk `UNKNOWN_RESULT` dan fungsi `reconcileOperation`. (2) Worker payment memetakan status provider tak dikenal ke `UNKNOWN_RESULT` (fail-safe), menjaga sesi tetap terbuka untuk pass rekonsiliasi berikutnya alih-alih retry buta.

**Bukti**:
- `packages/domain/src/idempotency/store.ts:16-23` — `OPERATION_STATUSES = ['PROCESSING','SUCCEEDED','FAILED_RETRYABLE','FAILED_FINAL','UNKNOWN_RESULT']` (lima).
- `packages/contracts/src/operations/status.ts:3-9` — enum lima status yang sama.
- `packages/database/src/schema/idempotency.ts:48-51,90-96` — CHECK DB menegakkan tepat lima nilai pada `operation_execution` dan `idempotency_record`.
- `workers/payment-worker/src/reconcile.ts:38-45` — `canonicalPaymentStatus`: tak dikenal → `UNKNOWN_RESULT` (komentar: "never a guessed terminal status", 17_PAYMENT §6.2/GAP-015).
- `workers/payment-worker/src/reconcile.ts:150-210` — `applyReconciliation` re-read `FOR UPDATE`, putuskan via `decidePaymentTransition`, tulis dalam satu transaksi; tes memancarkan `payment.unknown_result` (`test/reconcile.integration.test.ts:119-123`).

**Catatan bukti**: `reconcileOperation`/`settleOperation` untuk tabel `operation_execution` terpanggil produksi hanya di jalur `conversation.reply` (`postgres-conversation.repository.ts:311`, status `SUCCEEDED`); `UNKNOWN_RESULT` pada `operation_execution` **tidak** dihasilkan di produksi (reconcileOperation nol call site non-tes). Persyaratan blueprint tetap TERPENUHI karena jalur efek-eksternal (payment) memakai mesin transisi khusus yang menegakkan reconcile-before-retry.

### REQ-07-006 — PAID tak pernah mundur; terminal tetap terminal — TERPENUHI — -

**Persyaratan** (`07_EVENTS §11.5`): "late/out-of-order event cannot regress paid state without explicit reversal"; terminal stays terminal.

**Kondisi nyata**: Satu mesin transisi bersama (API + worker) menolak downgrade dari status terminal dan mengabaikan event basi/duplikat berdasarkan waktu event provider.

**Bukti**:
- `packages/domain/src/payments/transitions.ts:42-49` — `ALLOWED`: `PAID: ['PAID']`, `EXPIRED: ['EXPIRED']`, `FAILED: ['FAILED']`; `UNKNOWN_RESULT` tak terminal.
- `packages/domain/src/payments/transitions.ts:70-92` — `decidePaymentTransition`: `eventAt < observedAt` → IGNORE STALE_EVENT; sama → DUPLICATE; tak diizinkan → TERMINAL.
- Dipakai bersama: `workers/payment-worker/src/reconcile.ts:172-176` (`decidePaymentTransition`), dan mesin sama diuji `apps/api/src/modules/payments/payment-transitions.test.ts:51-83`.

### REQ-07-007 — Layar DLQ + tata kelola replay — SEBAGIAN — MEDIUM

**Persyaratan** (`07_EVENTS §14`): layar DLQ menampilkan tenant/provider, tipe, first/last failure, attempt count, error class, payload schema version, side-effect uncertainty, suggested remediation. Replay butuh permission, reason, corrected dependency, dry-run untuk aksi high-risk, dan replay command baru tertaut ke asal.

**Kondisi nyata**: Baris DB benar bertransisi ke `DEAD_LETTER` melewati budget, tetapi permukaan manajemen DLQ adalah repository **in-memory** yang **tak pernah diisi** — `add()` nol call site — sehingga layar/replay tercerai dari baris dead-letter nyata. Bentuk entri juga kurang field, dan replay tak menuntut reason/dry-run/replay tertaut.

**Bukti**:
- `apps/api/src/modules/dlq/dlq.repository.ts:24-45` — `private entries: Map<...>`; komentar "ponytail: in-memory DLQ store; swap for Postgres when persistence is needed"; `add(...)` mendefinisikan entri.
- Call site `add()`: `Select-String -Pattern 'DlqRepository' -Include *.ts` → hanya `dlq.module.ts` (provider/exports), `dlq.controller.ts` (inject), `dlq.repository.ts` (definisi). Controller memanggil `list/count/get/replay/delete` — **tak pernah** `add`. Transisi `retryOutboxEvent`/`retryInboxEvent` menulis status DB `DEAD_LETTER` tanpa memanggil `DlqRepository.add`.
- Bentuk kurang field: `dlq.repository.ts:9-20` `DeadLetterEntry` tak punya `provider`, `first/last failure`, `error class`, `schema version`, `side-effect uncertainty`, `suggested remediation` (hanya `error` string + `deadLetteredAt`).
- Replay tanpa tata kelola: `apps/api/src/modules/dlq/dlq.controller.ts:38-44` — `replay(id)` hanya menghapus dari map; tanpa `reason`, `dry-run`, atau `replay command` tertaut.

**Yang kurang**: DLQ berbasis DB yang membaca baris `DEAD_LETTER` nyata (inbox+outbox), field diagnostik lengkap, dan replay bergerbang reason + dry-run high-risk + command replay tertaut ke asal.

### REQ-07-008 — Kebijakan retry: backoff, jitter, max attempts, Retry-After, circuit breaker, DLQ — SEBAGIAN — MEDIUM

**Persyaratan** (`07_EVENTS §6`): "exponential backoff; jitter; max attempts by action risk; respect Retry-After; circuit breaker after threshold; DLQ with sanitized diagnostic."

**Kondisi nyata**: Retry dengan backoff + batas attempts → `DEAD_LETTER` ada dan teruji. Namun jitter dan circuit breaker generik tak ada; "respect Retry-After" tak terlihat di dispatcher.

**Bukti**:
- `packages/domain/src/outbox/dispatcher.ts:96-122` & `packages/domain/src/inbox/dispatcher.ts` — `retry*Event`: `available_at = now() + backoffMs`; `attempts >= maxAttempts → 'DEAD_LETTER'`. Backoff tetap (tanpa jitter): `retryBackoffMs: 5_000` (`workers/outbox-dispatcher/src/main.ts:34-40`).
- Circuit breaker: `Select-String -Pattern 'circuit.?breaker' -Include *.ts` → hanya kill-switch logistik in-process (`apps/api/src/modules/logistics/postgres-logistics.repository.ts:44` komentar). Tak ada breaker berbasis threshold untuk queue.
- `Retry-After`: tak ada penghormatan di loop dispatcher (tak ditemukan).

**Yang kurang**: jitter pada backoff, circuit breaker berambang untuk konektor/queue, dan penghormatan `Retry-After` provider.

### REQ-07-009 — Topologi antrean 15 queue — SEBAGIAN — MEDIUM

**Persyaratan** (`07_EVENTS §5`): 15 queue bernama dengan prioritas, ordering key, dan retry (mis. `realtime-domain`, `payment-webhook`, `logistics-poll`, `automation`, `dead-letter`).

**Kondisi nyata**: Pengiriman diimplementasikan sebagai satu Redis stream per **tipe event** + dispatcher polling DB, bukan sebagai 15 queue berprioritas bernama. Ordering per partition key terjaga; prioritas antar-queue tidak dimodelkan.

**Bukti**:
- `packages/broker/src/outbox-stream.ts:11-19` — `outboxStreamKey(eventType)` = satu stream per tipe event (`chai:outbox:<eventType>`), bukan per-queue-topologi.
- `packages/domain/src/outbox/dispatcher.ts:47-56` — ordering `ORDER BY partition_key, available_at`.
- Nama queue spesifik: `Select-String -Pattern 'realtime-domain|payment-webhook|logistics-poll|payment-command' -Include *.ts` → 0 hasil.

**Yang kurang**: pemetaan ke topologi queue berprioritas sesuai §5 (atau justifikasi ADR bahwa stream-per-tipe menggantikannya), khususnya isolasi prioritas `Highest`↔`Low`.

### REQ-07-010 — Temporal untuk workflow durable multi-hari — HILANG — MEDIUM

**Persyaratan** (`07_EVENTS §12`, ADR-008): "Use Temporal for: waits spanning days/months; multi-step external side effects; approvals; compensation; versioned long-running logic."

**Kondisi nyata**: Temporal tidak ada di kode maupun dependensi.

**Bukti**:
- Perintah: `Select-String -Pattern 'Temporal|temporalio' -Include *.ts,*.json` (seluruh repo) → 0 hasil.
- Direktori `workers/` tidak memuat worker Temporal (isi: outbox-dispatcher, inbox-dispatcher, channel, payment, logistics, analytics, automation).

**Yang kurang**: adopsi Temporal (atau ADR yang secara eksplisit menunda §12) untuk workflow durable multi-hari, approval, dan kompensasi.

### REQ-07-011 — BullMQ untuk kerja async pendek — HILANG — LOW

**Persyaratan** (`07_EVENTS §12`, ADR-008): "Use BullMQ initially for: media; webhook delivery; short retries; tasks under hours."

**Kondisi nyata**: BullMQ tidak ada; kerja async pendek dijalankan lewat Redis Streams (`@chai/broker`) + dispatcher polling DB.

**Bukti**:
- Perintah: `Select-String -Pattern 'bullmq|BullMQ' -Include *.ts,*.json` (seluruh repo) → 0 hasil.

**Yang kurang**: BullMQ sesuai ADR-008, atau ADR yang mencatat Redis Streams sebagai penggantinya. (Fungsi at-least-once/retry/DLQ sudah tercakup mekanisme lain — severity rendah.)

### REQ-07-012 — Kontrak integrasi n8n — HILANG — LOW

**Persyaratan** (`07_EVENTS §13`): n8n menerima event bertanda/poll; daftar allowed/forbidden; "n8n callback includes workflow/run ID, tenant, action ID, status, sanitized result, and signature."

**Kondisi nyata**: n8n tidak ada di kode maupun dependensi.

**Bukti**:
- Perintah: `Select-String -Pattern 'n8n' -Include *.ts,*.json` (seluruh repo) → 0 hasil.

**Yang kurang**: implementasi/kontrak n8n, atau penegasan bahwa lapisan integrasi ini di luar cakupan rilis saat ini (modul opsional mati secara default).

### REQ-07-013 — Model definisi otomasi immutable + lifecycle — SEBAGIAN — MEDIUM

**Persyaratan** (`07_EVENTS §9`): versi immutable memuat trigger/filters/conditions/steps/delays/timezone/consent/stop rules/retry/approval/output metrics; lifecycle `DRAFT → VALIDATED → PUBLISHED → DEPRECATED`; "Running workflow remains pinned to its version."

**Kondisi nyata**: Ada versioning immutable + pin (snapshot definisi per versi, publish/rollback). Namun lifecycle memakai `DRAFT`/`ACTIVE` — tanpa `VALIDATED` dan `DEPRECATED`.

**Bukti**:
- `packages/domain/src/automation/versioning.ts:50-71` — `createVersion` snapshot definisi ke `chai.automation_flow_version` (immutable, versi naik).
- `packages/domain/src/automation/versioning.ts:78-99` — `publishVersion` set `chai.automation_flow.status = 'ACTIVE'`; `rollbackVersion` set `'DRAFT'`.
- Lifecycle spesifikasi: `Select-String -Pattern 'VALIDATED|DEPRECATED'` pada modul otomasi → tak ditemukan status ini.

**Yang kurang**: state `VALIDATED` dan `DEPRECATED`, dan kelengkapan field definisi (consent/channel policy, stop rules, approval, output metrics) di model versi.

### REQ-07-014 — Enam template otomasi MVP + kosakata stop-reason — HILANG — MEDIUM

**Persyaratan** (`07_EVENTS §10`): template MVP (no-response follow-up, booking reminder, hot lead, knowledge freshness, payment reminder, shipment milestone) dengan stop reasons persist (`CUSTOMER_REPLIED`, `OPT_OUT`, `LEAD_CLOSED`, `BOOKING_CREATED`, `CHANNEL_UNAVAILABLE`, `WINDOW_POLICY_BLOCKED`, `MAX_ATTEMPTS`, `MANUAL_STOP`).

**Kondisi nyata**: Yang ada adalah flow engine generik berbasis node (trigger `onMessageReceived`/`onPaymentReceived`), bukan enam template spesifik dengan kosakata stop-reason.

**Bukti**:
- `packages/domain/src/automation/` — `flow-engine.ts`, `flow-types.ts`, `library/{triggers,conditions,actions}.ts` (mesin generik).
- Perintah: `Select-String -Pattern 'CUSTOMER_REPLIED|WINDOW_POLICY_BLOCKED' -Include *.ts` → 0 hasil.

**Yang kurang**: implementasi template MVP dan persist stop-reason sesuai kosakata §10 (mis. `no-response follow-up` dengan re-evaluasi stop rules dan `MAX_ATTEMPTS`).

### REQ-07-015 — Workflow booking durable (states + kompensasi) — HILANG — MEDIUM

**Persyaratan** (`07_EVENTS §11.1`): states `REQUESTED, AVAILABILITY_OFFERED, CUSTOMER_CONFIRMED, CREATING, CONFIRMED, RESCHEDULING, CANCELLED, FAILED_REVIEW`; kompensasi "never silently create second event."

**Kondisi nyata**: Hanya query ketersediaan yang ada; tak ada mesin state booking durable maupun endpoint appointment create/reschedule/cancel/outcome (06 §8).

**Bukti**:
- `apps/api/src/modules/calendar/calendar.controller.ts:39-63` — hanya `POST /availability` (`booking.read`).
- Perintah: `Select-String -Pattern 'AVAILABILITY_OFFERED|FAILED_REVIEW' -Include *.ts` → 0 hasil.

**Yang kurang**: mesin workflow booking durable + kompensasi (reconcile/import bila kalender terbuat tetapi commit lokal gagal), dan endpoint appointment lifecycle.

### REQ-07-016 — Workflow data-deletion & export durable — TIDAK-TERVERIFIKASI — MEDIUM

**Persyaratan** (`07_EVENTS §11.3`, §11.4): deletion (verify/freeze/legal hold/export/delete/revoke/completion certificate, toleran retry) dan export (snapshot filter/permission → generate → stream terenkripsi → link singkat → expire).

**Kondisi nyata**: Ada modul `retention` (`apps/api/src/modules/retention`) dan `packages/domain/src/retention-job/runner.ts`, tetapi kelengkapan state workflow (legal hold, completion certificate, idempotensi retry) tidak ditelusuri di jalur B ini. Retensi/PII adalah cakupan Jalur A; export adalah lintas jalur.

**Bukti**:
- Modul ada: `apps/api/src/modules/retention/retention.controller.ts`, `packages/domain/src/retention-job/runner.ts`.

**Yang dibutuhkan untuk memutuskan**: pembacaan menyeluruh alur retention/deletion + export terhadap §11.3/§11.4 (dilakukan Jalur A/F). Jalur B tidak mengklaim status akhir.

### REQ-07-017 — Monitoring queue/outbox/DLQ — SEBAGIAN — LOW

**Persyaratan** (`07_EVENTS §15`): metrics queue depth/lag, oldest job, success/retry/failure, DLQ growth, outbox unpublished age, dll.

**Kondisi nyata**: Usia outbox unpublished dan hitungan dead-letter dihitung sebagai SLI/burn-rate; metrik queue depth/lag/stalled lain (lintas Jalur F observability) tak diverifikasi di sini.

**Bukti**:
- `packages/domain/src/slo/outbox-sli.ts` — memetakan `decided`/`dead-letter` + oldest unpublished age ke sampel burn-rate (`slo/outbox-sli.test.ts:13`).

**Yang kurang**: cakupan metrik penuh §15 (queue depth/lag, oldest job, stalled jobs, reminder-stop lag, dsb.) — sebagian besar milik Jalur F.

---

## Re-verifikasi temuan pra-isi §5 (relevan Jalur B)

### K-10 — Generator ID `Math.random` di jalur produksi — TERPENUHI (tertutup)

**Klaim pra-isi**: enam generator ID memakai `Math.random` (`dlq.repository.ts:31`, 3× `packages/domain/src/automation/library/*`, `retention-job/runner.ts:66`, `ai-gateway/src/cost-accounting.ts:40`).

**Kondisi nyata**: Semua berkas produksi tersebut kini memakai `randomUUID`, dengan komentar eksplisit "randomUUID, not Math.random". `Math.random` hanya tersisa di berkas **tes** (`tests/chaos`, `tests/pentest`, `tests/load`, `tests/integration/harness.ts`).

**Bukti**:
- Perintah: `Select-String -Path <repo> -Pattern 'Math\.random' -Include *.ts` → kemunculan hanya di tes; berkas produksi yang disebut menampilkan komentar "randomUUID, not Math.random" (`apps/api/src/modules/dlq/dlq.repository.ts:32`, `packages/domain/src/automation/library/actions.ts:58`, `.../conditions.ts:44`, `.../triggers.ts:62`, `packages/domain/src/retention-job/runner.ts:67`, `services/ai-gateway/src/cost-accounting.ts:41`).
- Sejalan ADR-020 (UUIDv7/sortable). Status K-10: **remediasi terverifikasi** untuk jalur B.

---

## Self-check (§10.7)

1. **Dibaca penuh?** Ya — 06 (482 baris) dan 07 (545 baris) dibaca berurutan sampai habis; tidak ada bagian dilewati.
2. **Jumlah REQ & distribusi:** 33 REQ (06: 16, 07: 17). Distribusi ada di blok laporan §10.8 di bawah (dihitung via perintah dari heading).
3. **Setiap TERPENUHI punya path:baris + bukti terpanggil?** Ya — tiap TERPENUHI menyertakan call site produksi (interceptor `APP_INTERCEPTOR`/`APP_FILTER`, call site repo/worker) atau tes penegak.
4. **Setiap HILANG punya perintah nol hasil?** Ya — REQ-06-013 (`dead-letters`), REQ-07-010 (`Temporal`), REQ-07-011 (`bullmq`), REQ-07-012 (`n8n`), REQ-07-014 (`CUSTOMER_REPLIED|WINDOW_POLICY_BLOCKED`), REQ-07-015 (`AVAILABILITY_OFFERED|FAILED_REVIEW`).
5. **Sudah di-append ke berkas keluaran?** Ya — berkas ini (`docs/audit/2026-07-29/jalur-b-kontrak-event.md`).
6. **`git status --porcelain` hanya `docs/audit/`?** Hanya berkas ini yang dibuat; tidak ada kode produksi diubah (audit read-only).

---

## Laporan §10.8

```
DOKUMEN 06 - API and Realtime Contract (482 baris)
REQ dihasilkan: 16
  TERPENUHI 7 | SEBAGIAN 8 | HILANG 1 | BERTENTANGAN 0 | TIDAK-TERVERIFIKASI 0
Temuan severity tertinggi: REQ-06-010 - event kanonik tak terkirim end-to-end (replay window tak diisi produksi; bus in-process; stream outbox tak dikonsumsi)
Berkas keluaran: docs/audit/2026-07-29/jalur-b-kontrak-event.md
Self-check 6 butir: semua "ya"

DOKUMEN 07 - Events, Automations, and Job Processing (545 baris)
REQ dihasilkan: 17
  TERPENUHI 5 | SEBAGIAN 6 | HILANG 5 | BERTENTANGAN 0 | TIDAK-TERVERIFIKASI 1
Temuan severity tertinggi: REQ-07-003 - envelope event kanonik tak lengkap di jalur produksi (correlation_id/causation_id/actor/occurred_at hilang; skema hanya dipakai di tes); disandingkan REQ-07-007 DLQ in-memory tak terisi
Berkas keluaran: docs/audit/2026-07-29/jalur-b-kontrak-event.md
Self-check 6 butir: semua "ya"
```

> Rekap di atas diverifikasi dengan perintah penghitung dari heading berkas (lihat bagian berikut).
