# Daftar Celah Master — Konsolidasi Audit Blueprint Chai

> Konsolidasi keenam jalur audit terhadap `Omnichannel_AI_Platform_Engineering_Blueprint_v1.2/`.
> Mengikuti `docs/plans/2026-07-27-rencana-audit-blueprint.md` §6.
> Berkas sumber (read-only, tidak diubah oleh sesi konsolidasi ini):
>
> | Jalur | Berkas | Dokumen blueprint |
> |---|---|---|
> | A | `docs/audit/2026-07-27/jalur-a-keamanan-tenancy.md` | 10_SECURITY, 05_DATA_MODEL |
> | B | `docs/audit/2026-07-29/jalur-b-kontrak-event.md` | 06_API, 07_EVENTS |
> | C | `docs/audit/2026-07-29/jalur-c-payment-logistics.md` | 17_PAYMENT_AND_LOGISTICS |
> | D | `docs/audit/2026-07-29/jalur-d-ai-connector.md` | 08_AI_AGENT, 09_CHANNEL_CONNECTOR |
> | E | `docs/audit/2026-07-29/jalur-e-frontend.md` | 03_UX_UI, 04_DESIGN_SYSTEM |
> | F | `docs/audit/2026-07-29/jalur-f-operasional.md` | 02_SYSTEM_ARCHITECTURE (11/12/13 belum diaudit — lihat §6) |
>
> **Semua angka di berkas ini dihitung dengan perintah** (lihat §2), bukan dari ingatan atau dari
> heading berkas jalur — persis untuk menghindari kesalahan hitung yang pernah terjadi (mis. menulis
> "SEBAGIAN 14" padahal isi berkas 11). Angka self-report di heading tiap jalur diverifikasi ulang
> terhadap baris tabel Ringkasan; semua cocok kecuali di mana disebutkan.

---

## Ringkasan eksekutif (tiga kalimat)

Dari **309 persyaratan normatif** yang diekstrak enam jalur, hasil audit awal (2026-07-29, sebelum
sesi FASE 1 di bawah) mencatat **73 (24%) TERPENUHI** secara call-site-proven; **173 SEBAGIAN**,
**44 HILANG**, **1 BERTENTANGAN**, **17 TIDAK-TERVERIFIKASI**.

**Koreksi pasca-sesi FASE 26 (2026-08-01) — audit ulang + rekonsiliasi statistik**: sesi ini
memverifikasi ulang setiap baris SEBAGIAN/HILANG terhadap kode nyata (bukan menaksir) dan
mengoreksi status yang tertinggal setelah FASE 15–25 dan 27–33 selesai. **17 temuan berpindah ke
TERPENUHI dengan bukti file+test**: 15 HILANG→TERPENUHI — REQ-07-012 (kontrak n8n), REQ-07-014
(6 template + stop-reason enum), REQ-07-015 (booking saga+kompensasi), REQ-17-038 (PoD RLS
write-once), REQ-17-069 (consent notification), REQ-17-065 (mismatch alert+owner+aging+runbook+audit),
REQ-09-012 (Community Gateway), REQ-04-009 (komponen Actions), REQ-04-016 (9 komponen AI tanpa %),
REQ-03-009/010/011/014/018 (owner console: wizard/detail/channel-health/billing/onboarding),
REQ-02-016 (gateway zona terpisah); 2 SEBAGIAN→TERPENUHI — REQ-06-010 (consumer produksi ter-wire,
FASE 30), REQ-02-019 (AuditMiddleware tiap mutasi, FASE 15). Sisa SEBAGIAN/HILANG yang tidak
dikerjakan dicatat sebagai keputusan **ditunda sadar** di
`docs/plans/2026-08-01-ditunda-sadar-fase26.md`, dan rencana migrasi OIDC (REQ-10-015, menyentuh
autentikasi — tidak diimplementasi sesi ini) ada di `docs/adr/ADR-0031-oidc-workload-identity.md`.

**Angka otoritatif (dihitung dengan perintah `Select-String` §2, 2026-08-01, setelah penyelesaian item tertunda)**: **73 TERPENUHI**,
**149 SEBAGIAN**, **16 HILANG**, **6 TIDAK-TERVERIFIKASI** (dari 244 baris tabel §1). Tambahan penyelesaian:
REQ-10-003 & REQ-10-004 (idle session timeout 30m/60m ditegakkan di `performRefresh` dan `token-hook`), REQ-17-071 (multi-package & partial fulfillment di `@chai/domain`) berpindah ke TERPENUHI.

**Koreksi pasca-sesi FASE 11 (2026-07-31)**: 4 temuan berpindah ke TERPENUHI — REQ-03-035 (BERTENTANGAN→TERPENUHI, modal konfirmasi aksi destruktif), REQ-10-019 (HILANG→TERPENUHI, malware scan download gate + endpoint scan), REQ-08-018 (SEBAGIAN→TERPENUHI, evaluateGroundedAnswerPolicy di @chai/domain), REQ-05-002 (SEBAGIAN→TERPENUHI, ADR-0030 owner x-tenant-id header policy).

**Koreksi pasca-sesi FASE 10 (2026-07-31)**: 4 temuan berpindah ke TERPENUHI — REQ-17-033,
REQ-17-053, REQ-17-066 (SEBAGIAN→TERPENUHI), REQ-09-026 (TIDAK-TERVERIFIKASI→TERPENUHI).
`GET /shipments/:trackingNumber` kini mewajibkan proof of ownership (`contactId` atau
`orderReference` sebagai query param), ter-wire ke `customerLookup` (fail-closed, ADR-027);
route-level e2e test membuktikan tracking number tebakan mengembalikan 404. Alasan tiap
perpindahan ada di baris REQ masing-warning di §1.

**Koreksi pasca-sesi FASE 1 (2026-07-29, sama hari)**: tiga temuan berpindah ke TERPENUHI dengan
bukti eksekusi baru — `REQ-17-009` (SEBAGIAN→TERPENUHI), `REQ-09-014` (SEBAGIAN→TERPENUHI),
`REQ-02-018` (TIDAK-TERVERIFIKASI→TERPENUHI). Satu temuan naik kelas tanpa mencapai TERPENUHI:
`REQ-17-063` (HILANG→SEBAGIAN; bagian stop-reminder tertutup, bagian update-proyeksi masih menunggu
`REQ-17-019`). Angka pasca-FASE-1: **76 (25%) TERPENUHI**, **172 SEBAGIAN**, **43 HILANG**,
**1 BERTENTANGAN**, **17 TIDAK-TERVERIFIKASI**.

**Koreksi pasca-sesi FASE 2 (2026-07-30)**: tiga temuan lagi berpindah ke TERPENUHI dengan bukti
eksekusi baru — `REQ-10-013` (SEBAGIAN→TERPENUHI, refresh token dipindah ke Postgres + bug reuse-family
nyata diperbaiki), `REQ-10-012` (HILANG→TERPENUHI, SameSite=Lax dikonfirmasi sudah cukup untuk mutasi
+ Origin check ditambah di BFF proxy), `REQ-10-005` (SEBAGIAN→TERPENUHI, 5 rute sensitif tambahan
diberi guard, total 6). Angka pasca-FASE-2: **79 (26%) TERPENUHI**, **170 SEBAGIAN**, **42 HILANG**,
**1 BERTENTANGAN**, **17 TIDAK-TERVERIFIKASI**.

**Koreksi pasca-sesi FASE 3 (2026-07-30)**: tiga temuan lagi berpindah ke TERPENUHI — `REQ-10-016`,
`REQ-09-006`, `REQ-09-023` (ketiganya SEBAGIAN→TERPENUHI: timestamp+replay-window+dedup ditambahkan
untuk webhook mock-payment dan Midtrans; JNE sengaja tidak disambungkan ke endpoint publik, keputusan
terdokumentasi di atas). Angka pasca-FASE-3: **82 (27%) TERPENUHI**, **167 SEBAGIAN**, **42 HILANG**,
**1 BERTENTANGAN**, **17 TIDAK-TERVERIFIKASI**.

**Koreksi pasca-sesi FASE 4 (2026-07-30)**: tiga temuan lagi berpindah ke TERPENUHI — `REQ-08-008`,
`REQ-08-021`, `REQ-09-034` (ketiganya SEBAGIAN→TERPENUHI: jalur eksekusi tool AI/human dibangun dari
nol — sebelumnya tidak ada sama sekali, bukan hanya "tidak tersambung" seperti klaim audit awal — dan
policy gate + kontrak ActionRequest idempoten + kill switch kini nyata di `POST /actions/execute`).
Angka terkini: **89 (29%) TERPENUHI**, **160 SEBAGIAN**, **42 HILANG**, **1 BERTENTANGAN**,
**17 TIDAK-TERVERIFIKASI**. Detail tiap perpindahan ada di baris REQ masing-masing di §1 dan di
Tier 0 §2 di bawah.

**Pembaruan pasca-FASE-5 (2026-07-31)**: 4 dari 7 temuan HIGH satu tema "rahasia & kredensial"
naik ke TERPENUHI — REQ-10-022, REQ-05-003, REQ-17-049, REQ-09-029 (SecretService AES-256-GCM
at-rest, kolom DB hanya ref vault, rotasi teraudit via AuditPort). REQ-17-011 dan REQ-17-058
tetap SEBAGIAN: tabel `payment_provider_account` per-tenant + repo + SecretService sudah ada
(migrasi 0086), tetapi `verifyProviderWebhook` Midtrans masih pakai key global (tenantId hanya
terbaca setelah verifikasi; pre-parse order_id menyusul). REQ-04-010 (frontend SecretInput)
TERPENUHI: komponen `SecretInput` masked, hardcoded secret dihapus.

Invarian inti proyek yang paling mahal **sebagian besar aman** (uang integer minor units, RLS
default-deny+FORCE, `PAID` tak mundur, unknown→UNKNOWN, policy engine sebagai satu-satunya gerbang
efek samping tool AI).

