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

Dari **309 persyaratan normatif** yang diekstrak enam jalur, hanya **73 (24%) TERPENUHI** secara
call-site-proven; **173 SEBAGIAN**, **44 HILANG**, **1 BERTENTANGAN**, **18 TIDAK-TERVERIFIKASI**.
Invarian inti proyek yang paling mahal **sebagian besar aman** (uang integer minor units, RLS
default-deny+FORCE, `PAID` tak mundur, unknown→UNKNOWN, policy engine sebagai satu-satunya gerbang
efek samping tool AI) — tetapi ada **tiga cacat CRITICAL pada jalur uang** (semua di Jalur C) dan
**satu potensi cacat isolasi tenant** (Jalur D REQ-09-014) yang bersifat **release-blocking**.
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
| REQ-17-009 | C | Efek eksternal: mutasi+audit+event dalam SATU transaksi (jalur webhook payment tak patuh) | SEBAGIAN | CRITICAL |
| REQ-17-019 | C | Alur hosted-payment lengkap: on-PAID update proyeksi+stop reminder+notifikasi+atribusi | SEBAGIAN | CRITICAL |
| REQ-17-063 | C | PAY-06: event paid update proyeksi + stop reminder tepat sekali | HILANG | CRITICAL |

### 1.2 HIGH (37)

| ID | Jalur | Persyaratan (singkat) | Kelas | Severity |
|---|---|---|---|---|
| REQ-10-005 | A | Recent-authentication window 10 menit untuk aksi sensitif (hanya 2 rute) | SEBAGIAN | HIGH |
| REQ-10-012 | A | CSRF protection untuk mutasi cookie-auth | HILANG | HIGH |
| REQ-10-013 | A | Refresh token rotate + reuse revokes family (store in-memory, gagal multi-replica) | SEBAGIAN | HIGH |
| REQ-10-016 | A | Webhook signature + timestamp verification + replay window (timestamp absen) | SEBAGIAN | HIGH |
| REQ-10-019 | A | Malware scan pada file/media unggah (scan_status tak pernah diisi) | HILANG | HIGH |
| REQ-10-022 | A | Secret manager/KMS; connector secret nyatanya tak dienkripsi; tanpa rotasi | SEBAGIAN | HIGH |
| REQ-05-002 | A | Body/header tak bisa memilih tenant (owner `x-tenant-id` — perlu ADR) | SEBAGIAN | HIGH |
| REQ-05-003 | A | Raw secret tak disimpan di webhook_subscription/payment_provider_account (belum dibaca langsung) | SEBAGIAN | HIGH |
| REQ-06-010 | B | Event kanonik benar-benar terkirim ke subscriber end-to-end (tak ada konsumen produksi) | SEBAGIAN | HIGH |
| REQ-17-011 | C | Metadata akun provider + referensi secret-manager per-tenant | SEBAGIAN | HIGH |
| REQ-17-021 | C | Amount dari sumber tepercaya; AI tak mengarang harga/pajak/currency | SEBAGIAN | HIGH |
| REQ-17-027 | C | Eksekusi refund: recent-auth + threshold + audit + rekonsiliasi provider | SEBAGIAN | HIGH |
| REQ-17-033 | C | Lookup pelanggan verifikasi tenant+ownership (logika ada, tak tersambung ke rute) | SEBAGIAN | HIGH |
| REQ-17-044 | C | Event kanonik payment.*/shipment.* (mayoritas hilang) | SEBAGIAN | HIGH |
| REQ-17-049 | C | Secret manager per-tenant/least-scope/rotasi/audited | SEBAGIAN | HIGH |
| REQ-17-053 | C | Lookup tracking butuh user terautentikasi atau verifikasi identitas/order | SEBAGIAN | HIGH |
| REQ-17-058 | C | PAY-01: isolasi kredensial/transaksi tenant — secret webhook global, bukan referensi secret-manager per-tenant (koreksi kelas jalur C) | SEBAGIAN | HIGH |
| REQ-17-059 | C | PAY-02: amount/currency/purpose dari data bisnis tepercaya + konfirmasi | SEBAGIAN | HIGH |
| REQ-17-064 | C | PAY-07: refund nonaktif s.d. approval+recent-auth+rekonsiliasi+tes provider | SEBAGIAN | HIGH |
| REQ-17-065 | C | PAY-08: mismatch produksi punya alert+owner+aging+runbook+audit | HILANG | HIGH |
| REQ-17-066 | C | LOG-01: tenant-isolated + lookup end-customer verifikasi ownership | SEBAGIAN | HIGH |
| REQ-08-008 | D | AI tak dapat menimpa consent/permission/entitlement/approval/state (policy ada, runtime tak ter-wire) | SEBAGIAN | HIGH |
| REQ-08-018 | D | Kebijakan grounded-answer klaim tenant-spesifik | SEBAGIAN | HIGH |
| REQ-08-021 | D | Kontrak eksekusi tool 12-langkah + ActionRequest idempoten + audit | SEBAGIAN | HIGH |
| REQ-08-023 | D | Uang/alamat/kurir tak pernah dari teks model bebas | SEBAGIAN | HIGH |
| REQ-08-039 | D | AC: AI tak mengarang nominal / tandai paid dari screenshot | SEBAGIAN | HIGH |
| REQ-08-040 | D | AC: AI tak bocorkan shipment pelanggan lain dari tracking tebakan | SEBAGIAN | HIGH |
| REQ-09-006 | D | Verifikasi signature + timestamp webhook (timestamp absen; JNE tanpa signature) | SEBAGIAN | HIGH |
| REQ-09-014 | D | 🔴 Keamanan widget: sesi publik tanpa auth, `tenantId` dari body (potensi lintas-tenant) | SEBAGIAN | HIGH |
| REQ-09-023 | D | Verifikasi webhook payment + reconcile unknown (verifier Midtrans riil tak ter-wire) | SEBAGIAN | HIGH |
| REQ-09-026 | D | Lookup tracking butuh ownership, bukan nomor resi saja | TIDAK-TERVERIFIKASI | HIGH |
| REQ-09-029 | D | Penyimpanan auth/secret konektor: vaulted + rotasi teraudit | SEBAGIAN | HIGH |
| REQ-09-034 | D | Disable/kill switch konektor (tiga lapis ada, tak ter-wire ke produksi) | SEBAGIAN | HIGH |
| REQ-03-035 | E | Confirmation pattern per risk; aksi destruktif satu-klik tanpa konfirmasi | BERTENTANGAN | HIGH |
| REQ-04-010 | E | Forms + SecretInput tanpa reveal setelah save | SEBAGIAN | HIGH |
| REQ-02-018 | F | 🔴 Tes integrasi isolasi tenant lulus (belum pernah dijalankan runner) | TIDAK-TERVERIFIKASI | HIGH |
| REQ-02-023 | F | Sertifikasi provider payment/shipment + kill switch + runbook teruji | TIDAK-TERVERIFIKASI | HIGH |