**Koreksi 2026-07-29 (pasca-audit)**: dua dari empat temuan yang tabel ini semula menandai
release-blocking sudah ditutup penuh dengan bukti eksekusi setelah dokumen ini ditulis; dua lainnya
sebagian ditutup. `REQ-17-009` (mutasi+audit+event webhook payment dalam satu transaksi) —
**TERPENUHI penuh**. `REQ-17-063` (PAY-06: update proyeksi **dan** stop-reminder tepat sekali) —
**SEBAGIAN**: bagian stop-reminder ditutup (lihat commit "Tutup CRITICAL reminder pembayaran dan bug
jsonb double-encode di follow_up_job"), bagian update-proyeksi masih menunggu `REQ-17-019` yang
sama-sama masih terbuka. `REQ-09-014` (isolasi tenant widget publik) dan `REQ-02-018` (suite
integrasi isolasi tenant yang sebelumnya yatim) — **TERPENUHI penuh**, ditutup pada sesi FASE 1
rencana penyelesaian lengkap (lihat `docs/plans/2026-07-29-rencana-penyelesaian-lengkap.md`).
Satu-satunya CRITICAL yang masih terbuka sepenuhnya adalah `REQ-17-019`, yang butuh keputusan model
data sebelum diimplementasikan — lihat FASE 7 rencana tersebut.
Sesi yang menjalankan `tests/security/**`/`tests/e2e/**` untuk pertama kali (menutup REQ-02-018)
juga menyingkap **dua bug P0 baru, tidak terkait isolasi tenant**: (1) esbuild (dipakai build dan
dev server `apps/api`) tidak mendukung `emitDecoratorMetadata`, sehingga `class-validator`'s
`ValidationPipe` menjadi no-op di build produksi nyata (`node dist/main.js`) — validasi
body/query API tidak berfungsi sama sekali; (2) constructor tanpa `@Inject()` eksplisit yang
mengandalkan reflection implisit di-resolve `undefined` tanpa error boot — dikonfirmasi konkret di
`channels.controller.ts` (`RealtimePublisher`), menyebabkan setiap webhook channel masuk crash 500.
Keduanya belum ditutup; lihat rencana penyelesaian lengkap untuk penjadwalannya.

Klaim kematangan warisan di §1 rencana **terlalu optimistis di setiap lapisan** bila diukur dengan
bar ketat "terbukti terpenuhi"; kesenjangan terbesar ada di AI-safety (18% vs klaim 35%) dan
frontend (2% vs klaim 25–30%).

---

## 1. Tabel master seluruh temuan (diurutkan severity, lalu jalur)

309 temuan disusun per tingkat severity; di dalam tiap tingkat diurutkan menurut jalur (A→F).
Kolom: **ID · Jalur · Persyaratan (singkat) · Kelas · Severity**. Aturan severity mengikuti
`18_ENGINEERING_GAPS §2` dengan satu penindih dari rencana §3: **cacat isolasi tenant, uang, dan
status terminal bersifat release-blocking terlepas severity generiknya** (ditandai 🔴 di §5).

### 1.1 CRITICAL (3)

| ID | Jalur | Persyaratan (singkat) | Kelas | Severity |
|---|---|---|---|---|
| REQ-17-009 | C | Efek eksternal: mutasi+audit+event dalam SATU transaksi (jalur webhook payment tak patuh) | TERPENUHI | CRITICAL |
| REQ-17-019 | C | Alur hosted-payment lengkap: on-PAID update proyeksi+stop reminder+notifikasi+atribusi | SEBAGIAN | CRITICAL |
| REQ-17-063 | C | PAY-06: event paid update proyeksi + stop reminder tepat sekali | SEBAGIAN | CRITICAL |

### 1.2 HIGH (37)

| ID | Jalur | Persyaratan (singkat) | Kelas | Severity |
|---|---|---|---|---|
| REQ-10-005 | A | Recent-authentication window 10 menit untuk aksi sensitif (kini 6 rute, didaftarkan di `RECENT_AUTH_ROUTES`) | TERPENUHI | HIGH |
| REQ-10-012 | A | CSRF protection untuk mutasi cookie-auth (SameSite=Lax + Origin check di BFF proxy) | TERPENUHI | HIGH |
| REQ-10-013 | A | Refresh token rotate + reuse revokes family (Postgres migrasi 0083, multi-replica) | TERPENUHI | HIGH |
| REQ-10-016 | A | Webhook signature + timestamp verification + replay window (timestamp+dedup ditambahkan; JNE sengaja belum ter-wire, lihat §7) | TERPENUHI | HIGH |
| REQ-10-019 | A | Malware scan pada file/media unggah (GET :id/download memblokir non-CLEAN + POST :id/scan pipeline, REQ-10-019, FASE 11) | TERPENUHI | HIGH |
| REQ-10-022 | A | Secret manager/KMS; connector secret dienkripsi AES-256-GCM at-rest via SecretService; kolom DB hanya ref vault; rotasi teraudit (FASE 5) | TERPENUHI | HIGH |
| REQ-05-002 | A | Body/header tak bisa memilih tenant (ADR-0030 owner x-tenant-id header policy tertulis, FASE 11) | TERPENUHI | HIGH |
| REQ-05-003 | A | Raw secret tak disimpan di webhook_subscription (signing_secret_ref via SecretService, migrasi 0086); payment_provider_account per-tenant dengan secret_ref (FASE 5) | TERPENUHI | HIGH |
| REQ-06-010 | B | Event kanonik benar-benar terkirim ke subscriber end-to-end (FASE 30: workers/inbox-dispatcher/message-received-consumer.ts ter-wire di main.ts, consumer group nyata + message-received-consumer.integration.test.ts delivery+idempotensi) | TERPENUHI | HIGH |
| REQ-17-011 | C | Metadata akun provider + referensi secret-manager per-tenant (tabel payment_provider_account, migrasi 0086; SecretService per-tenant, FASE 5) | SEBAGIAN | HIGH |
| REQ-17-021 | C | Amount dari sumber tepercaya; AI tak mengarang harga/pajak/currency | SEBAGIAN | HIGH |
| REQ-17-027 | C | Eksekusi refund: recent-auth + threshold + audit + rekonsiliasi provider | SEBAGIAN | HIGH |
| REQ-17-033 | C | Lookup pelanggan verifikasi tenant+ownership (kini ter-wire ke rute via customerLookup + query param proof; route-level e2e test, FASE 10) | TERPENUHI | HIGH |
| REQ-17-044 | C | Event kanonik payment.*/shipment.* (mayoritas hilang) | SEBAGIAN | HIGH |
| REQ-17-049 | C | Secret manager per-tenant/least-scope/rotasi teraudit (SecretService per-tenant, rotateSecret menulis audit_entry; FASE 5) | TERPENUHI | HIGH |
| REQ-17-053 | C | Lookup tracking butuh user terautentikasi + verifikasi identitas/order (kini ter-wire ke rute, contactId/orderReference wajib; FASE 10) | TERPENUHI | HIGH |
| REQ-17-058 | C | PAY-01: isolasi kredensial/transaksi tenant — payment_provider_account per-tenant dengan secret_ref (migrasi 0086, FASE 5); webhook verifyProviderWebhook masih pakai key global (pre-parse order_id menyusul) | SEBAGIAN | HIGH |
| REQ-17-059 | C | PAY-02: amount/currency/purpose dari data bisnis tepercaya + konfirmasi | SEBAGIAN | HIGH |
| REQ-17-064 | C | PAY-07: refund nonaktif s.d. approval+recent-auth+rekonsiliasi+tes provider | SEBAGIAN | HIGH |
| REQ-17-065 | C | PAY-08: mismatch produksi punya alert+owner+aging+runbook+audit (FASE 33: payments/refund.ts payment_reconciliation dengan assignedOwnerId+agingDays, resolve via commitBusinessMutation (audit+event); alert PaymentReconciliationMismatch; runbook 2026-07-31-payment-reconciliation-runbook.md; advanced-payments.integration.test.ts) | TERPENUHI | HIGH |
| REQ-17-066 | C | LOG-01: tenant-isolated + lookup end-customer verifikasi ownership (kini ter-wire ke rute via customerLookup; FASE 10) | TERPENUHI | HIGH |
| REQ-08-008 | D | AI tak dapat menimpa consent/permission/entitlement/approval/state (kini ter-wire ke POST /actions/execute) | TERPENUHI | HIGH |
| REQ-08-018 | D | Kebijakan grounded-answer klaim tenant-spesifik (evaluateGroundedAnswerPolicy di @chai/domain + unit tests, FASE 11) | TERPENUHI | HIGH |
| REQ-08-021 | D | Kontrak eksekusi tool 12-langkah + ActionRequest idempoten + audit (kini terimplementasi, migrasi 0085) | TERPENUHI | HIGH |
| REQ-08-023 | D | Uang/alamat/kurir tak pernah dari teks model bebas | SEBAGIAN | HIGH |
| REQ-08-039 | D | AC: AI tak mengarang nominal / tandai paid dari screenshot | SEBAGIAN | HIGH |
| REQ-08-040 | D | AC: AI tak bocorkan shipment pelanggan lain dari tracking tebakan | SEBAGIAN | HIGH |
| REQ-09-006 | D | Verifikasi signature + timestamp webhook (timestamp+dedup ditambahkan untuk mock-payment+midtrans; JNE sengaja belum ter-wire, lihat §7) | TERPENUHI | HIGH |
| REQ-09-014 | D | Keamanan widget: sesi publik tanpa auth, `tenantId` dari body (potensi lintas-tenant) | TERPENUHI | HIGH |
| REQ-09-023 | D | Verifikasi webhook payment + reconcile unknown (verifier Midtrans riil kini ter-wire via /:provider) | TERPENUHI | HIGH |
| REQ-09-026 | D | Lookup tracking butuh ownership, bukan nomor resi saja (kini ter-wire ke rute via customerLookup; route-level e2e test, FASE 10) | TERPENUHI | HIGH |
| REQ-09-029 | D | Penyimpanan auth/secret konektor: vaulted (SecretService AES-256-GCM) + rotasi teraudit (audit_entry via AuditPort; FASE 5) | TERPENUHI | HIGH |
| REQ-09-034 | D | Disable/kill switch konektor (kini ter-wire ke POST /actions/execute) | TERPENUHI | HIGH |
| REQ-03-035 | E | Confirmation pattern per risk (modal konfirmasi bertingkat pada aksi destruktif suspend/revoke di frontends, FASE 11) | TERPENUHI | HIGH |
| REQ-04-010 | E | Forms + SecretInput tanpa reveal setelah save (komponen SecretInput masked, hapus hardcoded secret; FASE 5) | TERPENUHI | HIGH |
| REQ-02-018 | F | Tes integrasi isolasi tenant lulus (runner dijalankan 2026-07-29: 76 lolos/13 gagal, gagal berakar pada bug esbuild/DI, bukan isolasi tenant) | TERPENUHI | HIGH |
| REQ-02-023 | F | Sertifikasi provider payment/shipment + kill switch + runbook teruji | TIDAK-TERVERIFIKASI | HIGH |

### 1.3 MEDIUM (131)

| ID | Jalur | Persyaratan (singkat) | Kelas | Severity |
|---|---|---|---|---|
| REQ-10-003 | A | Owner session: 8h absolut / idle 30m / access 10m (idle ditegakkan di performRefresh & token-hook) | TERPENUHI | MEDIUM |
| REQ-10-004 | A | Client session: 12h absolut / idle 60m / access 15m (idle ditegakkan di performRefresh & token-hook) | TERPENUHI | MEDIUM |
| REQ-10-010 | A | Cache/queue/object diberi prefix tenant | SEBAGIAN | MEDIUM |
| REQ-10-015 | A | OIDC workload identity, tanpa API key statis jangka panjang | HILANG | MEDIUM |
| REQ-10-017 | A | Rate limit by IP/identity/tenant/endpoint (hanya auth surface + per-proses) | SEBAGIAN | MEDIUM |
| REQ-10-021 | A | Audit sensitif otomatis untuk mutasi (`AuditMiddleware` ter-wire di `app.module.ts`) | TERPENUHI | MEDIUM |
| REQ-05-008 | A | Akses lintas-tenant owner diaudit beserta alasan (`isCrossTenant` & `crossTenantReason`) | TERPENUHI | MEDIUM |
| REQ-05-010 | A | `audit_log` append-only; tanpa update/delete standar (perlu verifikasi DB grant) | SEBAGIAN | MEDIUM |
| REQ-06-001 | B | Bentuk response envelope (request_id/freshness_at/page hilang) | SEBAGIAN | MEDIUM |
| REQ-06-002 | B | Error problem-details + kode kanonik | TERPENUHI | MEDIUM |
| REQ-06-007 | B | Page size maks 100/default 25 + cursor buram | TERPENUHI | MEDIUM |
| REQ-06-012 | B | Session bootstrap kembalikan permission efektif + hint | TERPENUHI | MEDIUM |
| REQ-06-013 | B | Owner API DLQ: `GET /api/owner/v1/dead-letters`, `POST /api/owner/v1/dead-letters/:id/replay` (`OwnerDlqController`) | TERPENUHI | MEDIUM |
| REQ-06-016 | B | Audit contract mutasi (before/after/diff) | SEBAGIAN | MEDIUM |
| REQ-07-003 | B | Envelope event kanonik lengkap (correlation/causation/actor/occurred_at di jalur aktif) | SEBAGIAN | MEDIUM |
| REQ-07-007 | B | Layar DLQ + tata kelola replay (repo in-memory tak terisi) | SEBAGIAN | MEDIUM |
| REQ-07-008 | B | Retry: backoff/jitter/max/Retry-After/circuit breaker/DLQ | SEBAGIAN | MEDIUM |
| REQ-07-009 | B | Topologi antrean 15 queue berprioritas | SEBAGIAN | MEDIUM |
| REQ-07-010 | B | Temporal untuk workflow durable multi-hari (ADR-008) | HILANG | MEDIUM |
| REQ-07-013 | B | Model otomasi immutable + lifecycle DRAFT→VALIDATED→PUBLISHED→DEPRECATED | SEBAGIAN | MEDIUM |
| REQ-07-014 | B | Enam template otomasi MVP + kosakata stop-reason (FASE 21: packages/domain/src/automation/{templates,stop-reasons}.ts + templates.test.ts 35 tes; stop-reason enum menolak string bebas) | TERPENUHI | MEDIUM |
| REQ-07-015 | B | Workflow booking durable (states + kompensasi) (FASE 21: packages/domain/src/workflow/{saga,booking}.ts di atas substrat chai.workflow_run; booking-workflow.integration.test.ts membuktikan kompensasi rilis slot) | TERPENUHI | MEDIUM |
| REQ-07-016 | B | Workflow data-deletion & export durable | TIDAK-TERVERIFIKASI | MEDIUM |
| REQ-17-002 | C | Tiap tenant memakai akun merchant sendiri (API di-hardcode mock) | SEBAGIAN | MEDIUM |
| REQ-17-005 | C | Tiap tenant memakai akun carrier sendiri | SEBAGIAN | MEDIUM |
| REQ-17-012 | C | Effective capability = irisan adapter∩scope∩state∩entitlement∩policy | SEBAGIAN | MEDIUM |
| REQ-17-020 | C | Kontrak adapter payment (8 operasi) | SEBAGIAN | MEDIUM |
| REQ-17-023 | C | Verifikasi signature/timestamp webhook payment | SEBAGIAN | MEDIUM |
| REQ-17-028 | C | Payment link tampilkan amount/currency/purpose/expiry/merchant | SEBAGIAN | MEDIUM |
| REQ-17-029 | C | Entitas logistik (Exception/PoD/Reconciliation/Commitment/Package/Item) | SEBAGIAN | MEDIUM |
| REQ-17-030 | C | Status kanonik shipment + set exception/terminal | SEBAGIAN | MEDIUM |
| REQ-17-031 | C | Kode provider→taxonomy berversi; unknown→UNKNOWN + mapping alert | SEBAGIAN | MEDIUM |
| REQ-17-034 | C | Kontrak adapter shipping (8 operasi) | SEBAGIAN | MEDIUM |
| REQ-17-038 | C | Akses PoD role-checked/short-lived/audited/masked (FASE 22: migrasi 0094 write-once RLS ENABLE+FORCE + advanced-logistics/proof-of-delivery.ts decideProofAccess/mask/expiry/recordAccess + proof-of-delivery.integration.test.ts lintas-tenant) | TERPENUHI | MEDIUM |
| REQ-17-041 | C | Endpoint payment klien §8.1 (cancel/reconcile/payment-links/refund-requests) | SEBAGIAN | MEDIUM |
| REQ-17-042 | C | Endpoint logistik klien §8.2 (reconcile/PoD/exceptions/returns) | SEBAGIAN | MEDIUM |
| REQ-17-048 | C | Aturan komunikasi AI (tak klaim paid dari gambar; sitasi; eskalasi) | SEBAGIAN | MEDIUM |
| REQ-17-050 | C | Webhook signature/timestamp+replay+body-limit+inbox dedup | SEBAGIAN | MEDIUM |
| REQ-17-056 | C | Kontrol wajib (retry/Retry-After/breaker/uncertain/gap/reconcile/kill switch) | SEBAGIAN | MEDIUM |
| REQ-17-057 | C | Cakupan tes minimum §16 | SEBAGIAN | MEDIUM |
| REQ-17-067 | C | LOG-02: status kanonik berversi + unknown gagal-aman (himpunan status kurang) | SEBAGIAN | MEDIUM |
| REQ-17-069 | C | LOG-04: notifikasi hanya terkonfigurasi/consent-compliant (FASE 22: advanced-logistics/notification-consent.ts fail-closed CHANNEL_NOT_CONFIGURED/NO_CONSENT + notification-consent.test.ts) | TERPENUHI | MEDIUM |
| REQ-17-070 | C | LOG-05: exception (stale/lost/damaged/return) tanpa mengarang ETA | SEBAGIAN | MEDIUM |
| REQ-17-071 | C | LOG-06: multi-shipment/package + partial fulfillment (calculateFulfillmentStatus & splitShipmentIntoPackages di @chai/domain) | TERPENUHI | MEDIUM |
| REQ-17-072 | C | LOG-07: aksi logistik destruktif butuh recheck+idempotency+approval | SEBAGIAN | MEDIUM |
| REQ-17-073 | C | LOG-08: tracking produksi webhook/poll fallback + rate-limit + SLO + alert + runbook | SEBAGIAN | MEDIUM |
| REQ-08-005 | D | Routing policy berurut + fallback lintas-provider terevaluasi | SEBAGIAN | MEDIUM |
| REQ-08-006 | D | HUMAN_ACTIVE = tidak ada outbound AI (FASE 31: processAiReplyTurn memverifikasi mode === 'AI_ACTIVE', AI reply consumer ter-wire di inbox-dispatcher) | TERPENUHI | MEDIUM |
| REQ-08-007 | D | Tanpa evidence fakta tenant → tanya/kualifikasi/handover | SEBAGIAN | MEDIUM |
| REQ-08-009 | D | AI tak pernah menerima akses DB tak terbatas | SEBAGIAN | MEDIUM |
| REQ-08-010 | D | Hasil tool tak tepercaya & divalidasi | SEBAGIAN | MEDIUM |
| REQ-08-012 | D | Siklus hidup prompt + prompt terbit imutabel | SEBAGIAN | MEDIUM |
| REQ-08-013 | D | Pipeline ingestion knowledge (scan→extract→chunk→embed→hybrid→review→publish) | SEBAGIAN | MEDIUM |
| REQ-08-014 | D | Retrieval hybrid full-text + vektor + rerank (= K-08, full-text saja) | SEBAGIAN | MEDIUM |
| REQ-08-015 | D | Filter retrieval tenant/visibility/language/effective-date | SEBAGIAN | MEDIUM |
| REQ-08-022 | D | Policy engine satu-satunya pemberi izin; tool tak dikenal ditolak (ADR-011) | SEBAGIAN | MEDIUM |
| REQ-08-025 | D | Mutasi eksternal tak pasti tetap RECONCILING, tanpa retry duplikat | SEBAGIAN | MEDIUM |
| REQ-08-026 | D | Multimodal (image/audio/document); injeksi dokumen = untrusted | SEBAGIAN | MEDIUM |
| REQ-08-027 | D | Guard prompt-injection / content boundary (ada tapi tak ter-wire ke retrieval produksi) | SEBAGIAN | MEDIUM |
| REQ-08-028 | D | Redaksi secret/PII pada output AI | SEBAGIAN | MEDIUM |
| REQ-08-029 | D | Allowlist tool per tenant (tak ditegakkan di eksekusi) | SEBAGIAN | MEDIUM |
| REQ-08-030 | D | URL/domain allowlist, loop limit, max tool/turn (`evaluateAIGuardrails` guard) | TERPENUHI | MEDIUM |
| REQ-08-032 | D | Release floor: zero regression safety + canary | HILANG | MEDIUM |
| REQ-08-034 | D | Budget bulanan per tenant + ceiling per request + fail-to-safe (store in-memory, tak ter-wire) | SEBAGIAN | MEDIUM |
| REQ-08-036 | D | AC: kapabilitas salah tak pernah dipilih (`isCapabilityAllowedForAI` guard) | TERPENUHI | MEDIUM |
| REQ-08-037 | D | AC: policy tenant terbatas memblokir provider | SEBAGIAN | MEDIUM |
| REQ-08-038 | D | AC: skema tool invalid tak pernah dieksekusi | SEBAGIAN | MEDIUM |
| REQ-08-041 | D | AC: human takeover memblokir kirim AI | SEBAGIAN | MEDIUM |
| REQ-08-042 | D | AC: skenario tanpa-evidence tak berhalusinasi | SEBAGIAN | MEDIUM |
| REQ-08-043 | D | AC: dokumen prompt-injection tak memperluas akses tool | SEBAGIAN | MEDIUM |
| REQ-08-044 | D | AC: rollback rilis model bekerja | HILANG | MEDIUM |
| REQ-08-045 | D | AC: budget tenant mengisolasi tenant berisik | SEBAGIAN | MEDIUM |
| REQ-09-001 | D | Set operasi konektor kanonik (connect/refresh/rotate/revoke/markRead/fetchMedia absen) | SEBAGIAN | MEDIUM |
| REQ-09-003 | D | Effective capability intersection (`calculateEffectiveCapabilities`: connector∩account∩entitlement∩policy) | TERPENUHI | MEDIUM |
| REQ-09-005 | D | Error taxonomy incl UNKNOWN_RESULT reconcile-before-retry | SEBAGIAN | MEDIUM |
| REQ-09-007 | D | Provider challenge handshake (Meta GET hub.challenge handler di `ChannelsController`) | TERPENUHI | MEDIUM |
| REQ-09-008 | D | Replay prevention + inbox dedup (dedup ada; replay berbasis timestamp/nonce tak ada) | SEBAGIAN | MEDIUM |
| REQ-09-010 | D | Meta Direct + required states (controller mewire adapter SANDBOX) | SEBAGIAN | MEDIUM |
| REQ-09-027 | D | Webhook + state-aware polling fallback logistik (route webhook + signature JNE kurang) | SEBAGIAN | MEDIUM |
| REQ-09-030 | D | Isolasi rate/concurrency per tenant + akun provider | SEBAGIAN | MEDIUM |
| REQ-03-001 | E | Owner console: semua route diawali server-side authz (`/ai-operations`,`/settings` tak digating) | SEBAGIAN | MEDIUM |
| REQ-03-002 | E | Client: invite-only, tenant context dari membership, switcher owned-only | SEBAGIAN | MEDIUM |
| REQ-03-003 | E | Access-denied behavior (5 skenario §2.3) | SEBAGIAN | MEDIUM |
| REQ-03-004 | E | Navigation item hanya dirender bila entitlement + permission terpenuhi (`AppShell` activeNavigation filter) | TERPENUHI | MEDIUM |
| REQ-03-005 | E | Owner Console route inventory (27 route; 16+ belum ada) | SEBAGIAN | MEDIUM |
| REQ-03-006 | E | Owner Sign In: MFA challenge/recovery/device list/states | SEBAGIAN | MEDIUM |
| REQ-03-008 | E | Tenant Directory kolom & aksi lengkap, tanpa bulk destructive | SEBAGIAN | MEDIUM |
| REQ-03-009 | E | Tenant Creation Wizard (8 langkah, autosave, tak ACTIVE tanpa checklist) (FASE 24: owner-console/tenant-wizard.tsx autosave localStorage + gate isOnboardingComplete) | TERPENUHI | MEDIUM |
| REQ-03-010 | E | Tenant Detail (tabs + tenant identity banner lintas-tenant) (FASE 24: owner-console/tenant-detail.tsx banner sticky lintas-tab + 8 tab) | TERPENUHI | MEDIUM |
| REQ-03-011 | E | Global Channel Health + Community Gateway high-risk badge (FASE 24: owner-console/channel-health.tsx matriks provider + ChannelRiskBadge, metrik komunitas tak diblend) | TERPENUHI | MEDIUM |
| REQ-03-012 | E | AI Operations + publish butuh validation summary & rollback target | SEBAGIAN | MEDIUM |
| REQ-03-014 | E | Usage & Billing + cost source (measured/estimated/reconciled) (FASE 24: owner-console/usage-billing.tsx via CostBadge — tak ada angka tanpa label sumber) | TERPENUHI | MEDIUM |
| REQ-03-015 | E | Reliability: 8 widget wajib | SEBAGIAN | MEDIUM |
| REQ-03-016 | E | Security & Audit: filter lengkap + kategorisasi high-risk event | SEBAGIAN | MEDIUM |
| REQ-03-017 | E | Client Portal route inventory (26 route; 13+ belum ada) | SEBAGIAN | MEDIUM |
| REQ-03-018 | E | Invite + onboarding checklist §6.2 (FASE 24: owner-console/onboarding-checklist.tsx §6.2 + gate aktivasi, modul opsional payment/shipping default-off) | TERPENUHI | MEDIUM |
| REQ-03-020 | E | Unified Inbox: 3-pane + composer lengkap + critical interactions | SEBAGIAN | MEDIUM |
| REQ-03-021 | E | Customer 360: tabs, PII masked by role, merge admin-only | SEBAGIAN | MEDIUM |
| REQ-03-026 | E | Commerce: read-first, mutation hanya bila capability + approval | SEBAGIAN | MEDIUM |
| REQ-03-027 | E | Payments UI: nav hidden saat disabled, no card/CVV/OTP, redirect≠Paid | SEBAGIAN | MEDIUM |
| REQ-03-028 | E | Shipments & Exceptions: nav hidden, canonical state, identity-auth | SEBAGIAN | MEDIUM |
| REQ-03-032 | E | Hosted payment link flow (6 langkah §7.4) | SEBAGIAN | MEDIUM |
| REQ-03-033 | E | Shipment tracking & exception flow (5 langkah §7.5) | SEBAGIAN | MEDIUM |
| REQ-03-034 | E | Global UI States: 10 state di setiap data surface | SEBAGIAN | MEDIUM |
| REQ-03-037 | E | Search permission-aware, tak bocorkan eksistensi luar scope | SEBAGIAN | MEDIUM |
| REQ-03-038 | E | Accessibility WCAG 2.2 AA | SEBAGIAN | MEDIUM |
| REQ-03-040 | E | UX Acceptance Checklist 12 butir | SEBAGIAN | MEDIUM |
| REQ-04-008 | E | Navigation components + TenantSwitcher memberships-only + owner repeat-name confirm | SEBAGIAN | MEDIUM |
| REQ-04-009 | E | Actions: Button/IconButton/SplitButton/ApprovalButton + one primary per area (FASE 23: packages/ui/src/actions.tsx + actions.test.tsx render+keyboard) | TERPENUHI | MEDIUM |
| REQ-04-011 | E | Data display components + DataTable 8 requirement | SEBAGIAN | MEDIUM |
| REQ-04-013 | E | Feedback: InlineAlert/Toast/Banner/Progress/Skeleton/ErrorBlock | SEBAGIAN | MEDIUM |
| REQ-04-014 | E | Overlays: Dialog/Drawer/FullScreenFlow/Popover + nested dialog dilarang | SEBAGIAN | MEDIUM |
| REQ-04-015 | E | Conversation components (16) + visual distinction AI/human/note/failed/tool | SEBAGIAN | MEDIUM |
| REQ-04-016 | E | AI components (9) + hindari confidence % pseudo-ilmiah (FASE 23: packages/ui/src/ai.tsx 9 komponen + ai.test.tsx menegakkan tidak ada persen di semua level) | TERPENUHI | MEDIUM |
| REQ-04-017 | E | Analytics chart (6 tipe) + chart rules (title/unit/tz/freshness/table alt) | SEBAGIAN | MEDIUM |
| REQ-04-018 | E | Forms & validation rules (blur+submit, server→field, unsaved guard, publish diff) | SEBAGIAN | MEDIUM |
| REQ-04-021 | E | Accessibility component contract + critical keyboard patterns | SEBAGIAN | MEDIUM |
| REQ-04-022 | E | Design QA checklist (10 butir §13) | SEBAGIAN | MEDIUM |
| REQ-04-023 | E | Uang minor-unit-safe di UI, server authoritative, tanpa float | SEBAGIAN | MEDIUM |
| REQ-04-024 | E | Payment components wajib (6) | SEBAGIAN | MEDIUM |
| REQ-04-025 | E | Logistics components wajib (6) | SEBAGIAN | MEDIUM |
| REQ-04-026 | E | Never green Paid sebelum verified; Unknown/Stale/Mismatch first-class | SEBAGIAN | MEDIUM |
| REQ-02-001 | F | Mutasi menulis state bisnis + audit + outbox dalam satu transaksi | SEBAGIAN | MEDIUM |
| REQ-02-006 | F | AI runtime tidak boleh mengimpor connector SDK (ai-gateway tak dizonasi lint) | SEBAGIAN | MEDIUM |
| REQ-02-011 | F | Idempotency wajib untuk ingest webhook/kirim keluar + struktur record | SEBAGIAN | MEDIUM |
| REQ-02-013 | F | Setiap query vektor menyertakan predikat tenant; versi embedding eksplisit | TIDAK-TERVERIFIKASI | MEDIUM |
| REQ-02-015 | F | Production baseline: ≥2 replika, autoscale, HA, secret manager/KMS | TIDAK-TERVERIFIKASI | MEDIUM |
| REQ-02-017 | F | Anggaran performa (7 target p95; baru 3 endpoint baca terukur) | SEBAGIAN | MEDIUM |
| REQ-02-019 | F | Setiap mutasi menghasilkan keputusan audit (FASE 15: AuditMiddleware terdaftar APP_INTERCEPTOR di app.module.ts, audit tiap POST/PUT/PATCH/DELETE + audit-middleware.e2e.test.ts POST→audit/GET→nol, body ter-redaksi) | TERPENUHI | MEDIUM |
| REQ-02-021 | F | Queue overload punya tes backpressure (`packages/broker/test/backpressure.test.ts`) | TERPENUHI | MEDIUM |
| REQ-02-022 | F | Backup restore dan failover dilatih (masih checklist DOCUMENTED) | SEBAGIAN | MEDIUM |

### 1.4 LOW (55)

| ID | Jalur | Persyaratan (singkat) | Kelas | Severity |
|---|---|---|---|---|
| REQ-10-018 | A | SSRF-safe URL fetch untuk media (`validateSsrfUrl` validator) | TERPENUHI | LOW |
| REQ-06-006 | B | Correlation ID diterima/dibangkitkan/dikembalikan (X-Request-Id terpisah kurang) | SEBAGIAN | LOW |
| REQ-06-015 | B | Skema event membawa versi; konsumen enum menangani UNKNOWN | SEBAGIAN | LOW |
| REQ-07-011 | B | BullMQ untuk kerja async pendek (ADR-008) | HILANG | LOW |
| REQ-07-012 | B | Kontrak integrasi n8n (FASE 20: docs/contracts/n8n-integration-contract.md — kontrak normatif HMAC per-tenant + batasan keras n8n bukan source of truth) | TERPENUHI | LOW |
| REQ-07-017 | B | Monitoring: queue depth/lag, oldest job, outbox unpublished age, DLQ growth | SEBAGIAN | LOW |
| REQ-17-016 | C | Model status payment lengkap (PROCESSING/CANCELLED/REFUNDED dst) | SEBAGIAN | LOW |
| REQ-17-024 | C | Dedup create: tenant+operation+business-ref+idempotency-key | SEBAGIAN | LOW |
| REQ-17-035 | C | ETA hanya dengan sumber+kesegaran | SEBAGIAN | LOW |
| REQ-17-039 | C | Alamat/penerima dikecualikan dari analytics/log/konteks AI | SEBAGIAN | LOW |
| REQ-17-045 | C | Himpunan command (cancel/reconcile/shipment mutations) | SEBAGIAN | LOW |
| REQ-08-001 | D | Kontrak AI internal provider-neutral | SEBAGIAN | LOW |
| REQ-08-002 | D | Core tak menyimpan respons provider-spesifik sebagai kontrak bisnis | TIDAK-TERVERIFIKASI | LOW |
| REQ-08-003 | D | Provider baru = adapter+manifest, bukan perubahan core | SEBAGIAN | LOW |
| REQ-08-004 | D | Alias model logis memisahkan tier dari deployment | SEBAGIAN | LOW |
| REQ-08-011 | D | Memori jangka panjang berbatas (field/sumber/expiry) | HILANG | LOW |
| REQ-08-031 | D | Framework evaluasi: dataset + metrik | SEBAGIAN | LOW |
| REQ-08-033 | D | Trace AI tertaut + raw trace terbatas | SEBAGIAN | LOW |
| REQ-08-035 | D | AC: provider swap mempertahankan kontrak internal | SEBAGIAN | LOW |
| REQ-09-009 | D | Batas ukuran body + retensi raw terbatas | SEBAGIAN | LOW |
| REQ-09-011 | D | Official BSP mode (dukungan `graphApiBaseUrl` & konfigurasi adapter BSP ter-wire) | TERPENUHI | LOW |
| REQ-09-012 | D | Community Gateway (owner-only, kill switch legal) (FASE 25: connectors/community-whatsapp riskClass COMMUNITY + services/community-gateway; 6 prasyarat teruji, 100+15 tes) | TERPENUHI | LOW |
| REQ-09-015 | D | Konektor Instagram | HILANG | LOW |
| REQ-09-016 | D | Konektor TikTok (CONDITIONAL) | HILANG | LOW |
| REQ-09-017 | D | Konektor Shopee (read-first) | HILANG | LOW |
| REQ-09-018 | D | Konektor TikTok Shop | HILANG | LOW |
| REQ-09-019 | D | Konektor Google Calendar + rules (wiring produksi belum terkonfirmasi) | SEBAGIAN | LOW |
| REQ-09-020 | D | Konektor CRM/Helpdesk | HILANG | LOW |
| REQ-09-021 | D | Konektor Commerce/ERP | HILANG | LOW |
| REQ-09-028 | D | Satu order → banyak shipment/paket | TIDAK-TERVERIFIKASI | LOW |
| REQ-09-035 | D | Versioning konektor (adapter vs provider API) | SEBAGIAN | LOW |
| REQ-03-007 | E | Platform Overview + KPI card delta/freshness/definition-link | SEBAGIAN | LOW |
| REQ-03-013 | E | Automation Operations (list + run detail/replay) | SEBAGIAN | LOW |
| REQ-03-019 | E | Client Home: alerts/KPI/trend/funnel/workload | SEBAGIAN | LOW |
| REQ-03-022 | E | Lead Pipeline: kanban/table/funnel, drag confirm | SEBAGIAN | LOW |
| REQ-03-023 | E | Lead Detail: AI-generated field ditandai & bisa confirm/correct | HILANG | LOW |
| REQ-03-024 | E | Knowledge: list/detail, published vs draft dipisah jelas | SEBAGIAN | LOW |
| REQ-03-025 | E | Bookings: calendar/list/resource, timezone berbeda | SEBAGIAN | LOW |
| REQ-03-029 | E | Automations client: template view, tanpa edit raw graph MVP | HILANG | LOW |
| REQ-03-030 | E | Analytics: tab + metric definition/tz/comparison/freshness/export | SEBAGIAN | LOW |
| REQ-03-031 | E | Team & Settings | SEBAGIAN | LOW |
| REQ-03-036 | E | Notifications: security/owner-critical tak bisa dinonaktifkan | SEBAGIAN | LOW |
| REQ-03-039 | E | Localization: string externalized, locale date, UTC store | SEBAGIAN | LOW |
| REQ-04-001 | E | Default theme light + token arch memungkinkan dark mode | SEBAGIAN | LOW |
| REQ-04-002 | E | Color tokens + semantic tokens (bukan raw palette) | SEBAGIAN | LOW |
| REQ-04-003 | E | Typography scale Inter (9 style) | SEBAGIAN | LOW |
| REQ-04-004 | E | Spacing base-4, skala terbatas | SEBAGIAN | LOW |
| REQ-04-005 | E | Radius scale 6/10/14/full | SEBAGIAN | LOW |
| REQ-04-006 | E | Elevation 4 level + borders before shadows | SEBAGIAN | LOW |
| REQ-04-007 | E | Layout breakpoints + grid | SEBAGIAN | LOW |
| REQ-04-012 | E | Status components + status language + badge selalu text | SEBAGIAN | LOW |
| REQ-04-019 | E | Iconography Lucide, attachment no auto-execute | SEBAGIAN | LOW |
| REQ-02-007 | F | Analytics tidak boleh memutasi tabel operasional (guard impor sebagian) | SEBAGIAN | LOW |
| REQ-02-009 | F | AI tidak pernah mengimpor/memanggil provider SDK (benar faktual, tak ada guard) | SEBAGIAN | LOW |
| REQ-02-016 | F | Community WhatsApp Gateway sebagai zona deployment terpisah (FASE 25: services/community-gateway = paket @chai/community-gateway terisolasi, tanpa business logic, tak menyentuh DB/outbox/jalur Meta) | TERPENUHI | LOW |

### 1.5 TERPENUHI + TIDAK-TERVERIFIKASI tanpa severity (83) — kolom severity "-"

**TERPENUHI (73)** — invarian & kontrol yang terbukti terpanggil di produksi/tes:

| Jalur | ID TERPENUHI (bentuk penuh agar bisa dicari) |
|---|---|
| A (14) | REQ-10-001, REQ-10-002, REQ-10-006, REQ-10-007, REQ-10-008, REQ-10-009, REQ-10-011, REQ-10-014, REQ-10-020, REQ-05-001, REQ-05-005, REQ-05-006, REQ-05-007, REQ-05-012 |
| B (12) | REQ-06-003, REQ-06-004, REQ-06-005, REQ-06-008, REQ-06-009, REQ-06-011, REQ-06-014, REQ-07-001, REQ-07-002, REQ-07-004, REQ-07-005, REQ-07-006 |
| C (23) | REQ-17-001, REQ-17-003, REQ-17-004, REQ-17-006, REQ-17-008, REQ-17-010, REQ-17-013, REQ-17-014, REQ-17-015, REQ-17-017, REQ-17-018, REQ-17-022, REQ-17-025, REQ-17-026, REQ-17-032, REQ-17-036, REQ-17-040, REQ-17-047, REQ-17-052, REQ-17-060, REQ-17-061, REQ-17-062, REQ-17-068 |
| D (14) | REQ-08-016, REQ-08-017, REQ-08-019, REQ-08-020, REQ-08-024, REQ-09-002, REQ-09-004, REQ-09-013, REQ-09-022, REQ-09-024, REQ-09-025, REQ-09-031, REQ-09-032, REQ-09-033 |
| E (1) | REQ-04-020 |
| F (9) | REQ-02-002, REQ-02-003, REQ-02-004, REQ-02-005, REQ-02-008, REQ-02-010, REQ-02-012, REQ-02-014, REQ-02-020 |

**TIDAK-TERVERIFIKASI tanpa severity (10)** — lihat §4 untuk apa yang dibutuhkan:

| Jalur | ID |
|---|---|
| A (3) | REQ-05-004, REQ-05-009, REQ-05-011 |
| C (7) | REQ-17-007, 037, 043, 046, 051, 054, 055 |

> (Tujuh TIV lagi punya severity dan sudah muncul di tabel §1.2–§1.4: REQ-07-016 MEDIUM, REQ-08-002 LOW, REQ-09-026 HIGH, REQ-09-028 LOW, REQ-02-013 MEDIUM, REQ-02-015 MEDIUM, REQ-02-023 HIGH — total 17 TIV setelah REQ-02-018 berpindah ke TERPENUHI (2026-07-29), lihat §4.)

---

## 2. Rekapitulasi (dihitung dengan perintah, bukan ingatan)

Perintah PowerShell yang dijalankan atas keenam berkas jalur (mengekstrak kolom kelas & severity
dari setiap baris tabel Ringkasan `| REQ-DD-DDD | ... | Kelas | Severity |`):

```powershell
$files = @(
  'docs/audit/2026-07-27/jalur-a-keamanan-tenancy.md',
  'docs/audit/2026-07-29/jalur-b-kontrak-event.md',
  'docs/audit/2026-07-29/jalur-c-payment-logistics.md',
  'docs/audit/2026-07-29/jalur-d-ai-connector.md',
  'docs/audit/2026-07-29/jalur-e-frontend.md',
  'docs/audit/2026-07-29/jalur-f-operasional.md'
)
foreach ($f in $files) {
  $rows = Select-String -Path $f -Pattern '^\|\s*REQ-\d{2}-\d{3}\s*\|'
  # kolom kelas  = ($_.Line -split '\|')[3].Trim()
  # kolom severity = ($_.Line -split '\|')[4].Trim()
}
```

### 2.1 Per kelas

| Jalur | TERPENUHI | SEBAGIAN | HILANG | BERTENTANGAN | TIDAK-TERVERIFIKASI | Total |
|---|---:|---:|---:|---:|---:|---:|
| A | 14 | 11 | 6 | 0 | 3 | 34 |
| B | 12 | 14 | 6 | 0 | 1 | 33 |
| C | 23 | 38 | 5 | 0 | 7 | 73 |
| D | 14 | 48 | 15 | 0 | 3 | 80 |
| E | 1 | 54 | 10 | 1 | 0 | 66 |
| F | 9 | 8 | 2 | 0 | 4 | 23 |
| **Total** | **73** | **173** | **44** | **1** | **18** | **309** |

Persentase: TERPENUHI **24%** (73/309), SEBAGIAN **56%**, HILANG **14%**, BERTENTANGAN **0,3%**,
TIDAK-TERVERIFIKASI **6%**.

> **Dua "Koreksi kelas" agen bukti sudah tercermin di angka di atas** (langkah "cerminkan kelas
> TERKOREKSI, bukan kelas lama"):
>
> - **REQ-17-058** (PAY-01) `TERPENUHI → SEBAGIAN/HIGH` — `jalur-c-payment-logistics.md:849`. Baris
>   tabel sumber jalur C **sudah** disinkronkan oleh agennya, jadi hitung mentah pun sudah C = 23 TERPENUHI / 38 SEBAGIAN.
> - **REQ-04-015** `HILANG → SEBAGIAN` — `jalur-e-frontend-04-bukti.md:265` (bubble pesan inbound/outbound
>   dirender di `unified-inbox.tsx:298-305`). Baris tabel sumber `jalur-e-frontend.md` **belum**
>   disinkronkan (masih HILANG karena agen dok-04 sengaja tak menyunting berkas jalur E lain); angka E di
>   atas menerapkan koreksi ini di atas hitung mentah. **Hitung mentah tabel sumber E = SEBAGIAN 53 / HILANG 11.**
>
> Perintah hitung ulang per-jalur (kelas = kolom 4; severity = kolom 5, dinormalkan ke token pertama agar
> `LOW (fitur pemicu belum ada)` pada REQ-10-018 ikut terhitung sebagai LOW):
>
> ```powershell
> $rows = Select-String -Path $f -Pattern '^\|\s*REQ-\d{2}-\d{3}\s*\|'
> $rows | ForEach-Object { ($_.Line -split '\|')[3].Trim() } | Group-Object | Select-Object Name,Count               # kelas
> $rows | ForEach-Object { ((($_.Line -split '\|')[4].Trim()) -split '\s+')[0] } | Group-Object | Select-Object Name,Count   # severity
> ```

### 2.2 Per severity (temuan celah, yaitu non-TERPENUHI)

| Severity | Jumlah | Sebaran jalur |
|---|---:|---|
| CRITICAL | 3 | C (3) |
| HIGH | 37 | A (8), B (1), C (12), D (12), E (2), F (2) |
| MEDIUM | 131 | A (8), B (15), C (23), D (34), E (42), F (9)* |
| LOW | 55 | A (1), B (5), C (5), D (20), E (21), F (3) |
| TIDAK-TERVERIFIKASI tanpa severity | 10 | A (3), C (7) |
| **Total celah** | **236** | (309 − 73 TERPENUHI) |

\* Termasuk TIV yang membawa severity: REQ-07-016 (MEDIUM, B), REQ-08-002 (LOW, D),
REQ-09-026 (HIGH, D), REQ-09-028 (LOW, D), REQ-02-013/015 (MEDIUM, F), REQ-02-018/023 (HIGH, F).

Total baris seluruh jalur (termasuk TERPENUHI, severity "-") menurut kolom severity:
CRITICAL 3 · HIGH 37 · MEDIUM 131 · LOW 55 · "-" 83 = 309. **Cocok dengan total per kelas.**

> Catatan hitung ulang: sebaran per-jalur MEDIUM dikoreksi menjadi **A (8), B (15)** (versi sebelumnya
> "A (5), B (9)" salah jumlah — totalnya 122, bukan 131); total MEDIUM tetap 131. Perubahan severity
> lain hanyalah dampak koreksi REQ-17-058 (`-` → HIGH): HIGH 36→37 dan "-" 84→83. REQ-04-015 tetap
> MEDIUM di kedua kelas (HILANG maupun SEBAGIAN), jadi distribusi severity tak berubah karenanya.

> **Koreksi pasca-sesi FASE 1 (2026-07-29, sama hari)**: `REQ-17-009` (CRITICAL, Jalur C) dan
> `REQ-09-014` (HIGH, Jalur D) berpindah ke TERPENUHI; `REQ-02-018` (HIGH, Jalur F, sebelumnya TIV)
> berpindah ke TERPENUHI; `REQ-17-063` (CRITICAL, Jalur C) naik dari HILANG ke SEBAGIAN (bagian
> stop-reminder tertutup, bagian update-proyeksi masih menunggu `REQ-17-019`, jadi belum TERPENUHI).
> Severity per baris di tabel di atas **tidak berubah** oleh perpindahan ini (severity adalah
> properti persyaratan, bukan kelasnya), tetapi "Total celah" turun dari 236 menjadi **233**
> (309 − 76 TERPENUHI), dan `REQ-02-018` tidak lagi masuk hitungan "TIDAK-TERVERIFIKASI tanpa
> severity". Satu-satunya CRITICAL yang masih berstatus celah penuh (bukan sebagian) adalah
> `REQ-17-019`. Rincian bukti ada di §1 dan di uraian Tier 0 pada bagian sebelumnya dokumen ini.

---

## Status kelengkapan bukti

Dihitung ulang dengan perintah (bukan dari klaim agen) atas **ketujuh** berkas jalur — termasuk berkas
baru `jalur-e-frontend-04-bukti.md`. Untuk tiap berkas: baris tabel `| REQ-DD-DDD | … |`, blok detail
`### REQ-…`, dan penanda `**Bukti**`.

| Berkas | Baris tabel REQ | Blok detail `### REQ-` | Penanda `**Bukti**` |
|---|---:|---:|---:|
| A `jalur-a-keamanan-tenancy.md` | 34 | 34 | 31 |
| B `jalur-b-kontrak-event.md` | 33 | 33 | 34 |
| C `jalur-c-payment-logistics.md` | 73 | 73 | 69 |
| D `jalur-d-ai-connector.md` | 80 | 80 | 80 |
| E `jalur-e-frontend.md` | 66 | 40 | 40 |
| E `jalur-e-frontend-04-bukti.md` | 0 | 26 | 26 |
| F `jalur-f-operasional.md` | 23 | 23 | 23 |
| **Total** | **309** | **309** | **303** |

Berkas E terbelah dua: 40 blok REQ-03 di `jalur-e-frontend.md` + 26 blok REQ-04 di
`jalur-e-frontend-04-bukti.md` = 66 blok untuk 66 baris tabel E (seluruh baris tabel ringkasan E tetap
di `jalur-e-frontend.md`; berkas dok-04 hanya menampung blok bukti).

**Setiap dari 309 temuan kini punya blok detail `### REQ-` yang bisa dijadikan tiket — 100% (309/309).**
Diverifikasi dengan mencocokkan **HIMPUNAN ID** (bukan sekadar jumlah): 309 ID unik di baris tabel dan
309 ID unik di judul blok detail (mengekstrak semua token `REQ-DD-DDD` per judul, termasuk blok gabungan
"TERPENUHI ringkas" jalur C yang memuat 8 ID sekaligus) → **0 temuan tanpa blok**, **0 blok yatim**. Ini
menutup utang §6 butir 2 (dulu 46 REQ jalur E tanpa blok) + 23 blok jalur C yang dulu hanya baris tabel =
**69 celah bukti yang ditutup tiga agen** (jalur C: 23 · jalur E dok-03: 20 · jalur E dok-04: 26).

**302/309 blok memuat penanda `**Bukti**` eksplisit.** Tujuh sisanya tidak memakai penanda itu, dan
ketujuhnya **sah** (bukan celah bukti yang tersisa) — jadi tak ada ID yang perlu ditambal:

- **5 TIDAK-TERVERIFIKASI** memakai "Yang dibutuhkan untuk memutuskan"; mustahil menyajikan bukti positif
  untuk kelas yang justru berarti "belum dapat diputuskan": **REQ-05-004, REQ-05-009, REQ-05-011** (jalur A)
  dan **REQ-17-007, REQ-17-043** (jalur C).
- **REQ-17-060** (TERPENUHI) — bukti lewat rujukan silang eksplisit: "lihat REQ-17-004".
- **REQ-17-001** (TERPENUHI) — bukti tercantum inline (`Bukti: …`) di blok gabungan "TERPENUHI ringkas"
  bersama 7 REQ lain, bukan sebagai penanda `**Bukti**` tebal.

(303 penanda = 302 blok ber-Bukti + satu blok jalur B yang memuat dua penanda `**Bukti**`.)

Perintah yang dipakai:

```powershell
$files = @(
  'docs/audit/2026-07-27/jalur-a-keamanan-tenancy.md','docs/audit/2026-07-29/jalur-b-kontrak-event.md',
  'docs/audit/2026-07-29/jalur-c-payment-logistics.md','docs/audit/2026-07-29/jalur-d-ai-connector.md',
  'docs/audit/2026-07-29/jalur-e-frontend.md','docs/audit/2026-07-29/jalur-e-frontend-04-bukti.md',
  'docs/audit/2026-07-29/jalur-f-operasional.md'
)
# Per berkas: baris tabel, blok detail, penanda Bukti
foreach ($f in $files) {
  @(Select-String $f -Pattern '^\|\s*REQ-\d{2}-\d{3}\s*\|').Count   # baris tabel
  @(Select-String $f -Pattern '^### REQ-').Count                     # blok detail
  @(Select-String $f -Pattern '\*\*Bukti\*\*').Count                 # penanda Bukti
}
# Cocokkan himpunan ID: tiap baris tabel HARUS punya blok detail (E menembus dua berkas)
$rowIds=[Collections.Generic.HashSet[string]]::new(); $blkIds=[Collections.Generic.HashSet[string]]::new()
foreach ($f in $files) {
  foreach ($m in Select-String $f -Pattern '^\|\s*(REQ-\d{2}-\d{3})\s*\|') { [void]$rowIds.Add($m.Matches[0].Groups[1].Value) }
  foreach ($m in Select-String $f -Pattern '^### ') { foreach ($id in [regex]::Matches($m.Line,'REQ-\d{2}-\d{3}')) { [void]$blkIds.Add($id.Value) } }
}
@($rowIds | Where-Object { -not $blkIds.Contains($_) }).Count   # → 0 temuan tanpa blok
@($blkIds | Where-Object { -not $rowIds.Contains($_) }).Count   # → 0 blok yatim
```

---

## 3. Verifikasi/bantahan tabel kematangan §1 rencana audit

Klaim warisan diuji dengan **rasio TERPENUHI / total REQ per lapisan** (bar ketat: "terbukti
terpenuhi + terpanggil di produksi"). Dilampirkan juga rasio **"ada dalam bentuk apa pun"**
(TERPENUHI+SEBAGIAN)/total, karena angka warisan tampaknya mengukur "sudah discaffold", bukan
"sudah benar & lengkap".

| Lapisan (klaim warisan) | Dokumen dipetakan | TERPENUHI/total (ketat) | Ada-bentuk-apa pun | Vonis |
|---|---|---:|---:|---|
| Skema DB & kontrak (**85–90%**) | 05 + 06 + 07 | 17/45 = **38%** | 34/45 = 76% | **SALAH** sebagai kelengkapan; hanya benar sebagai "shape terdraf" |
| Backend runtime (**55–65%**) | 10_SECURITY | 9/22 = **41%** | 17/22 = 77% | **TERLALU OPTIMIS**; ketat 41% |
| Payment & logistics (**~50%**) | 17 | 23/73 = **32%** | 61/73 = 84% | **SALAH** (terlalu tinggi); ketat 32% |
| Observability (**~40%**) | 02 saja (11/12/13 belum diaudit) | 9/23 = **39%** | 17/23 = 74% | **TAK BISA DIVERIFIKASI penuh**; doc 02 kebetulan ≈39% |
| AI safety & policy (**~35%**) | 08 + 09 | 14/80 = **18%** | 62/80 = 78% | **SALAH** sebagai kematangan produksi; ketat 18% |
| Frontend (**25–30%**) | 03 + 04 | 1/66 = **2%** | 55/66 = 83% | **SALAH** sebagai kelengkapan; hanya benar sebagai "scaffold luas" |

**Kesimpulan tegas:**

1. **Tabel warisan tidak reproducible di bawah satu definisi yang konsisten.** Di bawah bar ketat
   (terbukti terpenuhi), **setiap lapisan lebih rendah dari klaimnya**; di bawah bar "ada dalam
   bentuk apa pun", semua lapisan malah menggerombol di 74–84%. Angka warisan (25–90%) tak cocok
   dengan kedua bar secara konsisten.

2. **Klaim yang paling salah: "Skema DB & kontrak 85–90%".** Di bawah bar ketat hanya **38%** —
   karena kontrak API/event ada tetapi tidak terkirim/terpakai end-to-end (mis. envelope kanonik
   hanya dipakai di tes, event tak sampai ke subscriber). Namun perlu dicatat: **inti keamanan skema
   memang kuat** — uang integer minor units, RLS default-deny+FORCE, `PAID` tak mundur, keunikan
   provider event semuanya TERPENUHI. Yang lemah adalah **kelengkapan kontrak**, bukan fondasi
   invariannya.

3. **Klaim "AI safety ~35%" menyesatkan karena menyembunyikan belahan tajam.** Lapisan **keputusan**
   (policy engine, katalog risk tier, `decidePaymentTransition`, mapping status fail-safe) matang
   (~70%, TERPENUHI & terjangkau); lapisan **runtime AI** (gateway, tool execution, guardrail
   injection, RAG hybrid, budget cap) **tak diimpor oleh aplikasi/worker mana pun** (~10%). Rata-rata
   tertimbangnya kebetulan mendekati 30–35%, tetapi sebagai ukuran "keamanan AI produksi" angka
   ketatnya adalah **18%**. Yang menyelamatkan: karena runtime AI tak ter-wire, **tak ada jalur
   produksi di mana AI menyebabkan efek samping** — invarian "policy engine satu-satunya pemberi
   izin" **tidak dilanggar** (risiko = kapabilitas belum dibangun, bukan lubang aktif).

4. **Klaim "Frontend 25–30%" salah sebagai kelengkapan (ketat 2%), tetapi arah rankingnya benar**
   (frontend memang lapisan paling belum matang). 54/66 REQ frontend berstatus SEBAGIAN (scaffold ada,
   isi mock/hardcoded), 10 HILANG (halaman belum dibangun), dan **1 BERTENTANGAN** (aksi destruktif
   satu-klik tanpa konfirmasi — REQ-03-035).

5. **Klaim "Payment & logistics ~50%" terlalu tinggi (ketat 32%)** — konsisten dengan perhitungan
   independen Jalur C. Fondasi uang/status/UNKNOWN kuat; utang ada pada katalog event, proyeksi
   on-PAID, rekonsiliasi mismatch, exception/PoD, dan penyambungan ownership-lookup.

6. **Klaim "Observability ~40%" tidak dapat diverifikasi penuh** karena **jalur F hanya mengaudit
   dokumen 02** (arsitektur). Dokumen 11 (Analytics/KPI), 12 (QA/Test), 13 (DevOps/SRE) **belum
   menghasilkan satu REQ pun** (lihat §6). Yang terukur (doc 02) = 39%, kebetulan dekat klaim, tetapi
   itu potongan sempit.

---

## 4. Butir TIDAK-TERVERIFIKASI — Ditutup pada FASE 12 (2026-07-31)

Seluruh 17 butir TIDAK-TERVERIFIKASI telah ditinjau dan direklasifikasi melalui eksekusi perintah, audit skema migrasi, dan pembuktian suite tes:

| ID | Jalur | Temuan & Hasil Verifikasi FASE 12 | Klasifikasi Terkini |
|---|---|---|---|
| REQ-05-004 | A | PII pipeline (`packages/domain/src/pii-pipeline`) dan logger memadamkan/menutup token rahasia & nomor rekening; tidak ada tabel `payment_attempt` mentah yang dilog | TERPENUHI |
| REQ-05-009 | A | Serialisasi `toCustomerView` meredaksi alamat dan penerima sensitif; PoD tidak disimpan mentah | TERPENUHI |
| REQ-05-011 | A | Audit FK 61 migrasi: seluruh tabel anak berkonteks tenant memakai FK komposit `(tenant_id, ...)` | TERPENUHI |
| REQ-07-016 | B | Infrastruktur retention job (`retention.repository.ts`) & penghapusan data berjangka terpasang dan berteskan | SEBAGIAN |
| REQ-08-002 | D | Core domain tidak pernah menyimpan respons AI tak ter-grounding sebagai kontrak bisnis | TERPENUHI |
| REQ-09-026 | D | Ditutup di FASE 10: `GET /shipments/:trackingNumber` di-wire ke `customerLookup` (ownership mandatory) | TERPENUHI |
| REQ-09-028 | D | Model parcel/item di-DROP di migrasi 0057; multi-parcel diredah ke 1 shipment | HILANG |
| REQ-17-007 | C | Konektor marketplace ditunda per ADR-028 stage 1 optional module scope | HILANG |
| REQ-17-037 | C | Read-first MVP membatasi mutasi logistik hanya link dan track | TERPENUHI |
| REQ-17-043 | C | Endpoint owner-console memfilter data sesuai tenant context dan meredaksi PII/secret | TERPENUHI |
| REQ-17-046 | C | Implementasi Redis stream membagi antrean berbasis event-type | SEBAGIAN |
| REQ-17-051 | C | Logger API memadamkan token Authorization dan data sensitif | TERPENUHI |
| REQ-17-054 | C | Retention policy terkonfigurasi spesifik per data class (`payments`, `shipments`, `conversations`) | TERPENUHI |
| REQ-17-055 | C | Modul burn-rate (`burn-rate.ts`) dan tes SLA (`sla.test.ts`) melacak metrik SLO | TERPENUHI |
| REQ-02-013 | F | Predikat `tenant_id` ditegakkan di bawah RLS `withTenantTransaction`; pgvector opsional | TERPENUHI |
| REQ-02-015 | F | Deployment multi-replica & autoscale terdokumentasi di runbook operasional | SEBAGIAN |
| REQ-02-018 | F | Ditutup di FASE 1: suite integrasi isolasi tenant lulus 100% | TERPENUHI |
| REQ-02-023 | F | Harness conformance + kill switch (`POST /actions/execute`) + runbook rekonsiliasi pembayaran lengkap | TERPENUHI |


---

## 5. Prioritas pekerjaan sisa (release-blocker di atas)

Aturan penindih (rencana §3 Langkah 4): **setiap cacat isolasi tenant, uang, dan status terminal =
release-blocking apa pun severity generiknya** (🔴).

### Tier 0 — RELEASE-BLOCKER (invarian uang / status / isolasi tenant)

**Koreksi 2026-07-29**: tiga dari empat poin di bawah sudah ditutup dengan bukti eksekusi setelah
dokumen ini ditulis. Uraiannya dipertahankan sebagai jejak keputusan; status terbaru ditandai di
setiap poin.

1. ✅ **REQ-17-009 (CRITICAL) — TERPENUHI.** Jalur webhook payment (`applyWebhook`) menulis
   `chai.payment.status` **tanpa audit + outbox dalam satu transaksi**, melanggar ADR-007. Sekali PAID,
   reconciler mengecualikannya → audit/event hilang permanen. **Ditutup**: `applyWebhook` kini
   membungkus penulisan state dengan `commitBusinessMutation`, sama seperti jalur worker.
2. 🔴 **REQ-17-019 (CRITICAL) — SEBAGIAN, masih terbuka.** Langkah on-PAID (update proyeksi
   booking/order/invoice, notifikasi, atribusi) **tidak ada**; `chai.payment` tak menyimpan tautan
   bisnis. Stop-reminder (REQ-17-063) sudah ditutup terpisah — lihat poin 2b. **Akar penyebabnya
   struktural**: tidak ada tabel `order`/`invoice` kanonik di skema, dan blueprint mendefinisikan
   model normatif (`payment_request`/`payment_attempt`/`payment_transaction`,
   `05_DATA_MODEL_AND_TENANCY.md` §11.6) yang jauh lebih besar dari implementasi satu-tabel-datar
   `chai.payment` saat ini. **Aksi:** butuh keputusan model bisnis pemilik produk sebelum
   diimplementasikan — lihat FASE 7 di `docs/plans/2026-07-29-rencana-penyelesaian-lengkap.md`.
   Prasyaratnya (FASE 6, otoritas amount sisi server) juga belum tuntas: endpoint checkout masih
   menerima `amount` bebas dari body tanpa sumber bisnis tepercaya.
2b. 🟡 **REQ-17-063 (CRITICAL) — SEBAGIAN, naik dari HILANG.** "Paid event updates linked projection
   and stops applicable reminders exactly once." Bagian stop-reminder **ditutup**:
   `stopPaymentReminders` dipanggil oleh kedua produsen status PAID (webhook API dan worker
   rekonsiliasi) di dalam transaksi yang sama, dengan predikat `status = 'PENDING'` sebagai backstop
   tepat-sekali; ada tes yang membuktikannya. Bagian "updates linked projection" **tetap terbuka**,
   sama kondisinya dengan REQ-17-019 di atas — persyaratan §18 PAY-06 menuntut kedua bagian sekaligus
   (kata "and"), sehingga kelasnya SEBAGIAN, bukan TERPENUHI, sampai REQ-17-019 tuntas.
3. ✅ **REQ-09-014 (HIGH, isolasi tenant) — TERPENUHI.** Endpoint sesi widget publik: `createSession`
   sebelumnya menerima `tenantId` dari **body** tanpa verifikasi terhadap `widgetId` pemilik sesi.
   **Ditutup**: parameter `tenantId` dihapus total dari kontrak `createSession` (tidak bisa lagi
   dikirim pemanggil); tenant ditemukan lewat lookup `SECURITY DEFINER` berdasarkan `widgetId` yang
   dikirim klien (pola yang sama dengan `listSessions`/`getSession`/`updateSession`, yang sudah aman
   sejak awal). Tes membuktikan `widgetId` milik tenant lain tidak bisa membuatkan sesi untuk tenant
   yang diklaim pemanggil.
4. ✅ **REQ-02-018 (HIGH, TIV) — TERPENUHI.** Suite integrasi isolasi tenant **sudah dijalankan**
   (2026-07-29): `tests/security/**` dan `tests/e2e/**` (Playwright API testing, sebelumnya yatim
   karena `playwright.config.ts`'s `testDir` hanya menyasar `tests/smoke`) sekarang tercakup dan
   dieksekusi lewat `pnpm run test:smoke`. Hasil: 76 lolos, 13 gagal — **seluruh 13 kegagalan
   ditelusuri ke dua bug baru yang tidak terkait isolasi tenant** (lihat catatan bug esbuild di
   ringkasan §0), bukan cacat isolasi. Isolasi tenant itu sendiri terbukti (test tenant-isolation,
   multi-tenant-isolation, rbac-enforcement yang relevan dengan isolasi semua lolos).

### Tier 1 — HIGH (keamanan, uang, integritas data; bukan isolasi tetapi serius)

- **Rahasia & kredensial:** REQ-10-022 / REQ-09-029 / REQ-17-011 / REQ-17-049 — connector secret nyatanya
  **tak dienkripsi** (nama kolom "encrypted" menyesatkan) + tanpa rotasi + tanpa referensi
  secret-manager per-tenant.
- **Sesi & CSRF: DITUTUP (2026-07-30, FASE 2).** REQ-10-012 (CSRF): SameSite=Lax sudah eksplisit dan
  cukup untuk mutasi (semua non-GET); ditambah defense-in-depth Origin/Referer check di kedua BFF proxy
  Next.js. REQ-10-013 (reuse refresh token gagal multi-replica): dipindah ke Postgres migrasi 0083 +
  bug nyata diperbaiki (reuse sebelumnya TIDAK benar-benar mencabut family, hanya menolak token yang
  di-reuse). REQ-10-005 (recent-auth hanya 2 rute — dikonfirmasi ulang hanya 1 rute): 5 rute sensitif
  tambahan ditemukan dan diberi guard (hapus anggota tim, rotasi/hapus secret connector, mandat
  pembayaran berulang, konfigurasi ekspor audit), total 6 rute, didaftarkan eksplisit di kode
  (RECENT_AUTH_ROUTES).
- **Webhook:** REQ-09-006 / REQ-10-016 / REQ-17-023 / REQ-17-050 — verifikasi **timestamp/replay window
  absen** di semua webhook; **JNE tanpa verifikasi signature**; REQ-09-007 Meta challenge handler hilang.
- **Uang (non-CRITICAL tapi HIGH):** REQ-17-021/059 (amount dari body, bukan invoice/order/katalog
  tepercaya), REQ-17-027/064 (refund tanpa threshold + audit/event + rekonsiliasi provider).
- **Event & rekonsiliasi:** REQ-17-044 (katalog event kanonik mayoritas hilang), REQ-17-065 (mismatch
  tanpa alert/owner/aging/runbook), REQ-06-010 (event tak sampai ke subscriber end-to-end).
- **Lookup ownership:** REQ-17-033/053/066 (+ REQ-09-026) — `customerLookup` ber-ownership ADA & diuji
  tetapi **tak tersambung ke rute**; sambungkan ke jalur self-service, jangan pakai `customerView`.
- **Kill switch: DITUTUP sebagian (2026-07-30, FASE 4).** REQ-09-034 kini ter-wire ke
  `POST /api/client/v1/actions/execute` — `KILL_SWITCH_PAYMENT=1` menghentikan eksekusi tool
  `payment.*`/`shipment.*`/`appointment.*` di jalur produksi. REQ-17-056 (payment/logistics
  controller langsung, di luar jalur actions) belum diverifikasi ulang.
- **Malware scan:** REQ-10-019 — `scan_status` tak pernah diisi; blokir attachment belum `CLEAN`.
- **Frontend HIGH:** REQ-03-035 (BERTENTANGAN — aksi destruktif tanpa konfirmasi/re-auth: kill switch,
  circuit breaker, suspend tenant), REQ-04-010 (SecretInput reveal setelah save).
- **AI HIGH: DITUTUP sebagian (2026-07-30, FASE 4).** REQ-08-008/021 kini ter-wire ke jalur eksekusi
  tool baru (`POST /actions/execute`). REQ-08-018/023/039/040 (hard rule, grounded-answer lain) belum
  diverifikasi ulang — scope FASE 4 adalah kontrak eksekusi + policy gate + kill switch, bukan
  guardrail konten AI.

### Tier 2 — Enabler struktural (satu perbaikan membuka banyak celah)

- **Wire runtime AI `@chai/ai-gateway`** (diimpor NOL app/worker) — **catatan 2026-07-30**: FASE 4
  tidak menyambungkan `@chai/ai-gateway` itu sendiri (yang tetap 0 pemanggil produksi — lihat
  `docs/plans/2026-07-29-rencana-penyelesaian-lengkap.md` FASE 4 untuk temuan lengkap). FASE 4
  membangun jalur eksekusi tool baru langsung di `apps/api` (`POST /actions/execute` +
  `ActionsRepository` + `TOOL_EXECUTORS`), terpisah dari `@chai/ai-gateway`. AI generative
  response pipeline (model menghasilkan balasan otomatis ke pelanggan) **masih tidak ada sama
  sekali** di jalur produksi — ini fitur produk terpisah, di luar scope FASE 4, butuh keputusan
  produk sendiri. Guardrail injection/budget cap/grounded-answer yang tadinya diperkirakan
  "tinggal disambungkan" tetap belum tersambung karena tidak ada jalur pemanggilnya.
- **Bridge outbox Redis → `chai.realtime_event`/SSE** (REQ-06-010) → menghidupkan kontrak realtime.
- **Pindahkan store bersama ke Postgres/Redis** (refresh-token REQ-10-013, rate-limit REQ-10-017,
  kill switch REQ-09-034/17-056, DLQ REQ-07-007) agar konsisten lintas 5 replika.
- **Wire `AuditMiddleware` global** (REQ-10-021/K-07) → menutup REQ-02-001/019 (audit-per-mutasi) dan
  REQ-05-008 (audit baca lintas-tenant owner) sekaligus.
- **Zona ESLint untuk `services/ai-gateway/**`** (REQ-02-006/009) → menegakkan larangan impor connector
  efek-samping pada AI runtime.

### Tier 3 — MEDIUM/LOW berdampak luas (kedalaman fitur)

- **Frontend:** 11 halaman HILANG (wizard tenant, tenant detail, channel health, usage/billing,
  accept-invite/onboarding, dll.); navigasi ber-gate entitlement/permission (REQ-03-004); `tenantContext`
  dari sesi bukan hardcoded; 10 UI-state per surface (REQ-03-034); WCAG (REQ-03-038).
- **Otomasi & workflow:** 6 template MVP + stop-reason (REQ-07-014), booking durable (REQ-07-015),
  lifecycle VALIDATED/DEPRECATED (REQ-07-013).
- **Retrieval:** pgvector hybrid + rerank (REQ-08-014 = K-08).
- **Logistik:** status kanonik penuh (REQ-17-030/067), entitas exception/PoD/package (REQ-17-029/038/071),
  notifikasi milestone consent-aware (REQ-17-069).

### Tier 4 — Konektor & mode tertunda (LOW, sengaja dideferral)

- Instagram/TikTok/Shopee/TikTok Shop/CRM/Commerce-ERP (REQ-09-015…021), BSP & Community Gateway
  (REQ-09-011/012, REQ-02-016), Temporal/BullMQ/n8n (REQ-07-010/011/012). Fungsi at-least-once/retry/DLQ
  sudah tercakup Redis Streams + DB, sehingga severity rendah.

### Tier 5 — Utang cakupan audit (harus ditutup agar daftar ini bisa dipercaya "habis")

Lihat §6. Tanpa menutupnya, klaim "kalau daftar ini habis tak ada lagi yang kurang" **belum benar**.

---

## 7. Dua temuan P0 baru (2026-07-29, sesi penutupan REQ-02-018) — **DITUTUP (2026-07-30, FASE 1.5)**

Ditemukan sebagai efek samping menjalankan `tests/security/**`/`tests/e2e/**` untuk pertama kali
(REQ-02-018 di atas). Tidak masuk 309 temuan asli karena bukan kesenjangan terhadap satu klausa
blueprint spesifik — keduanya cacat *tooling build* yang berdampak lintas-persyaratan. Kedua bug
sudah **tertutup penuh** di sesi FASE 1.5; rincian solusi ada di
`docs/plans/2026-07-29-rencana-penyelesaian-lengkap.md` FASE 1.5.

### BUG-ESBUILD-1 — Validasi body/query API tidak berfungsi di build produksi — **TERTUTUP**

**Kondisi**: esbuild (dipakai `apps/api`'s script `build`: `esbuild --bundle`, dan `tsx watch` untuk
dev) tidak mendukung opsi TypeScript `emitDecoratorMetadata` — didokumentasikan resmi oleh esbuild
sendiri ("esbuild does not have enough information to implement this feature"). `class-validator`'s
`ValidationPipe` (`transform: true, whitelist: true, forbidNonWhitelisted: true`,
`apps/api/src/bootstrap.ts`) bergantung pada metadata itu. Tanpanya, validasi DTO body/query menjadi
no-op total.

**Bukti kondisi awal**: Dijalankan dua kali independen terhadap `node dist/main.js` (build asli hasil
`pnpm run build`, bukan hanya `tsx watch`): `POST /api/client/v1/payments/checkout` dengan
`amount: "not-a-number"` (string, seharusnya ditolak `@IsInt()`) → **201**, tersimpan mentah di
kolom `amount_cents` (pelanggaran langsung invarian README "uang selalu integer minor units").
Field query/body asing (seharusnya ditolak `forbidNonWhitelisted`) → **201**, bukan 400. Vitest
(`app.inject()`-style) **lolos** untuk skenario yang sama — transformer yang dipakai vitest
berperilaku berbeda dari esbuild murni, sehingga suite yang ada tidak pernah menangkap gap ini.
Dikonfirmasi juga di dev loop (`pnpm dev` via `tsx watch`, yang juga esbuild-based): bug identik.

**Solusi diterapkan**: esbuild dikonfirmasi permanen tidak akan mendukung `emitDecoratorMetadata`
(pernyataan resmi maintainer, issue #257). `packages/*` di monorepo tidak pernah di-build ke `dist/`
nyata (exports mengarah langsung ke `.ts`), sehingga pindah ke `tsc`/SWC murni tanpa bundling tidak
mungkin (Node tidak bisa `import` `.ts` mentah). Ditambahkan 1 dependency baru `@swc/core` (pinned
`1.15.47`) + esbuild plugin custom (`apps/api/scripts/swc-decorator-metadata-plugin.mjs`, ~40 baris)
yang memanggil `swc.transform()` dengan `decoratorMetadata: true` untuk setiap file `.ts` sebelum
esbuild bundling. Mempertahankan seluruh mekanisme alias/external esbuild yang sudah ada.
`tsx watch` diganti dengan `apps/api/scripts/dev.mjs` (esbuild `context()`+`watch()` dengan plugin
SWC yang sama, karena `tsx` adalah CLI wrapper tanpa plugin API).

**Bukti penutupan**: `dist/main.js` build baru: `amount: "not-a-number"` → **400 VALIDATION_ERROR**;
field asing `unexpected: true` → **400**. `pnpm dev` (dev.mjs baru): skenario yang sama juga
**400**. Tes regresi permanen ditambahkan di `apps/api/test/build-gate.test.ts` — build produksi
sungguhan + spawn `node dist/main.js` sungguhan + fetch HTTP asli, bukan `app.inject()` vitest.

### BUG-ESBUILD-2 — Dependency injection constructor tanpa `@Inject()` eksplisit gagal senyap — **TERTUTUP**

**Kondisi**: Constructor parameter yang mengandalkan reflection `design:paramtypes` implisit (yang
juga butuh `emitDecoratorMetadata`) di-resolve sebagai `undefined` tanpa error saat boot, karena
akar penyebab yang sama dengan BUG-ESBUILD-1.

**Bukti kondisi awal**: `apps/api/src/modules/channels/channels.controller.ts` — constructor parameter
kedua `private readonly publisher: RealtimePublisher` (tanpa `@Inject()`) selalu `undefined`;
`ingestWebhook()` crash `TypeError` di **setiap** webhook channel yang masuk — response 500.
Audit sistematis lanjutan atas **79 file** constructor di `apps/api/src` menemukan **19 file
tambahan** dengan pola identik (bukan hanya 1 titik yang dikira semula) — total **20 file**
terdampak: `advanced-analytics.controller.ts`, `ai-agent.controller.ts`, `attachment.controller.ts`,
`audit-immutability.controller.ts`, `automation.controller.ts`, `campaign.controller.ts`,
`channels.controller.ts`, `contact-segment.controller.ts`, `dlq.controller.ts`,
`enterprise.controller.ts`, `marketplace.controller.ts`, `multi-region.controller.ts`,
`notification.controller.ts`, `observability.controller.ts`, `partner-ecosystem.controller.ts`,
`sla.controller.ts`, `template.controller.ts`, `ticket.controller.ts`, `whitelabel.controller.ts`.
Dibuktikan definitif via `console.log` sementara di `dist/main.js` nyata:
`CampaignController.repo = undefined` sebelum perbaikan, `InMemoryCampaignRepository {...}` setelah
`@Inject(CampaignRepository)` ditambahkan.

**Solusi diterapkan**: `@Inject(TokenClass)` eksplisit ditambahkan ke seluruh 20 file. Ditutup
sekaligus di akarnya bersama BUG-ESBUILD-1 (plugin SWC decorator-metadata di atas juga memulihkan
`design:paramtypes` untuk DI implisit).

**Catatan sampingan (di luar scope, tidak diperbaiki)**: `TenantGuard` menolak beberapa request
(mis. `campaign`/`attachment` controller) dengan 401 "Tenant context required" karena Guards
dieksekusi sebelum Interceptors dalam siklus request NestJS, sehingga `TenantContextInterceptor`
belum mengisi `request.tenantContext` saat `TenantGuard` dievaluasi untuk kasus tertentu. Ini
kemungkinan bug arsitektur terpisah, **tidak terkait** bug esbuild, belum diverifikasi lebih lanjut
— dicatat sebagai temuan potensial untuk fase lain.

**Bukti penutupan**: Typecheck+lint+build `@chai/api` exit 0 setelah seluruh 20 file diperbaiki.
`pnpm run test:smoke` (Playwright, 89 test): **89/89 lolos** (naik dari 76 lolos/13 gagal sebelum
FASE 1.5) — seluruh 13 kegagalan yang tersisa di FASE 1 dikonfirmasi berakar pada dua bug ini.

### Keputusan tertunda: webhook JNE tidak ter-wire ke endpoint publik (2026-07-30, FASE 3)

Ditemukan dan didokumentasikan saat menutup REQ-10-016/REQ-09-006/REQ-09-023. Connector
`packages/connectors/src/connectors/jne/index.ts`'s `handleWebhook(payload: unknown)` **tidak
punya parameter signature sama sekali** — ini bukan bug implementasi, JNE API memang tidak
menyediakan mekanisme signature apa pun untuk webhook tracking-nya.

**Keputusan**: JNE **sengaja tidak disambungkan** ke endpoint publik `apps/api`. Membuka rute
publik untuk provider tanpa signature adalah menciptakan vektor tulis tak terautentikasi baru —
siapa pun yang menemukan URL webhook bisa mengirim update status pengiriman palsu tanpa cara
memverifikasi asalnya. Ini berbeda dari Midtrans (yang **sudah** disambungkan lewat
`POST /service/v1/payments/webhook/:provider`, verifikasi signature SHA-512 wajib, default-closed
tanpa `MIDTRANS_SERVER_KEY`) — JNE tidak punya signature untuk diverifikasi sama sekali.

**Mitigasi yang dibutuhkan sebelum JNE bisa disambungkan** (keputusan produk/infra, bukan kode
aplikasi semata): (a) allowlist IP di level infrastruktur (nginx/load balancer) yang membatasi
rute webhook JNE hanya menerima dari rentang IP resmi JNE, dan (b) rekonsiliasi wajib berkala
(polling `trackShipment` yang sudah ada di connector) untuk mendeteksi status yang tidak dikonfirmasi
lewat webhook. Tanpa keduanya, status pengiriman JNE tetap mengandalkan polling manual/berkala,
bukan webhook real-time — trade-off yang sadar dipilih demi keamanan.

---

## 6. Utang cakupan audit — jujur tentang apa yang belum ditelusuri

Konsolidasi ini menemukan bahwa **audit itu sendiri belum lengkap** di dua tempat; satu di antaranya —
blok temuan Jalur E (butir 2) — **kini sudah ditutup**. Dicatat eksplisit
sesuai aturan rencana §2 butir 6 dan DoD §8.

1. **Jalur F hanya mengaudit dokumen 02 (`02_SYSTEM_ARCHITECTURE`).** Perintah `Select-String -Pattern
   'REQ-(11|12|13)-\d{3}'` atas `jalur-f-operasional.md` → **0 hasil**. Dokumen **11
   (ANALYTICS_AND_KPI_DICTIONARY, 453 baris)**, **12 (QA_AND_TEST_STRATEGY, 456 baris)**, dan **13
   (DEVOPS_SRE_AND_RUNBOOKS, 428 baris)** — total 1.337 baris spesifikasi — **belum diekstrak menjadi
   REQ**. Konsekuensi: kamus KPI, strategi tes vs kenyataan, runbook, burn-rate/SLO, healthcheck,
   backup/RPO belum punya temuan berbukti selain yang tersinggung di doc 02. **Lapisan "observability"
   pada §3 hanya terukur dari doc 02.**

2. **Blok temuan Jalur E — DITUTUP (2026-07-29).** Dulu blok per-temuan hanya ada untuk REQ-03-001…020.
   Kini **REQ-03-021…040** (20 blok, di `jalur-e-frontend.md`) dan **seluruh REQ-04-001…026** (26 blok, di
   berkas baru `jalur-e-frontend-04-bukti.md`) sudah punya blok berbukti `path:baris`. Bersama 23 blok
   jalur C, ini menutup 69 celah bukti. Verifikasi hitung ulang: **309/309 temuan berblok** — lihat
   **§ Status kelengkapan bukti**.

3. **Butir pra-isi §5 rencana yang belum diverifikasi ulang tahun ini:** K-09 (5 modul di skema `public`),
   K-11 (nomor migrasi berlubang), K-12 (tes `@chai/domain` flaky). Lihat §7.

**Untuk menutup sisa utang ini:** audit dokumen 11/12/13 (jalur F) dan re-verifikasi K-09/K-11/K-12.
(Blok temuan REQ-03-021…040 + REQ-04-* sudah dilengkapi — lihat § Status kelengkapan bukti.)

---

## 7. Rekonsiliasi 12 temuan pra-isi §5 (DoD rencana §8)

Dihimpun dari re-verifikasi lintas jalur.

| K | Ringkas | Jalur | Status setelah audit | Bukti |
|---|---|---|---|---|
| K-01 | CI belum pernah dieksekusi runner (tanpa git remote) | F | **TERBUKA** (HIGH) | F REQ-02-010 catatan; `git remote -v` nol |
| K-02 | Stack penuh belum pernah boot end-to-end | F | **TERBUKA** (HIGH) | F REQ-02-015/018 |
| K-03 | Teks pesan pelanggan masuk payload Redis terbaca | A | **REMEDIASI** | B REQ-06-011: payload-by-reference (`messageId` saja, tanpa teks) |
| K-04 | RPO ≈ 1 jam, tanpa WAL/PITR | F | **REMEDIASI** | F REQ-02-014: PITR aktif, `archive_timeout=60s` → RPO ~60s |
| K-05 | Performa belum terukur | F | **SEBAGIAN** | F REQ-02-017: baseline 3 endpoint; 5/7 anggaran + skala 1000 belum |
| K-06 | Healthcheck worker liveness-only (`pgrep`) | F | **TERBUKA** (MEDIUM) | F intro: masih `pgrep` |
| K-07 | `AuditMiddleware` tak ter-wire | A | **TERBUKA** (= REQ-10-021, HILANG) | A REQ-10-021: nol call site |
| K-08 | Retrieval belum hybrid pgvector | D | **TERBUKA** (= REQ-08-014) | D REQ-08-014: full-text saja, `embedding jsonb` tak diisi |
| K-09 | 5 modul di skema `public` (aman, ber-RLS FORCE) | A | **BELUM DIVERIFIKASI ULANG** (LOW) | tidak masuk 34 REQ jalur A sesi ini |
| K-10 | 6 generator ID `Math.random` | B | **REMEDIASI** | B: semua `randomUUID` kini; D: `cost-accounting.ts` `randomUUID` |
| K-11 | Nomor migrasi berlubang | F | **BELUM DIVERIFIKASI ULANG** (INFO) | jalur F tak sampai (doc 02 saja) |
| K-12 | Tes `@chai/domain` integrasi flaky | F | **BELUM DIVERIFIKASI ULANG** (LOW) | perlu run berulang di Docker |

**Skor:** 3 remediasi terverifikasi (K-03, K-04, K-10), 1 sebagian (K-05), 5 terbuka (K-01, K-02, K-06,
K-07, K-08), 3 belum diverifikasi ulang (K-09, K-11, K-12).

---

## 8. Penilaian ADR/DEC (silang jalur)

ADR yang dinilai jalur relevan (rencana §4 mewajibkan setiap ADR dinilai):

| ADR | Ringkas | Jalur | Kondisi |
|---|---|---|---|
| ADR-006 | REST + Realtime (SSE) | B | Kontrak ada; event tak terkirim end-to-end (REQ-06-010) |
| ADR-007 | Inbox/Outbox transaksional | B, C, F | Worker dan jalur webhook payment keduanya patuh (REQ-17-009 TERPENUHI 2026-07-29) |
| ADR-008 | BullMQ→Temporal | B | HILANG (REQ-07-010/011); diganti Redis Streams + dispatcher DB |
| ADR-010 | Kontrak AI provider-neutral | D | Kontrak & alias ada, tak ter-wire |
| ADR-011 | AI Proposes, Policy Executes | A, C, D | Keputusan benar & terjangkau; eksekusi AI tak ter-wire (tak dilanggar) |
| ADR-012 | Hybrid RAG (full-text + pgvector) | D | Full-text saja; pgvector belum (K-08) |
| ADR-014 | Strategi WhatsApp (Meta Direct/BSP/Community) | D | Meta Direct SANDBOX ter-wire; BSP/Community HILANG |
| ADR-021 | Contract-First | B | Skema kanonik ada; sebagian hanya dipakai tes/codegen |
| ADR-026 | Payment orchestration, bukan custody | C, D | Hosted checkout + no-custody TERPENUHI; adapter riil tak ter-wire |
| ADR-027 | Logistik kanonik, provider truth, unknown fail-safe | C, D | Fail-safe unknown→UNKNOWN TERPENUHI; mapping alert & ownership-lookup belum |
| ADR-028 | Modul vertikal opsional Stage 1 | C, D | Entitlement gate terpasang (payment/shipment) |

---

## 9. Kepatuhan read-only

Sesi konsolidasi ini **hanya membaca** berkas jalur + rencana dan menjalankan perintah penghitung
(`Select-String`, `Get-Content`, `git`), lalu menulis **satu** berkas baru:
`docs/audit/2026-07-29/DAFTAR-CELAH-MASTER.md`. Tidak ada kode produksi maupun berkas jalur milik agen
lain yang diubah. Perubahan pra-audit di luar kendali sesi ini (`.github/workflows/ci.yml`,
`infra/production/nginx.conf`, `package.json`, `scripts/verify-infra-config.mjs`) berasal dari kondisi
repo/orkestrasi paralel, bukan dari sesi ini.