### 1.3 MEDIUM (131)

| ID | Jalur | Persyaratan (singkat) | Kelas | Severity |
|---|---|---|---|---|
| REQ-10-003 | A | Owner session: 8h absolut / idle 30m / access 10m (idle tak ditegakkan) | SEBAGIAN | MEDIUM |
| REQ-10-004 | A | Client session: 12h absolut / idle 60m / access 15m (idle tak ditegakkan) | SEBAGIAN | MEDIUM |
| REQ-10-010 | A | Cache/queue/object diberi prefix tenant | SEBAGIAN | MEDIUM |
| REQ-10-015 | A | OIDC workload identity, tanpa API key statis jangka panjang | HILANG | MEDIUM |
| REQ-10-017 | A | Rate limit by IP/identity/tenant/endpoint (hanya auth surface + per-proses) | SEBAGIAN | MEDIUM |
| REQ-10-021 | A | Audit sensitif otomatis untuk mutasi (`AuditMiddleware` tak ter-wire, = K-07) | HILANG | MEDIUM |
| REQ-05-008 | A | Akses lintas-tenant owner diaudit ("read audited") | HILANG | MEDIUM |
| REQ-05-010 | A | `audit_log` append-only; tanpa update/delete standar (perlu verifikasi DB grant) | SEBAGIAN | MEDIUM |
| REQ-06-001 | B | Bentuk response envelope (request_id/freshness_at/page hilang) | SEBAGIAN | MEDIUM |
| REQ-06-002 | B | Error problem-details + kode kanonik | SEBAGIAN | MEDIUM |
| REQ-06-007 | B | Page size maks 100/default 25 + cursor buram | SEBAGIAN | MEDIUM |
| REQ-06-012 | B | Session bootstrap kembalikan permission efektif + hint | SEBAGIAN | MEDIUM |
| REQ-06-013 | B | Owner API DLQ: `GET /dead-letters`, `POST /dead-letters/:id/replay` | HILANG | MEDIUM |
| REQ-06-016 | B | Audit contract mutasi (before/after/diff) | SEBAGIAN | MEDIUM |
| REQ-07-003 | B | Envelope event kanonik lengkap (correlation/causation/actor/occurred_at di jalur aktif) | SEBAGIAN | MEDIUM |
| REQ-07-007 | B | Layar DLQ + tata kelola replay (repo in-memory tak terisi) | SEBAGIAN | MEDIUM |
| REQ-07-008 | B | Retry: backoff/jitter/max/Retry-After/circuit breaker/DLQ | SEBAGIAN | MEDIUM |
| REQ-07-009 | B | Topologi antrean 15 queue berprioritas | SEBAGIAN | MEDIUM |
| REQ-07-010 | B | Temporal untuk workflow durable multi-hari (ADR-008) | HILANG | MEDIUM |
| REQ-07-013 | B | Model otomasi immutable + lifecycle DRAFT→VALIDATED→PUBLISHED→DEPRECATED | SEBAGIAN | MEDIUM |
| REQ-07-014 | B | Enam template otomasi MVP + kosakata stop-reason | HILANG | MEDIUM |
| REQ-07-015 | B | Workflow booking durable (states + kompensasi) | HILANG | MEDIUM |
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
| REQ-17-038 | C | Akses PoD role-checked/short-lived/audited/masked (tak ada penyimpanan PoD) | HILANG | MEDIUM |
| REQ-17-041 | C | Endpoint payment klien §8.1 (cancel/reconcile/payment-links/refund-requests) | SEBAGIAN | MEDIUM |
| REQ-17-042 | C | Endpoint logistik klien §8.2 (reconcile/PoD/exceptions/returns) | SEBAGIAN | MEDIUM |
| REQ-17-048 | C | Aturan komunikasi AI (tak klaim paid dari gambar; sitasi; eskalasi) | SEBAGIAN | MEDIUM |
| REQ-17-050 | C | Webhook signature/timestamp+replay+body-limit+inbox dedup | SEBAGIAN | MEDIUM |
| REQ-17-056 | C | Kontrol wajib (retry/Retry-After/breaker/uncertain/gap/reconcile/kill switch) | SEBAGIAN | MEDIUM |
| REQ-17-057 | C | Cakupan tes minimum §16 | SEBAGIAN | MEDIUM |
| REQ-17-067 | C | LOG-02: status kanonik berversi + unknown gagal-aman (himpunan status kurang) | SEBAGIAN | MEDIUM |
| REQ-17-069 | C | LOG-04: notifikasi hanya terkonfigurasi/consent-compliant | HILANG | MEDIUM |
| REQ-17-070 | C | LOG-05: exception (stale/lost/damaged/return) tanpa mengarang ETA | SEBAGIAN | MEDIUM |
| REQ-17-071 | C | LOG-06: multi-shipment/package + partial fulfillment | HILANG | MEDIUM |
| REQ-17-072 | C | LOG-07: aksi logistik destruktif butuh recheck+idempotency+approval | SEBAGIAN | MEDIUM |
| REQ-17-073 | C | LOG-08: tracking produksi webhook/poll fallback + rate-limit + SLO + alert + runbook | SEBAGIAN | MEDIUM |
| REQ-08-005 | D | Routing policy berurut + fallback lintas-provider terevaluasi | SEBAGIAN | MEDIUM |
| REQ-08-006 | D | HUMAN_ACTIVE = tidak ada outbound AI (aturan ada, tak ada jalur kirim AI) | SEBAGIAN | MEDIUM |
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
| REQ-08-030 | D | URL/domain allowlist, prohibited topic, loop limit, max tool/turn | HILANG | MEDIUM |
| REQ-08-032 | D | Release floor: zero regression safety + canary | HILANG | MEDIUM |
| REQ-08-034 | D | Budget bulanan per tenant + ceiling per request + fail-to-safe (store in-memory, tak ter-wire) | SEBAGIAN | MEDIUM |
| REQ-08-036 | D | AC: kapabilitas salah tak pernah dipilih | HILANG | MEDIUM |
| REQ-08-037 | D | AC: policy tenant terbatas memblokir provider | SEBAGIAN | MEDIUM |
| REQ-08-038 | D | AC: skema tool invalid tak pernah dieksekusi | SEBAGIAN | MEDIUM |
| REQ-08-041 | D | AC: human takeover memblokir kirim AI | SEBAGIAN | MEDIUM |
| REQ-08-042 | D | AC: skenario tanpa-evidence tak berhalusinasi | SEBAGIAN | MEDIUM |
| REQ-08-043 | D | AC: dokumen prompt-injection tak memperluas akses tool | SEBAGIAN | MEDIUM |
| REQ-08-044 | D | AC: rollback rilis model bekerja | HILANG | MEDIUM |
| REQ-08-045 | D | AC: budget tenant mengisolasi tenant berisik | SEBAGIAN | MEDIUM |
| REQ-09-001 | D | Set operasi konektor kanonik (connect/refresh/rotate/revoke/markRead/fetchMedia absen) | SEBAGIAN | MEDIUM |
| REQ-09-003 | D | Effective capability intersection (connector∩account∩entitlement∩policy) | HILANG | MEDIUM |
| REQ-09-005 | D | Error taxonomy incl UNKNOWN_RESULT reconcile-before-retry | SEBAGIAN | MEDIUM |
| REQ-09-007 | D | Provider challenge handshake (Meta GET hub.challenge) | HILANG | MEDIUM |
| REQ-09-008 | D | Replay prevention + inbox dedup (dedup ada; replay berbasis timestamp/nonce tak ada) | SEBAGIAN | MEDIUM |
| REQ-09-010 | D | Meta Direct + required states (controller mewire adapter SANDBOX) | SEBAGIAN | MEDIUM |
| REQ-09-027 | D | Webhook + state-aware polling fallback logistik (route webhook + signature JNE kurang) | SEBAGIAN | MEDIUM |
| REQ-09-030 | D | Isolasi rate/concurrency per tenant + akun provider | SEBAGIAN | MEDIUM |
| REQ-03-001 | E | Owner console: semua route diawali server-side authz (`/ai-operations`,`/settings` tak digating) | SEBAGIAN | MEDIUM |
| REQ-03-002 | E | Client: invite-only, tenant context dari membership, switcher owned-only | SEBAGIAN | MEDIUM |
| REQ-03-003 | E | Access-denied behavior (5 skenario §2.3) | SEBAGIAN | MEDIUM |
| REQ-03-004 | E | Navigation item hanya dirender bila entitlement + permission terpenuhi | HILANG | MEDIUM |
| REQ-03-005 | E | Owner Console route inventory (27 route; 16+ belum ada) | SEBAGIAN | MEDIUM |
| REQ-03-006 | E | Owner Sign In: MFA challenge/recovery/device list/states | SEBAGIAN | MEDIUM |
| REQ-03-008 | E | Tenant Directory kolom & aksi lengkap, tanpa bulk destructive | SEBAGIAN | MEDIUM |
| REQ-03-009 | E | Tenant Creation Wizard (8 langkah, autosave, tak ACTIVE tanpa checklist) | HILANG | MEDIUM |
| REQ-03-010 | E | Tenant Detail (tabs + tenant identity banner lintas-tenant) | HILANG | MEDIUM |
| REQ-03-011 | E | Global Channel Health + Community Gateway high-risk badge | HILANG | MEDIUM |
| REQ-03-012 | E | AI Operations + publish butuh validation summary & rollback target | SEBAGIAN | MEDIUM |
| REQ-03-014 | E | Usage & Billing + cost source (measured/estimated/reconciled) | HILANG | MEDIUM |
| REQ-03-015 | E | Reliability: 8 widget wajib | SEBAGIAN | MEDIUM |
| REQ-03-016 | E | Security & Audit: filter lengkap + kategorisasi high-risk event | SEBAGIAN | MEDIUM |
| REQ-03-017 | E | Client Portal route inventory (26 route; 13+ belum ada) | SEBAGIAN | MEDIUM |
| REQ-03-018 | E | Invite + onboarding checklist §6.2 | HILANG | MEDIUM |
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
| REQ-04-009 | E | Actions: Button/IconButton/SplitButton/ApprovalButton + one primary per area | HILANG | MEDIUM |
| REQ-04-011 | E | Data display components + DataTable 8 requirement | SEBAGIAN | MEDIUM |
| REQ-04-013 | E | Feedback: InlineAlert/Toast/Banner/Progress/Skeleton/ErrorBlock | SEBAGIAN | MEDIUM |
| REQ-04-014 | E | Overlays: Dialog/Drawer/FullScreenFlow/Popover + nested dialog dilarang | SEBAGIAN | MEDIUM |
| REQ-04-015 | E | Conversation components (16) + visual distinction AI/human/note/failed/tool | SEBAGIAN | MEDIUM |
| REQ-04-016 | E | AI components (9) + hindari confidence % pseudo-ilmiah | HILANG | MEDIUM |
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
| REQ-02-019 | F | Setiap mutasi menghasilkan keputusan audit | SEBAGIAN | MEDIUM |
| REQ-02-021 | F | Queue overload punya tes backpressure | HILANG | MEDIUM |
| REQ-02-022 | F | Backup restore dan failover dilatih (masih checklist DOCUMENTED) | SEBAGIAN | MEDIUM |

### 1.4 LOW (55)

| ID | Jalur | Persyaratan (singkat) | Kelas | Severity |
|---|---|---|---|---|
| REQ-10-018 | A | SSRF-safe URL fetch untuk media (fitur pemicu belum ada) | HILANG | LOW |
| REQ-06-006 | B | Correlation ID diterima/dibangkitkan/dikembalikan (X-Request-Id terpisah kurang) | SEBAGIAN | LOW |
| REQ-06-015 | B | Skema event membawa versi; konsumen enum menangani UNKNOWN | SEBAGIAN | LOW |
| REQ-07-011 | B | BullMQ untuk kerja async pendek (ADR-008) | HILANG | LOW |
| REQ-07-012 | B | Kontrak integrasi n8n | HILANG | LOW |
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
| REQ-09-011 | D | Official BSP mode | HILANG | LOW |
| REQ-09-012 | D | Community Gateway (owner-only, kill switch legal) | HILANG | LOW |
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
| REQ-02-016 | F | Community WhatsApp Gateway sebagai zona deployment terpisah | HILANG | LOW |

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

> (Empat TIV lagi punya severity dan sudah muncul di tabel §1.2–§1.4: REQ-07-016 MEDIUM, REQ-08-002 LOW, REQ-09-026 HIGH, REQ-09-028 LOW, REQ-02-013 MEDIUM, REQ-02-015 MEDIUM, REQ-02-018 HIGH, REQ-02-023 HIGH — total 18 TIV, lihat §4.)

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

## 4. Butir TIDAK-TERVERIFIKASI (18) dan apa yang dibutuhkan untuk menutupnya

Konsolidasi membuka peluang: **beberapa TIV di satu jalur sudah terjawab oleh temuan jalur lain**
(ditandai "→ terjawab silang"). Sisanya butuh runtime/Docker/deploy/audit tambahan.

| ID | Jalur | Butuh apa untuk memutuskan | Status setelah konsolidasi |
|---|---|---|---|
| REQ-05-004 | A | Audit setiap call site logging yang menyentuh objek `payment_attempt` (hosted-link/token); idealnya ESLint rule field-sensitif→log | **Terbuka** (butuh audit logging/lint) |
| REQ-05-009 | A | Audit serialisasi endpoint list shipment/PoD | **≈ Terjawab silang**: C REQ-17-038 = tak ada penyimpanan PoD sama sekali → tak ada view luas yang bisa membocorkannya; tutup bersama REQ-17-038 |
| REQ-05-011 | A | Hitung dari seluruh 61 migrasi berapa FK composite `(tenant_id,id)` vs single-`id`, bandingkan "where practical" | **Terbuka** (butuh audit FK sistematis) |
| REQ-07-016 | B | Baca menyeluruh alur retention/deletion + export vs §11.3/11.4 | **Terbuka** (wilayah A/F; overlap REQ-17-054) |
| REQ-08-002 | D | Perlu jalur persistensi respons AI untuk diperiksa | **Terbuka secara struktural**: tak ada runtime AI yang mem-persist respons (tak dapat diputuskan sampai runtime AI dibangun) |
| REQ-09-026 | D | Telusuri lookup logistik apakah verifikasi contact/order ownership | **→ Terjawab silang** oleh C REQ-17-033/053/066: `customerLookup` ber-ownership **ada + diuji tetapi TIDAK tersambung ke rute**; rute live memakai `customerView` tenant-scoped saja. Reklasifikasi efektif: **SEBAGIAN/HIGH** |
| REQ-09-028 | D | Periksa skema `chai.shipment`/`package` untuk relasi order→banyak shipment | **→ Terjawab silang** oleh C REQ-17-071: **HILANG** (tak ada model package/item; `shipment_packages` di-DROP oleh 0057) |
| REQ-17-007 | C | Telusuri konektor marketplace (proyeksi read-only payment/fulfillment) | **Terbuka**: konektor marketplace bukan bagian dari 8 konektor yang diaudit jalur D; belum ada |
| REQ-17-037 | C | Berlaku saat mutasi logistik ada (read-first MVP belum create/label) | **Terbuka** (tergantung fitur mutasi logistik) |
| REQ-17-043 | C | Nilai scoping konten endpoint owner-console (tanpa secret/alamat/PoD) | **Terbuka** (wilayah E/F; jalur F belum audit doc 13) |
| REQ-17-046 | C | Telaah broker: apakah 6 antrian bernama ada | **→ Terjawab silang** oleh B REQ-07-009: **SEBAGIAN** — implementasi memakai satu Redis stream per tipe event, bukan 6/15 antrian bernama berprioritas |
| REQ-17-051 | C | Audit logging (tak melog token/alamat/PoD/payload) | **Terbuka** (sama akar dengan REQ-05-004; butuh audit logging) |
| REQ-17-054 | C | Telaah retensi payment/delivery spesifik (bukan hanya `0030_retention_policy.sql` generik) | **Terbuka** (wilayah A; overlap REQ-07-016) |
| REQ-17-055 | C | Metrik SLO runtime (§14) | **Terbuka** (butuh runtime; wilayah F) |
| REQ-02-013 | F | Audit query vektor: predikat tenant + versi embedding | **Sebagian terjawab silang** oleh D REQ-08-014/017: retrieval produksi **memfilter `tenant_id` dalam `withTenantTransaction`** (predikat tenant ADA) tetapi **pgvector belum dipakai** (full-text saja, kolom `embedding jsonb` tak diisi, versi embedding tak eksplisit). Sisa terbuka: versi embedding |
| REQ-02-015 | F | Deployment multi-node nyata dengan uji failover & autoscale | **Terbuka** (butuh deploy nyata; = K-02) |
| REQ-02-018 | F | 🔴 Jalankan suite integrasi isolasi tenant di lingkungan ber-Docker & catat hasil | **Terbuka & RELEASE-BLOCKING** (belum pernah dijalankan runner; = K-01/K-02) |
| REQ-02-023 | F | Bukti sertifikasi provider + kill switch + eksekusi runbook | **Sebagian terjawab silang**: suite conformance ADA (D REQ-09-031/032/033 TERPENUHI), tetapi **kill switch tak ter-wire** (C REQ-17-056, D REQ-09-034) dan runbook belum dieksekusi. Reklasifikasi: **SEBAGIAN**, sisa = kill-switch wiring + runbook drill |

**Ringkasan yang benar-benar butuh runtime/manusia** (tak bisa ditutup statis): REQ-02-018 (Docker),
REQ-02-015 (deploy multi-node), REQ-17-055 (SLO runtime), REQ-05-004/REQ-17-051 (audit logging atau
lint), REQ-08-002 (perlu runtime AI dulu), REQ-05-011 (audit FK 61 migrasi), REQ-07-016/REQ-17-054
(baca alur retention/export). Selebihnya sudah terjawab oleh konsolidasi silang.

---

## 5. Prioritas pekerjaan sisa (release-blocker di atas)

Aturan penindih (rencana §3 Langkah 4): **setiap cacat isolasi tenant, uang, dan status terminal =
release-blocking apa pun severity generiknya** (🔴).

### Tier 0 — RELEASE-BLOCKER (invarian uang / status / isolasi tenant)

1. 🔴 **REQ-17-009 (CRITICAL)** — Jalur webhook payment (`applyWebhook`) menulis `chai.payment.status`
   **tanpa audit + outbox dalam satu transaksi**, melanggar ADR-007. Sekali PAID, reconciler
   mengecualikannya → audit/event hilang permanen. **Aksi:** bungkus penulisan state webhook dengan
   `commitBusinessMutation` (seperti jalur worker).
2. 🔴 **REQ-17-019 + REQ-17-063 (CRITICAL)** — Langkah on-PAID (update proyeksi booking/order/invoice,
   stop reminder tepat sekali, notifikasi, atribusi) **tidak ada**; `chai.payment` tak menyimpan tautan
   bisnis. **Aksi:** konsumen event `payment.paid` idempoten + kolom tautan bisnis. (Bergantung pada
   REQ-17-009 & REQ-17-044 lebih dulu memancarkan event.)
3. 🔴 **REQ-09-014 (HIGH, potensi isolasi tenant)** — Endpoint sesi widget publik tanpa auth/tenant
   scope, `createSession` menerima `tenantId` dari **body**. **Aksi wajib pertama:** verifikasi RLS
   `chai.widget_session` (Jalur A) — **bila body `tenantId` bisa menulis lintas tenant, ini
   release-blocking**. Lalu: publishable key + signed short-lived session + origin enforcement + rate
   limit; hentikan `tenantId` dari body.
4. 🔴 **REQ-02-018 (HIGH, TIV, isolasi tenant)** — Suite integrasi isolasi tenant **belum pernah
   dijalankan runner** (CI tanpa remote, stack belum pernah boot — K-01/K-02). **Aksi:** jalankan
   `pnpm --filter @chai/database run test:integration` + suite e2e di Docker; harus hijau sebelum rilis.

### Tier 1 — HIGH (keamanan, uang, integritas data; bukan isolasi tetapi serius)

- **Rahasia & kredensial:** REQ-10-022 / REQ-09-029 / REQ-17-011 / REQ-17-049 — connector secret nyatanya
  **tak dienkripsi** (nama kolom "encrypted" menyesatkan) + tanpa rotasi + tanpa referensi
  secret-manager per-tenant.
- **Sesi & CSRF:** REQ-10-012 (CSRF absen), REQ-10-013 (deteksi reuse refresh token gagal multi-replica —
  store in-memory), REQ-10-005 (recent-auth hanya 2 rute).
- **Webhook:** REQ-09-006 / REQ-10-016 / REQ-17-023 / REQ-17-050 — verifikasi **timestamp/replay window
  absen** di semua webhook; **JNE tanpa verifikasi signature**; REQ-09-007 Meta challenge handler hilang.
- **Uang (non-CRITICAL tapi HIGH):** REQ-17-021/059 (amount dari body, bukan invoice/order/katalog
  tepercaya), REQ-17-027/064 (refund tanpa threshold + audit/event + rekonsiliasi provider).
- **Event & rekonsiliasi:** REQ-17-044 (katalog event kanonik mayoritas hilang), REQ-17-065 (mismatch
  tanpa alert/owner/aging/runbook), REQ-06-010 (event tak sampai ke subscriber end-to-end).
- **Lookup ownership:** REQ-17-033/053/066 (+ REQ-09-026) — `customerLookup` ber-ownership ADA & diuji
  tetapi **tak tersambung ke rute**; sambungkan ke jalur self-service, jangan pakai `customerView`.
- **Kill switch:** REQ-09-034 (+ REQ-17-056) — `KillSwitchRuntime` tiga lapis ada tetapi **tak ter-wire**;
  `KILL_SWITCH_PAYMENT=1` di produksi **tidak berefek**. Wire ke controller payment/logistik/channel.
- **Malware scan:** REQ-10-019 — `scan_status` tak pernah diisi; blokir attachment belum `CLEAN`.
- **Frontend HIGH:** REQ-03-035 (BERTENTANGAN — aksi destruktif tanpa konfirmasi/re-auth: kill switch,
  circuit breaker, suspend tenant), REQ-04-010 (SecretInput reveal setelah save).
- **AI HIGH:** REQ-08-008/018/021/023/039/040 — hard rule, grounded-answer, kontrak eksekusi tool ada di
  lapisan policy tetapi **runtime AI tak ter-wire** (lihat Tier 2 struktural).

### Tier 2 — Enabler struktural (satu perbaikan membuka banyak celah)

- **Wire runtime AI `@chai/ai-gateway`** (diimpor NOL app/worker) → membuka ~40 SEBAGIAN Jalur D
  (guardrail injection, budget cap, tool-execution, grounded-answer). Pastikan setiap eksekusi melewati
  `evaluateToolPolicy` sebelum efek samping.
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
| ADR-007 | Inbox/Outbox transaksional | B, C, F | Worker patuh; **jalur webhook payment TIDAK** (REQ-17-009 CRITICAL) |
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
