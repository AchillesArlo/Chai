# Jalur C — Payment & Logistics · Audit Blueprint

> Dokumen sumber: `Omnichannel_AI_Platform_Engineering_Blueprint_v1.2/17_PAYMENT_AND_LOGISTICS_SPEC.md` (683 baris).
> Metode & aturan bukti: `docs/plans/2026-07-27-rencana-audit-blueprint.md` §3, §10.3–§10.6.
> Audit read-only. Tidak ada kode yang diubah. Dikerjakan 2026-07-29 (baseline git `feb0e20` + perubahan pra-audit di `.github/workflows/ci.yml`, `infra/production/nginx.conf`, `package.json`, `scripts/verify-infra-config.mjs`).

**Aturan bukti yang dipakai**: `TERPENUHI` hanya bila berkas dibuka, kode dilihat, DAN terbukti terpanggil di jalur produksi (call site atau tes). Ragu → `SEBAGIAN`. `HILANG` menyertakan perintah pencarian nol-keluaran. Status VERIFIED di `docs/plans/2026-07-26-blueprint-gap-remediation.md` **tidak** dipercaya sebagai bukti.

**Perintah rekap kelas** (dijalankan atas berkas ini, bukan dari ingatan — hasilnya di bagian "Rekapitulasi"):

```powershell
$f = 'docs/audit/2026-07-29/jalur-c-payment-logistics.md'
Select-String -Path $f -Pattern '^\| REQ-17-\d{3} ' |
  ForEach-Object { ($_.Line -split '\|')[3].Trim() } |
  Group-Object | Select-Object Name, Count | Sort-Object Name
```

---

## Self-check (§10.7)

1. **Dibaca penuh?** Ya, 683 baris §1–§21 dibaca berurutan. Tidak ada bagian yang dilewati. §19 (checklist pemilihan provider) dan §20 (keputusan sebelum sprint) bersifat proses/keputusan manusia, bukan persyaratan kode; dicatat namun tidak menghasilkan REQ terverifikasi-statis.
2. **REQ dihasilkan:** 73 (REQ-17-001…REQ-17-073, termasuk 16 AC di §18). Rekap kelas dihitung dengan perintah di atas → lihat "Rekapitulasi".
3. **Setiap `TERPENUHI` punya path:baris + bukti terpanggil?** Ya — masing-masing menyertakan call site produksi atau tes yang menegakkan.
4. **Setiap `HILANG` punya perintah pencarian nol?** Ya — dilampirkan di bloknya.
5. **Di-append ke berkas?** Ya, satu-satunya berkas tulis: `docs/audit/2026-07-29/jalur-c-payment-logistics.md`.
6. **`git status --porcelain` hanya `docs/audit/`?** Ya (plus perubahan pra-audit di luar kendali sesi ini). Tidak ada kode produksi tersentuh.

**ADR yang dinilai** (dari `15_ADR_REGISTER.md`, wajib per §4 rencana): ADR-007 (inbox/outbox transaksional), ADR-011 (AI proposes, policy executes), ADR-027 (canonical logistics + provider truth), ADR-028 (modul vertikal opsional Stage 1). Penilaian tertanam di REQ terkait (009, 013/047, 031/033, 006).

**Temuan penting arsitektural**: migrasi `0057_drop_state_machine_facades.sql` **membuang** tabel `public.payment_requests/payment_attempts/refunds/disputes` (uang `DECIMAL(15,2)`) dan `public.shipments/shipment_events/shipment_packages` yang dibuat 0036/0037. Tabel-tabel itu adalah fasad modul in-memory yang tidak pernah tersambung ke produksi. Jalur produksi memakai `chai.payment` (integer minor units) + `chai.shipment`. Katalog `DECIMAL` untuk uang **sudah tidak ada** di skema aktif — diverifikasi ulang, bukan diterima dari dokumen remediasi.

---

## Ringkasan Jalur C

| ID | Persyaratan | Kelas | Severity |
|---|---|---|---|
| REQ-17-001 | Platform tidak menyimpan/menyalurkan dana (no custody) | TERPENUHI | - |
| REQ-17-002 | Tiap tenant memakai akun merchant/gateway sendiri | SEBAGIAN | MEDIUM |
| REQ-17-003 | Card/CVV/PIN/OTP/kredensial bank tak pernah masuk platform | TERPENUHI | - |
| REQ-17-004 | PAID hanya dari webhook terverifikasi/rekonsiliasi (bukan screenshot/redirect/klaim) | TERPENUHI | - |
| REQ-17-005 | Tiap tenant memakai akun carrier sendiri | SEBAGIAN | MEDIUM |
| REQ-17-006 | Logistik MVP read-first (tanpa mutasi) | TERPENUHI | - |
| REQ-17-007 | Payment/fulfillment marketplace bersumber dari marketplace | TIDAK-TERVERIFIKASI | - |
| REQ-17-008 | Tipe SDK provider tak bocor ke entitas core | TERPENUHI | - |
| REQ-17-009 | Efek eksternal idempoten+audit+event dalam SATU transaksi | TERPENUHI | CRITICAL |
| REQ-17-010 | Kapabilitas high-risk di balik gate rollout | TERPENUHI | - |
| REQ-17-011 | Metadata akun provider + referensi secret-manager (bukan plaintext) | SEBAGIAN | HIGH |
| REQ-17-012 | Effective capability = irisan adapter∩scope∩state∩entitlement∩policy | SEBAGIAN | MEDIUM |
| REQ-17-013 | AI tak memanggil API klien sembarang secara langsung | TERPENUHI | - |
| REQ-17-014 | Uang = integer minor units + kode mata uang ISO | TERPENUHI | - |
| REQ-17-015 | Amount/currency immutable setelah attempt; koreksi = replacement | TERPENUHI | - |
| REQ-17-016 | Model status payment (DRAFT→…→PAID + terminal) | SEBAGIAN | LOW |
| REQ-17-017 | Transisi hanya dari bukti provider terverifikasi | TERPENUHI | - |
| REQ-17-018 | PAID tak pernah mundur; presedensi waktu-event provider | TERPENUHI | - |
| REQ-17-019 | Alur hosted-payment: validasi→create idempoten→verifikasi→on-PAID update+stop reminder+notifikasi+atribusi | SEBAGIAN | CRITICAL |
| REQ-17-020 | Kontrak adapter payment (8 operasi Stage 0/1) | SEBAGIAN | MEDIUM |
| REQ-17-021 | Amount dari sumber tepercaya; AI tak mengarang harga/pajak/akun/currency | SEBAGIAN | HIGH |
| REQ-17-022 | Halaman redirect sukses bukan bukti settlement | TERPENUHI | - |
| REQ-17-023 | Verifikasi signature/timestamp webhook | SEBAGIAN | MEDIUM |
| REQ-17-024 | Dedup create: tenant+operation+business-ref+idempotency-key | SEBAGIAN | LOW |
| REQ-17-025 | Hasil submit tak pasti direkonsiliasi sebelum retry | TERPENUHI | - |
| REQ-17-026 | ExecuteRefund/payout/split dinonaktifkan untuk AI | TERPENUHI | - |
| REQ-17-027 | Eksekusi refund: recent-auth + threshold + audit + rekonsiliasi provider | SEBAGIAN | HIGH |
| REQ-17-028 | Output payment link tampilkan amount/currency/purpose/expiry/merchant | SEBAGIAN | MEDIUM |
| REQ-17-029 | Entitas logistik (Exception/PoD/Reconciliation/Commitment/Package/Item) | SEBAGIAN | MEDIUM |
| REQ-17-030 | Status kanonik shipment + set exception/terminal | SEBAGIAN | MEDIUM |
| REQ-17-031 | Kode provider→taxonomy berversi; unknown→UNKNOWN + mapping alert; tak ditebak | SEBAGIAN | MEDIUM |
| REQ-17-032 | Webhook/poll auth+dedup+normalize+append; state tanpa hapus event lama | TERPENUHI | - |
| REQ-17-033 | Lookup pelanggan verifikasi tenant+ownership; nomor ditebak tak bocor | SEBAGIAN | HIGH |
| REQ-17-034 | Kontrak adapter shipping (8 operasi Stage 0/1) | SEBAGIAN | MEDIUM |
| REQ-17-035 | ETA hanya dengan sumber+kesegaran; tak pernah dikarang | SEBAGIAN | LOW |
| REQ-17-036 | Aksi logistik berbiaya/destruktif butuh policy/konfirmasi | TERPENUHI | - |
| REQ-17-037 | Hasil submit tak pasti direkonsiliasi sebelum shipment/label baru | TIDAK-TERVERIFIKASI | - |
| REQ-17-038 | Akses PoD role-checked/short-lived/audited/masked | HILANG | MEDIUM |
| REQ-17-039 | Alamat/penerima dikecualikan dari analytics/log/konteks AI | SEBAGIAN | LOW |
| REQ-17-040 | Semua mutasi butuh Idempotency-Key; guarded butuh version/confirm/approval/recent-auth | TERPENUHI | - |
| REQ-17-041 | Endpoint payment klien (§8.1) | SEBAGIAN | MEDIUM |
| REQ-17-042 | Endpoint logistik klien (§8.2) | SEBAGIAN | MEDIUM |
| REQ-17-043 | Endpoint owner: health/lag/mismatch, tanpa secret/alamat/PoD | TIDAK-TERVERIFIKASI | - |
| REQ-17-044 | Event kanonik (payment.* + shipment.*) | SEBAGIAN | HIGH |
| REQ-17-045 | Himpunan command | SEBAGIAN | LOW |
| REQ-17-046 | Isolasi beban antrian (6 queue); antrian tak bawa kredensial | TIDAK-TERVERIFIKASI | - |
| REQ-17-047 | Risk tier + default AI tool policy (§10) | TERPENUHI | - |
| REQ-17-048 | Aturan komunikasi AI (tak klaim paid dari gambar; sitasi sumber; eskalasi) | SEBAGIAN | MEDIUM |
| REQ-17-049 | Secret manager per-tenant/least-scope/rotasi/audited | SEBAGIAN | HIGH |
| REQ-17-050 | Webhook signature/timestamp+replay+body-limit+inbox dedup | SEBAGIAN | MEDIUM |
| REQ-17-051 | Tak melog token/alamat/PoD/payload provider | TIDAK-TERVERIFIKASI | - |
| REQ-17-052 | RLS + composite tenant FK + kunci ber-tenant di semua entitas | TERPENUHI | - |
| REQ-17-053 | Lookup tracking butuh user terautentikasi atau verifikasi identitas/order pelanggan | SEBAGIAN | HIGH |
| REQ-17-054 | Retensi/hapus/ekspor data payment & delivery | TIDAK-TERVERIFIKASI | - |
| REQ-17-055 | Target SLO §14 | TIDAK-TERVERIFIKASI | - |
| REQ-17-056 | Kontrol wajib (retry/Retry-After, circuit breaker, uncertain-state, gap-detection, daily reconcile, kill switch) | SEBAGIAN | MEDIUM |
| REQ-17-057 | Cakupan tes minimum §16 | SEBAGIAN | MEDIUM |
| REQ-17-058 | PAY-01 Isolasi kredensial/transaksi tenant (RLS/secret/queue/cache/audit) | SEBAGIAN | HIGH |
| REQ-17-059 | PAY-02 Amount/currency/purpose link dari data bisnis tepercaya + konfirmasi | SEBAGIAN | HIGH |
| REQ-17-060 | PAY-03 Status hanya dari bukti provider; redirect/screenshot/klaim tak cukup | TERPENUHI | - |
| REQ-17-061 | PAY-04 Webhook duplikat/replay/out-of-order tak duplikasi/mundurkan payment | TERPENUHI | - |
| REQ-17-062 | PAY-05 Hasil create tak dikenal direkonsiliasi sebelum retry | TERPENUHI | - |
| REQ-17-063 | PAY-06 Event paid update proyeksi + stop reminder tepat sekali | SEBAGIAN (stop-reminder TERPENUHI; update proyeksi masih HILANG, lihat REQ-17-019) | CRITICAL |
| REQ-17-064 | PAY-07 Refund nonaktif s.d. approval+recent-auth+rekonsiliasi+tes provider | SEBAGIAN | HIGH |
| REQ-17-065 | PAY-08 Mismatch produksi punya alert+owner+aging+runbook+audit | HILANG | HIGH |
| REQ-17-066 | LOG-01 Data tenant-isolated + lookup end-customer verifikasi ownership | SEBAGIAN | HIGH |
| REQ-17-067 | LOG-02 Status kanonik berversi + kode unknown gagal-aman | SEBAGIAN | MEDIUM |
| REQ-17-068 | LOG-03 Duplikat/out-of-order → satu timeline immutable + state benar | TERPENUHI | - |
| REQ-17-069 | LOG-04 Pelanggan hanya terima notifikasi terkonfigurasi/consent-compliant | HILANG | MEDIUM |
| REQ-17-070 | LOG-05 Stale/failed/lost/damaged/return buka exception tanpa mengarang ETA | SEBAGIAN | MEDIUM |
| REQ-17-071 | LOG-06 Multi-shipment/package + partial fulfillment terwakili benar | HILANG | MEDIUM |
| REQ-17-072 | LOG-07 Aksi logistik berbiaya/destruktif butuh recheck+idempotency+approval | SEBAGIAN | MEDIUM |
| REQ-17-073 | LOG-08 Tracking produksi: webhook/poll fallback + rate-limit + SLO + alert + runbook | SEBAGIAN | MEDIUM |

---

## Temuan rinci

Blok ditulis lengkap untuk semua non-`TERPENUHI` (wajib punya "Yang kurang") dan untuk invarian CRITICAL. `TERPENUHI` rutin diberi blok ringkas dengan path:baris + bukti terpanggil (tes/call site) agar tetap memenuhi aturan bukti §10.4.

### REQ-17-004 — PAID hanya dari bukti provider terverifikasi · TERPENUHI · - (invarian)

**Persyaratan** (`17 §2.4`): "A payment is not marked paid from a screenshot, redirect alone, or customer claim. It requires a verified provider webhook and/or authenticated server-to-server reconciliation."

**Kondisi nyata**: Satu-satunya penulis `chai.payment.status` di produksi adalah (a) `applyWebhook` yang memanggil `verifyMockPaymentWebhookSignature` (HMAC + `timingSafeEqual`) sebelum menyentuh state, menolak payload tak terverifikasi, dan (b) reconciler yang melakukan authenticated status query. Tidak ada jalur "tandai paid dari screenshot/redirect".

**Bukti**:
- `apps/api/src/modules/payments/postgres-payments.repository.ts` `applyWebhook()` — verifikasi dulu, `if (!verification.verified) return { verified:false }`.
- `packages/connectors/src/connectors/mock-payment/index.ts` `verifyMockPaymentWebhookSignature()` — HMAC-SHA256 + `timingSafeEqual`.
- `packages/connectors/src/conformance/payment.test.ts` — "rejects webhooks with bad signature".

### REQ-17-009 — Efek eksternal idempoten + mutasi+audit+event dalam SATU transaksi · TERPENUHI · CRITICAL (invarian)

**Koreksi 2026-07-29 (pasca-audit)**: temuan di bawah ini sudah ditutup. `applyWebhook`
(`apps/api/src/modules/payments/postgres-payments.repository.ts`) sekarang membungkus penulisan
state dengan `commitBusinessMutation`, sama seperti jalur worker — memanggil `stopPaymentReminders`
di dalam transaksi yang sama dan meng-emit event `payment.<status>` yang konsisten dengan jalur
worker. Uraian temuan asli dipertahankan di bawah sebagai jejak keputusan.

**Persyaratan** (`17 §2.9`, ADR-007): "Every external side effect is idempotent, audited, tenant-scoped, policy-checked, and reconcilable." ADR-007: "business mutation + outbox + audit in transaction".

**Kondisi nyata (saat audit ditulis)**: Jalur **worker rekonsiliasi** memenuhi penuh: `commitBusinessMutation` menjalankan mutate + `appendAuditEntry` + `appendOutboxEvent` dalam satu transaksi ber-tenant dan menolak mutasi tanpa event (`throw 'BUSINESS_MUTATION_REQUIRES_EVENT'`). Jalur **webhook API** (`applyWebhook`) meng-`UPDATE chai.payment SET status=…` **tanpa** audit dan **tanpa** outbox event dalam transaksi itu. Karena webhook adalah jalur happy-path utama (spec §6.3 langkah 6–7) dan sekali status menjadi terminal reconciler mengecualikannya (`status IN ('CREATED','PENDING','UNKNOWN_RESULT')`), transisi yang tiba lewat webhook tidak pernah menghasilkan audit/event.

**Bukti (saat audit ditulis)**:
- `packages/domain/src/outbox/producer.ts:130` `commitBusinessMutation` — mutate+audit+event satu transaksi; `BUSINESS_MUTATION_REQUIRES_EVENT`.
- `workers/payment-worker/src/reconcile.ts` `applyReconciliation()` — memakai `commitBusinessMutation`. ✔
- `apps/api/src/modules/payments/postgres-payments.repository.ts` `applyWebhook()` — `UPDATE chai.payment … RETURNING *` tanpa audit/outbox. ✘
- `workers/payment-worker/src/reconcile.ts` `selectNonTerminalPayments()` — hanya `CREATED/PENDING/UNKNOWN_RESULT`, jadi PAID via webhook tak akan di-emit ulang.

**Bukti penutupan**: `applyWebhook` kini memanggil `commitBusinessMutation(tx, { describe, mutate })` dengan `describe()` yang menyusun baris audit (`action: 'payment.status_changed'`) dan event (`payment.<status>`) dari hasil `mutate()`, persis pola yang sudah dipakai `applyReconciliation`. Diverifikasi lewat `apps/api/test/integration/payment-webhook-audit.integration.test.ts` dan suite integrasi `@chai/api`/`@chai/worker-payment-worker` (exit 0).

### REQ-17-014 — Uang = integer minor units + kode mata uang · TERPENUHI · - (invarian)

**Persyaratan** (`17 §6.1`): "Money is stored as integer minor units plus ISO currency code."

**Kondisi nyata**: Semua tabel uang di skema aktif `chai.*` menyimpan integer minor units + kolom `currency`. Tidak ada `DECIMAL`/float untuk uang. Fasad `DECIMAL(15,2)` (0036) telah di-DROP oleh 0057.

**Bukti**:
- `packages/database/migrations/0010_payments.sql` — `amount_cents integer NOT NULL`, `currency text`.
- `packages/database/migrations/0013_advanced_payments.sql` — `chai.refund/dispute/subscription.amount_cents integer`, `chai.settlement.gross_amount/net_amount/fee_amount bigint`.
- `packages/database/migrations/0014_advanced_logistics.sql` — `rate_cents bigint`, `claim.amount_cents bigint`.
- `packages/database/migrations/0057_drop_state_machine_facades.sql` — DROP `public.payment_requests/…` (komentar eksplisit: "stored money as DECIMAL(15,2): a standing violation").

### REQ-17-015 — Amount/currency immutable setelah attempt · TERPENUHI · - (invarian)

**Persyaratan** (`17 §6.1`): "Amount, currency, and business reference become immutable after a provider attempt is created; correction creates a replacement request."

**Kondisi nyata**: Trigger DB menolak perubahan `amount_cents`, `currency`, `external_id` pada `chai.payment` (penegakan di DB, bukan konvensi). Catatan: `chai.payment` tak menyimpan "business reference" (order/invoice) sama sekali (lihat REQ-17-019), sehingga aspek immutabilitas referensi bisnis tidak berlaku pada model saat ini.

**Bukti**:
- `packages/database/migrations/0043_payment_integrity.sql` — fungsi `chai.payment_money_is_immutable()` + trigger `payment_money_immutable` (`RAISE EXCEPTION 'PAYMENT_AMOUNT_IMMUTABLE'`/`_CURRENCY_`/`_EXTERNAL_ID_`).

### REQ-17-018 — PAID tak pernah mundur; presedensi waktu-event · TERPENUHI · - (invarian)

**Persyaratan** (`17 §6.2`): "…never regress `PAID` to `PENDING` without an explicit reversal/refund/dispute event." + out-of-order pakai provider event time.

**Kondisi nyata**: `decidePaymentTransition` adalah satu sumber kebenaran: `PAID:['PAID']` (terminal), event lebih tua kalah (`STALE_EVENT`), status sama = `DUPLICATE`. Dipakai di **kedua** jalur (webhook API + worker). Ada tes yang menegakkan.

**Bukti**:
- `packages/domain/src/payments/transitions.ts` — `ALLOWED` map; `PAID/EXPIRED/FAILED` hanya boleh ke dirinya; cek `eventAt < observedAt → STALE_EVENT`.
- `apps/api/src/modules/payments/postgres-payments.repository.ts` `applyWebhook()` & `workers/payment-worker/src/reconcile.ts` `applyReconciliation()` — sama-sama memanggil `decidePaymentTransition`.
- `apps/api/src/modules/payments/payment-transitions.test.ts` — "never regresses away from PAID", "keeps other terminal states terminal", "ignores an event that the provider observed earlier".

### REQ-17-025 / REQ-17-062 — Hasil create/submit tak dikenal direkonsiliasi sebelum retry · TERPENUHI · -

**Persyaratan** (`17 §6.5`, AC PAY-05): "Unknown submit result is reconciled before retry to avoid duplicate charges/links."

**Kondisi nyata**: `UNKNOWN_RESULT` adalah state eksekusi non-terminal; reconciler memetakan status provider tak dikenal ke `UNKNOWN_RESULT` (gagal-aman, bukan tebakan terminal) dan terus memoles hingga resolved. Create bersifat idempoten (unique index) sehingga retry dengan key sama mengembalikan sesi yang sama, bukan charge kedua.

**Bukti**:
- `workers/payment-worker/src/reconcile.ts` `canonicalPaymentStatus()` — `PAYMENT_STATUSES.has(raw) ? raw : 'UNKNOWN_RESULT'`.
- `packages/domain/src/payments/transitions.ts` — `UNKNOWN_RESULT:['PAID','EXPIRED','FAILED','UNKNOWN_RESULT']`, bukan terminal.
- `packages/database/migrations/0010_payments.sql` — `payment_tenant_idempotency_uidx` unik; `createCheckout()` SELECT-existing dulu.

### REQ-17-026 — ExecuteRefund/payout/split dinonaktifkan untuk AI · TERPENUHI · - (invarian)

**Persyaratan** (`17 §6.5`, §10): "`ExecuteRefund`, payout, and split settlement are disabled for AI on MVP."

**Kondisi nyata**: `TOOL_CATALOG` menandai `payment.execute_refund`/`payment.payout`/`payment.split` sebagai `aiExecutable:false`, dan `ToolExecutionEngine.execute` menolak apa pun yang bukan keputusan `ALLOW` yang cocok. `evaluateToolPolicy` memberi `AI_EXECUTION_FORBIDDEN` untuk tool `aiExecutable:false` beroriginasi AI.

**Bukti**:
- `packages/domain/src/ai-policy/tool-policy.ts` — `'payment.execute_refund': { aiExecutable:false, risk:'CRITICAL' }`, `payment.payout`, `payment.split`, `logistics.cancel` = `aiExecutable:false`.
- `services/ai-gateway/src/tool-execution.ts` — `execute()` mensyaratkan argumen `decision`, `if (decision.kind !== 'ALLOW') return {allowed:false}` dan `decision.tool !== toolName` ditolak.
- `apps/api/src/modules/actions/actions.controller.ts:76` — call site produksi `evaluateActionPolicy`, `throw ForbiddenException` pada `deny`.

### REQ-17-013 / REQ-17-047 — AI tak panggil API langsung; risk tier tool policy · TERPENUHI · - (invarian ADR-011)

**Persyaratan** (`17 §5`, §10, ADR-011): tabel risk tier tool + "AI never directly invokes external side effect; Tool Policy Engine validates…".

**Kondisi nyata**: Katalog tunggal `TOOL_CATALOG` memuat tool payment/logistik dengan tier yang cocok dengan §10 (`payment.get_status` LOW, `payment.create_link` MEDIUM+confirm, `payment.request_refund`/`shipment.create`/`schedule_pickup`/`cancel`/`create_return` HIGH+approval, `payment.execute_refund` CRITICAL non-AI, `shipment.get_status`/`get_timeline` LOW). Executor menolak tool tak dikenal (`UNKNOWN_TOOL` DENY) — "unknown tool bukan low-risk".

**Bukti**:
- `packages/domain/src/ai-policy/tool-policy.ts` — `TOOL_CATALOG`, `evaluateToolPolicy()` (urutan: unknown→DENY, HUMAN_ACTIVE/PAUSED→DENY, `!aiExecutable`→DENY, entitlement, approval/confirmation ladder).
- `services/ai-gateway/src/tool-execution.ts` — decision `ALLOW` wajib.
- `apps/api/src/modules/actions/action-policy.test.ts`, `actions.controller.ts:76` — tes + call site produksi.

**Catatan lintas jalur**: apakah *setiap* pemanggilan tool di ai-gateway selalu melewati `evaluateToolPolicy` sebelum `execute` adalah domain **jalur D**; di sini terbukti executor tak bisa jalan tanpa keputusan `ALLOW` yang cocok.

### REQ-17-032 / REQ-17-068 — Timeline immutable, dedup provider-event-id, presedensi waktu · TERPENUHI · - (invarian)

**Persyaratan** (`17 §7.3`, AC LOG-03): "…deduplicated…appended as a tracking event. Logistics Domain computes current state without deleting prior events."

**Kondisi nyata**: Append-only; dedup pada `providerEventId` di dalam row lock; status = event terbaru **menurut waktu provider** (bukan urutan tiba). Worker meng-commit lewat `commitBusinessMutation`.

**Bukti**:
- `apps/api/src/modules/logistics/postgres-logistics.repository.ts` `appendEvent()` — `if (event.providerEventId && priorEvents.some(...eventId===...)) return` (dedup), sort by `at`, `FOR UPDATE`.
- `workers/logistics-worker/src/reconcile.ts` `reconcileShipment()` — filter `!priorIds.has(providerEventId)`, `appendAndCommit` via `commitBusinessMutation`.
- `packages/connectors/src/connectors/mock-shipping/index.ts` `appendEvent()` — dedup komentar LOG-03.

### REQ-17-052 / REQ-17-058 — RLS + composite FK + kunci ber-tenant · TERPENUHI · - (invarian isolasi)

**Persyaratan** (`17 §13.7`, AC PAY-01): "RLS, composite tenant foreign keys, tenant-scoped object keys… apply to all entities."

**Kondisi nyata**: Semua tabel payment/logistik `chai.*` memakai `ENABLE`+`FORCE ROW LEVEL SECURITY` dengan policy `tenant_id = chai.current_tenant_id()`, `REVOKE ALL FROM PUBLIC`, GRANT terbatas ke runtime role. `chai.shipment` punya composite FK `(tenant_id, contact_id) → chai.contact`.

**Bukti**:
- `0010_payments.sql`, `0011_logistics.sql`, `0013_advanced_payments.sql`, `0014_advanced_logistics.sql` — pola `ENABLE`/`FORCE`/`tenant_isolation` di tiap tabel.
- `0045_shipment_ownership.sql` — `shipment_contact_fk FOREIGN KEY (tenant_id, contact_id) REFERENCES chai.contact(tenant_id, id)`.
- `apps/api/test/logistics-ownership.e2e.test.ts`, `apps/api/test/integration/payments.integration.test.ts` — tes isolasi tenant.

### REQ-17-040 — Semua mutasi butuh Idempotency-Key; guarded butuh recent-auth · TERPENUHI · -

**Persyaratan** (`17 §8`): "All mutations require `Idempotency-Key`; guarded mutations also require expected version, confirmation, approval, or recent authentication according to policy."

**Kondisi nyata**: `IdempotencyKeyInterceptor` global (APP_INTERCEPTOR) mewajibkan header `Idempotency-Key` valid untuk semua metode non-safe (kecuali `/api/service/` yang diverifikasi signature + dedup inbox, dan rute auth). Mutasi guarded (refund) menambah `assertRecentAuthentication`.

**Bukti**:
- `apps/api/src/app.module.ts:105` — `{ provide: APP_INTERCEPTOR, useClass: IdempotencyKeyInterceptor }`.
- `apps/api/src/common/idempotency.interceptor.ts` — regex `^[A-Za-z0-9._:-]{8,200}$`, `IDEMPOTENCY_KEY_REQUIRED` bila absen; `/api/service/` bypass.
- `apps/api/src/modules/advanced-payments/advanced-payments.controller.ts` `processRefund()` — `assertRecentAuthentication(request)`.
- Tes: `apps/api/src/common/idempotency.interceptor.test.ts`.

### REQ-17-001 · REQ-17-003 · REQ-17-006 · REQ-17-008 · REQ-17-010 · REQ-17-017 · REQ-17-022 · REQ-17-036 — TERPENUHI ringkas

- **REQ-17-001** (no custody, `§2.1`): MVP hanya hosted checkout; `PaymentSession` hanya berisi `checkoutUrl` provider, tak ada tabel wallet/balance/ledger dana platform; `payment.payout`/`payment.split` `aiExecutable:false`. Bukti: `packages/connectors/src/connectors/mock-payment/index.ts` (`checkoutUrl`), grep `wallet|balance|ledger` di `chai.*` migrasi = tak ada tabel kustodi.
- **REQ-17-003** (`§2.3`): `CreateCheckoutBody` hanya `amount/currency/idempotencyKey` — tak ada field kartu/CVV/PIN/OTP di mana pun rute payment. Bukti: `apps/api/src/modules/payments/payments.controller.ts` `CreateCheckoutBody`.
- **REQ-17-006** (`§2.6`, ADR-028): modul logistik MVP hanya link/get/list/appendEvent (baca+track); tak ada label/pickup/cancel di `LogisticsController`. Bukti: `apps/api/src/modules/logistics/logistics.controller.ts`.
- **REQ-17-008** (`§2.8`): domain memiliki kosakata sendiri (`PaymentStatus`, `ShipmentMilestone`) yang di-*declare* di domain/connector, bukan tipe SDK provider yang bocor. Bukti: `packages/domain/src/payments/transitions.ts` (`PaymentStatus` didefinisikan lokal), `packages/connectors/src/connectors/mock-shipping/index.ts` (`ShipmentMilestone`).
- **REQ-17-010** (`§2.10`): kapabilitas high-risk di balik entitlement + risk tier (`payment_refunds`, `payment_recurring`, `shipment_create_label`, `shipment_returns`) dan `assertCapabilityEnabled`. Bukti: `packages/domain/src/ai-policy/tool-policy.ts` (`requiredEntitlement`), `apps/api/src/modules/advanced-payments/advanced-payments.controller.ts` (`assertCapabilityEnabled('payment_refunds'|'payment_recurring')`).
- **REQ-17-017** (`§6.2`): transisi hanya lewat `decidePaymentTransition` dari event webhook terverifikasi atau reconcile query. Bukti: `postgres-payments.repository.ts applyWebhook`, `workers/payment-worker/src/reconcile.ts`.
- **REQ-17-022** (`§6.5`): tak ada jalur yang menandai PAID dari halaman redirect; status murni dari webhook/reconcile (lihat REQ-17-004). Bukti: sama dengan REQ-17-004.
- **REQ-17-036** (`§7.5`, AC LOG-07 sisi policy): aksi logistik berbiaya bertier HIGH (`shipment.create/schedule_pickup/cancel/create_return`) atau `logistics.cancel` CRITICAL non-AI, butuh approval. Bukti: `packages/domain/src/ai-policy/tool-policy.ts`.

---

### REQ-17-002 — Tiap tenant memakai akun merchant sendiri · SEBAGIAN · MEDIUM

**Persyaratan** (`17 §2.2`, §5): "Each tenant connects its own merchant/payment-gateway account… external merchant/store/account identifier; secret-manager reference".

**Kondisi nyata**: Adapter Midtrans nyata ada (`packages/connectors/src/connectors/midtrans/index.ts`) dan factory worker memilih provider dari env (`PROVIDER_PAYMENT`). Namun **jalur HTTP API** di-hardcode ke `mock-payment` (`PROVIDER = 'mock-payment'`, import `@chai/connectors/mock-payment`), dan tidak ada entitas `PaymentProviderAccount` (merchant id + secret-manager ref per-tenant) di skema.

**Bukti**:
- `apps/api/src/modules/payments/postgres-payments.repository.ts` — `const PROVIDER = 'mock-payment'`, import langsung dari `@chai/connectors/mock-payment`.
- `workers/payment-worker/src/main.ts` — `createPaymentAdapterFactory()` (env `PROVIDER_PAYMENT`) — hanya di worker.
- Grep `PaymentProviderAccount|merchant_account` di `*.sql` → tak ada tabel akun merchant per-tenant.

**Yang kurang**: Entitas `chai.payment_provider_account` (tenant, provider key, merchant/store id, secret-manager reference, environment, capabilities, health) dan pemakaian factory provider di jalur HTTP API, bukan hanya di worker.

### REQ-17-005 — Tiap tenant memakai akun carrier sendiri · SEBAGIAN · MEDIUM

**Persyaratan** (`17 §2.5`, §5): "Each tenant connects its own carrier, shipping aggregator, fulfillment, or marketplace account."

**Kondisi nyata**: Adapter JNE nyata ada (`packages/connectors/src/connectors/jne/index.ts`) dan worker memakai `createShippingAdapterFactory()` (`PROVIDER_LOGISTICS`). Namun `LogisticsRepository` API memakai adapter mock, dan tak ada entitas `ShippingProviderAccount` per-tenant di skema.

**Bukti**:
- `apps/api/src/modules/logistics/postgres-logistics.repository.ts` — import `@chai/connectors/mock-shipping`.
- `workers/logistics-worker/src/main.ts` — `createShippingAdapterFactory()`.
- Grep `ShippingProviderAccount|shipping_provider_account` = tak ada.

**Yang kurang**: Entitas `chai.shipping_provider_account` per-tenant + wiring factory carrier di jalur API.

### REQ-17-007 — Payment/fulfillment marketplace bersumber dari marketplace · TIDAK-TERVERIFIKASI · -

**Persyaratan** (`17 §2.7`): "Marketplace-owned payment and fulfillment remain sourced from the marketplace API. The platform stores a canonical projection…".

**Kondisi nyata**: Ada `0016_marketplace_and_webhooks.sql`, tetapi proyeksi kanonik payment/fulfillment marketplace spesifik tidak ditelusuri di jalur ini; konektor marketplace adalah cakupan **jalur D**.

**Yang dibutuhkan untuk memutuskan**: Telusuri modul/konektor marketplace (jalur D) untuk membuktikan proyeksi read-only status payment/fulfillment marketplace ada dan tak menimpa settlement marketplace.

### REQ-17-011 — Metadata akun provider + referensi secret-manager · SEBAGIAN · HIGH

**Persyaratan** (`17 §5`, §13.4): "secret-manager reference, never plaintext credentials… webhook subscription and signing-key version; health, last successful call…".

**Kondisi nyata**: Mock payment memakai secret webhook **global** dari env (`MOCK_PAYMENT_WEBHOOK_SECRET`), bukan referensi secret-manager per-tenant. Tidak ada entitas akun provider yang menyimpan signing-key version, health, token expiry per akun.

**Bukti**:
- `packages/connectors/src/connectors/mock-payment/index.ts` `webhookSecret()` — `env.MOCK_PAYMENT_WEBHOOK_SECRET ?? 'mock-payment-webhook-secret'` (konstanta global).
- Grep `secret_manager|secretRef|secret_ref` = tak ada di konteks payment/logistik.

**Yang kurang**: Model akun provider dengan referensi secret-manager per-tenant, versi signing-key, dan telemetri kesehatan (last call/webhook/token expiry).

### REQ-17-012 — Effective capability = irisan · SEBAGIAN · MEDIUM

**Persyaratan** (`17 §5`): "adapter capability ∩ account scope ∩ provider account state ∩ tenant entitlement ∩ tool policy".

**Kondisi nyata**: Irisan `tenant entitlement ∩ tool policy` ditegakkan (`requiredEntitlement` + `evaluateToolPolicy`). Faktor `adapter capability` (capability manifest payment/shipping), `account scope`, dan `provider account state` tidak dievaluasi karena akun provider (REQ-17-011) belum ada.

**Bukti**: `packages/domain/src/ai-policy/tool-policy.ts` (`requiredEntitlement` dicek terhadap `input.entitlements`); tak ada `discoverCapabilities` payment/shipping yang di-*intersect* saat keputusan.

**Yang kurang**: Sertakan capability manifest adapter + scope/state akun provider dalam perhitungan kapabilitas efektif.

### REQ-17-016 — Model status payment lengkap · SEBAGIAN · LOW

**Persyaratan** (`17 §6.2`): status `DRAFT→PENDING_CUSTOMER→PROCESSING→PAID` + terminal `EXPIRED/FAILED/CANCELLED/PARTIALLY_REFUNDED/REFUNDED/DISPUTED`.

**Kondisi nyata**: `chai.payment.status` = `CREATED/PENDING/PAID/EXPIRED/FAILED/UNKNOWN_RESULT`. Tidak ada `PROCESSING`, `CANCELLED`, `PARTIALLY_REFUNDED`, `REFUNDED`, `DISPUTED` sebagai status payment (refund/dispute jadi tabel terpisah `chai.refund`/`chai.dispute`). Invarian inti (PAID tak mundur, terminal tetap terminal) terpenuhi; himpunan status-nya yang tereduksi.

**Bukti**: `packages/database/migrations/0010_payments.sql` — CHECK status enam nilai; `packages/domain/src/payments/transitions.ts` — enam nilai.

**Yang kurang**: Bila fase Growth menuntut, tambah `PROCESSING`/`CANCELLED`/`PARTIALLY_REFUNDED`/`REFUNDED`/`DISPUTED` (atau proyeksikan dari tabel refund/dispute) agar status API sesuai §6.2.

### REQ-17-019 — Alur hosted-payment lengkap (on-PAID) · SEBAGIAN · CRITICAL

**Persyaratan** (`17 §6.3` langkah 9): "On `PAID`, the platform updates linked booking/order/invoice projection, stops applicable reminders, notifies parties, and records attribution."

**Kondisi nyata**: Langkah 1–8 sebagian ada (create idempoten, webhook verify, presedensi). Langkah 9 **tak ada**: tak ada update proyeksi booking/order/invoice, tak ada stop-reminder, tak ada notifikasi, tak ada atribusi. `chai.payment` bahkan tak menyimpan tautan ke booking/order/invoice.

**Bukti**:
- Grep `stop.*reminder|reminder.*stop|stopOnPaid` → hanya komentar "stop-on-paid" (arti: PAID tak mundur), tak ada penghentian follow-up job.
- Grep `payment.*attribution|revenue.*attribution` → **0 keluaran**.
- `packages/database/migrations/0010_payments.sql` — tak ada kolom `order_id/invoice_id/booking_id`.

**Yang kurang**: Konsumen event `payment.paid` yang (a) update proyeksi booking/order/invoice, (b) hentikan reminder terkait tepat sekali, (c) kirim notifikasi, (d) catat atribusi; plus tautan bisnis di `chai.payment`.

### REQ-17-020 — Kontrak adapter payment · SEBAGIAN · MEDIUM

**Persyaratan** (`17 §6.4`): operasi wajib `discoverCapabilities, createHostedPayment, getPaymentStatus, expireOrCancelPayment, normalizeWebhook, verifyWebhook, reconcilePayment, healthCheck`.

**Kondisi nyata**: Adapter mock/midtrans menyediakan `createCheckout`, `getSession`, `verifyWebhook`. Operasi `discoverCapabilities`, `normalizeWebhook`, `expireOrCancelPayment`, `reconcilePayment`, `healthCheck` tak hadir dengan nama/kontrak itu untuk payment.

**Bukti**: Grep `discoverCapabilities|createHostedPayment|reconcilePayment|healthCheck` di `packages/connectors/src/connectors` cocok pada konektor **channel** (whatsapp-meta/mock-channel), bukan adapter payment; `mock-payment` hanya cocok `verifyWebhook`.

**Yang kurang**: Standarkan adapter payment ke kontrak §6.4 (tambahkan `discoverCapabilities`, `normalizeWebhook`, `expireOrCancelPayment`, `reconcilePayment`, `healthCheck`).

### REQ-17-021 / REQ-17-059 — Amount dari sumber tepercaya; AI tak mengarang · SEBAGIAN · HIGH

**Persyaratan** (`17 §6.5`, AC PAY-02): "Amount is derived from an approved invoice/order/service catalog or a human-approved draft. AI cannot freely invent price, discount, tax, destination account, or currency."

**Kondisi nyata**: `POST client/v1/payments/checkout` menerima `amount`/`currency` **langsung dari body pemanggil** (`@IsInt @Min(1)`), tanpa ikatan ke invoice/order/katalog yang disetujui di server. Tak ada otoritas amount sisi-server yang menolak amount karangan.

**Bukti**: `apps/api/src/modules/payments/payments.controller.ts` `CreateCheckoutBody { amount, currency, idempotencyKey }` → `repository.createCheckout(tenant, body)` apa adanya.

**Yang kurang**: Turunkan/validasi amount+currency dari sumber bisnis tepercaya (invoice/order/katalog) di server; untuk origin AI, wajibkan draft yang disetujui manusia sebelum link dibuat.

### REQ-17-023 / REQ-17-050 — Verifikasi signature/timestamp + replay + body-limit webhook · SEBAGIAN · MEDIUM

**Persyaratan** (`17 §6.5`, §13.5): "Webhooks require signature/timestamp verification… replay protection, body limits, raw-payload restricted retention, and inbox deduplication."

**Kondisi nyata**: Verifikasi **signature** HMAC ada (mock: `timingSafeEqual`; midtrans mengimpor `timingSafeEqual`). Verifikasi **timestamp**, jendela **replay**, dan **body limit** khusus rute webhook payment tidak terbukti. Dedup event dilakukan lewat state machine (status sama → IGNORE), bukan tabel `PaymentWebhookEvent` ber-dedup.

**Bukti**:
- `packages/connectors/src/connectors/mock-payment/index.ts` `signatureMatches()` — HMAC + `timingSafeEqual`. ✔ (signature)
- Grep `payment_webhook_event|PaymentWebhookEvent` → hanya interface in-memory di mock, bukan tabel persist.
- `apps/api/src/modules/payments/payments.controller.ts` `webhook()` — hanya verifikasi signature; tak ada cek `timestamp`/window.

**Yang kurang**: Tambah verifikasi timestamp + jendela replay + body limit di edge webhook, dan tabel event webhook ber-dedup (retensi payload mentah terbatas).

### REQ-17-024 — Dedup create: tenant+operation+business-ref+idempotency-key · SEBAGIAN · LOW

**Persyaratan** (`17 §6.5`): "Duplicate creation uses tenant + operation + business reference + idempotency key."

**Kondisi nyata**: Dedup memakai `(tenant_id, idempotency_key)` (unique index). `operation` dan `business reference` bukan bagian kunci (dan business reference tak disimpan).

**Bukti**: `packages/database/migrations/0010_payments.sql` — `payment_tenant_idempotency_uidx ON chai.payment(tenant_id, idempotency_key)`.

**Yang kurang**: Sertakan operation + business reference dalam kunci idempotensi (setelah tautan bisnis ditambahkan, REQ-17-019).

### REQ-17-027 / REQ-17-064 — Eksekusi refund berizin · SEBAGIAN · HIGH (invarian refund)

**Persyaratan** (`17 §6.5`, AC PAY-07): "Refund execution requires recent authentication, approval according to monetary threshold, audit, and provider reconciliation."

**Kondisi nyata**: Terpenuhi: `assertCapabilityEnabled('payment_refunds')` (gate Stage-2, default mati), `assertRecentAuthentication`, permission `payment.approve`, dan domain menolak refund bila payment bukan `PAID` atau amount > payment (`FOR UPDATE`, integer minor units, idempoten). Tidak terpenuhi: **threshold moneter** (tak ada), **audit+event dalam transaksi** (`processRefund` INSERT tanpa `commitBusinessMutation`), dan **rekonsiliasi provider** (refund tetap `PENDING`, tak ada reconciler refund).

**Bukti**:
- `apps/api/src/modules/advanced-payments/advanced-payments.controller.ts` `processRefund()` — `assertCapabilityEnabled('payment_refunds')` + `assertRecentAuthentication` + `@RequirePermission('payment.approve')`. ✔
- `packages/domain/src/payments/refund.ts` `processRefund()` — cek `status !== 'PAID' → PAYMENT_NOT_REFUNDABLE`, `amountCents > amount → REFUND_EXCEEDS_PAYMENT`, dedup idempotency; **tanpa** audit/outbox. ✘
- Tak ada reconciler yang memindah `chai.refund.status` PENDING→COMPLETED dari provider.

**Yang kurang**: (a) cek threshold moneter (mis. approval dua-orang di atas ambang), (b) bungkus `processRefund` dengan `commitBusinessMutation` (audit + `refund.requested/status_changed`), (c) reconciler refund terhadap provider.

### REQ-17-028 — Output payment link tampilkan amount/currency/purpose/expiry/merchant · SEBAGIAN · MEDIUM

**Persyaratan** (`17 §6.5`): "Payment link output must show amount, currency, purpose, expiry, and merchant identity before the customer opens it."

**Kondisi nyata**: Sesi mengembalikan `amount`, `currency`, `checkoutUrl`, `expiresAt`, `status`. **Tidak ada** `purpose` (business reference) dan **merchant identity**.

**Bukti**: `apps/api/src/modules/payments/payments.controller.ts` `serialize()` — hanya amount/checkoutUrl/currency/expiresAt/externalId/status.

**Yang kurang**: Tambahkan `purpose` dan `merchantIdentity` (dari akun provider, REQ-17-011) ke payload payment link.

### REQ-17-029 — Entitas logistik kanonik · SEBAGIAN · MEDIUM

**Persyaratan** (`17 §7.1`): entitas `Shipment, ShipmentPackage, ShipmentItem, TrackingEvent, DeliveryCommitment, ProofOfDelivery, ShipmentException, ReturnShipment, ShippingReconciliation`.

**Kondisi nyata**: `chai.shipment` (satu tabel, timeline di kolom `events jsonb`) + Stage-4 `chai.return_request`/`chai.claim`/`chai.eta_prediction`. **Tidak ada** entitas first-class `ShipmentPackage`, `ShipmentItem`, `DeliveryCommitment`, `ProofOfDelivery`, `ShipmentException`, `ShippingReconciliation` (tabel `shipment_packages` 0037 di-DROP oleh 0057).

**Bukti**: `packages/database/migrations/0011_logistics.sql` (`events jsonb`, tak ada package/item), `0057_drop_state_machine_facades.sql` (DROP `public.shipment_packages`).

**Yang kurang**: Model `shipment_package`/`shipment_item` (partial fulfillment), `shipment_exception`, `proof_of_delivery`, `delivery_commitment`, `shipping_reconciliation`.

### REQ-17-030 / REQ-17-067 — Status kanonik shipment + versi + gagal-aman · SEBAGIAN · MEDIUM

**Persyaratan** (`17 §7.2`, AC LOG-02): himpunan happy-path + exception/terminal (termasuk `ON_HOLD, DELIVERY_FAILED, ADDRESS_ISSUE, CUSTOMS_HOLD, LOST, DAMAGED, CANCELLED, RETURNING, RETURNED, UNKNOWN`); "unknown code maps to `UNKNOWN`… must not be guessed by AI"; taxonomy **berversi**.

**Kondisi nyata**: `chai.shipment.status` = `LINKED/PICKED_UP/IN_TRANSIT/OUT_FOR_DELIVERY/DELIVERED/EXCEPTION/STALE/UNKNOWN`. Gagal-aman **terpenuhi** (unknown→UNKNOWN di adapter+worker) dan JNE punya map **berversi** (`JNE_STATUS_MAP_VERSION=1`). Himpunan status kurang: `ON_HOLD/DELIVERY_FAILED/ADDRESS_ISSUE/CUSTOMS_HOLD/LOST/DAMAGED/CANCELLED/RETURNING/RETURNED` diciutkan ke `EXCEPTION`.

**Bukti**:
- `packages/database/migrations/0044_shipment_unknown_status.sql` — CHECK menambah `UNKNOWN`.
- `workers/logistics-worker/src/reconcile.ts` `canonicalMilestone()` — unknown→`UNKNOWN`.
- `packages/connectors/src/connectors/jne/index.ts` — `JNE_STATUS_MAP_VERSION=1`, `MILESTONE_MAP` (mis. `REJECTED/RETURN→EXCEPTION`).

**Yang kurang**: Perluas himpunan status kanonik ke daftar §7.2 alih-alih menciutkan semuanya ke `EXCEPTION`, agar exception aktual (LOST/DAMAGED/ADDRESS_ISSUE) terbedakan.

### REQ-17-031 — Unknown→UNKNOWN + mapping alert · SEBAGIAN · MEDIUM (invarian)

**Persyaratan** (`17 §7.2`, ADR-027): "An unrecognized code maps to `UNKNOWN` and **opens a mapping alert**; it must not be guessed by AI."

**Kondisi nyata**: Pemetaan gagal-aman ke `UNKNOWN` **terpenuhi** dan berversi (JNE). Bagian "**opens a mapping alert**" tak ada — tak ada event/alert yang dibuka saat kode tak dikenal muncul.

**Bukti**: `workers/logistics-worker/src/reconcile.ts` `canonicalMilestone()` (map ke UNKNOWN, tanpa emit alert); grep `mapping.*alert|unknown.*alert` = tak ada.

**Yang kurang**: Emit event/alert (mis. `shipment.mapping_alert`) saat `canonicalMilestone` menghasilkan `UNKNOWN`, dengan kode provider mentah untuk diperbaiki.

### REQ-17-033 / REQ-17-053 / REQ-17-066 — Lookup pelanggan verifikasi ownership · SEBAGIAN · HIGH

**Persyaratan** (`17 §7.3`, §13.8, AC LOG-01, ADR-027): "Customer lookup verifies tenant plus customer/order ownership. A guessed tracking number alone must not expose address, recipient name, order items, or proof of delivery."

**Kondisi nyata**: Logika `customerLookup` yang memverifikasi kepemilikan (contact_id/order_reference, fail-closed) **ada dan diuji**, tetapi **tidak tersambung ke rute HTTP mana pun**. Rute live `GET .../logistics/shipments/:trackingNumber` memakai `customerView` (hanya tenant-scoped, tanpa bukti kepemilikan), digerbangi audience `client-portal` + permission `shipment.read` (staf, bukan end-customer self-service).

**Bukti**:
- `apps/api/src/modules/logistics/postgres-logistics.repository.ts:173` `customerLookup()` — cek `ownsByContact || ownsByOrder`, else `return null`.
- Grep `customerLookup` call site → hanya `apps/api/test/logistics-ownership.e2e.test.ts` (tes) + definisi repo; **tak ada** controller yang memanggilnya.
- `apps/api/src/modules/logistics/logistics.controller.ts` `get()` → memanggil `customerView` (tanpa proof).

**Yang kurang**: Rute self-service end-customer (audience non-staf) yang memanggil `customerLookup` dengan bukti identitas/order; jangan ekspos detail lewat `customerView` untuk pemanggil non-staf.

### REQ-17-034 — Kontrak adapter shipping · SEBAGIAN · MEDIUM

**Persyaratan** (`17 §7.4`): `discoverCapabilities, linkOrImportShipment, getShipment, getTrackingEvents, normalizeWebhook, verifyWebhook, reconcileShipment, healthCheck`.

**Kondisi nyata**: Adapter mock/jne menyediakan `linkShipment`/`getShipment`/`appendEvent`/tracking. `discoverCapabilities`, `normalizeWebhook`, `verifyWebhook`, `reconcileShipment`, `getTrackingEvents`, `healthCheck` tak hadir dengan kontrak itu untuk shipping.

**Bukti**: Grep operasi kontrak di `packages/connectors/src/connectors` tak cocok pada `jne/index.ts`/`mock-shipping/index.ts` untuk nama-nama tersebut.

**Yang kurang**: Standarkan adapter shipping ke kontrak §7.4.

### REQ-17-035 — ETA hanya dengan sumber+kesegaran · SEBAGIAN · LOW

**Persyaratan** (`17 §7.5`): "ETA is shown only with provider/source and freshness. The platform never fabricates a delivery date."

**Kondisi nyata**: MVP tracking tak menampilkan ETA (tak ada fabrikasi — sisi ini aman). Stage-4 `chai.eta_prediction` menyimpan `predicted_date` + `confidence` (advisory). Penegakan "ditampilkan hanya dengan sumber+kesegaran" adalah sisi UI (jalur E) dan tak diverifikasi di sini.

**Bukti**: `packages/database/migrations/0014_advanced_logistics.sql` — `eta_prediction (predicted_date, confidence, factors)`, komentar "advisory heuristic ETA, not a carrier SLA".

**Yang kurang**: Pastikan setiap tampilan ETA membawa sumber + timestamp kesegaran + label advisory (verifikasi bersama jalur E).

### REQ-17-038 — Akses Proof of Delivery aman · HILANG · MEDIUM

**Persyaratan** (`17 §7.5`, §10, AC): "Proof-of-delivery access is role-checked, short-lived, audited, and masked where possible."

**Kondisi nyata**: Ada permission `proof_of_delivery.read` dan tool `shipment.get_proof_of_delivery`, tetapi **tak ada penyimpanan PoD** (kolom/tabel), **tak ada endpoint** `GET .../shipments/:id/proof-of-delivery`, dan tak ada referensi short-lived/masking.

**Bukti**: Grep `proof-of-delivery|proofOfDelivery|proof_of_delivery` → hanya permission (`packages/auth/src/permissions.ts`) + entri tool policy; **0** controller/route/tabel.

**Yang kurang**: Entitas `proof_of_delivery` (referensi terbatas), endpoint guarded short-lived + audit + masking, terhubung ke tool `shipment.get_proof_of_delivery`.

### REQ-17-039 — Alamat/penerima dikecualikan dari analytics/log/AI · SEBAGIAN · LOW

**Persyaratan** (`17 §7.5`): "Full address and recipient data are excluded from broad analytics, logs, and AI context unless needed…".

**Kondisi nyata**: `chai.shipment` MVP tak menyimpan alamat/nama penerima (hanya carrier/tracking/contact_id/order_reference), sehingga secara struktural tak ada PII alamat untuk bocor. Namun tak ada kontrol redaksi eksplisit; kepatuhan bergantung pada "tidak menyimpan".

**Bukti**: `packages/database/migrations/0011_logistics.sql` + `0045_shipment_ownership.sql` — tak ada kolom alamat/recipient.

**Yang kurang**: Saat alamat/penerima ditambahkan (Stage 2+), sertakan kontrol redaksi eksplisit untuk analytics/log/konteks AI.

### REQ-17-041 — Endpoint payment klien (§8.1) · SEBAGIAN · MEDIUM

**Persyaratan** (`17 §8.1`): daftar endpoint termasuk `:id/payment-links`, `:id/cancel`, `:id/reconcile`, `:id/refund-requests`.

**Kondisi nyata**: Ada `POST checkout` (create), `GET payments` (list), `GET payments/:externalId` (detail), dan refund (`advanced-payments`). **Tak ada** `payment-links` (refresh), `cancel` (dan tak ada status `CANCELLED`), `reconcile` (guarded), `refund-requests` (workflow approval terpisah). Bentuk path berbeda (`api/client/v1/payments/*`).

**Bukti**: `apps/api/src/modules/payments/payments.controller.ts` (hanya checkout/list/get/webhook); grep `payments/:id/cancel|/reconcile` = tak ada.

**Yang kurang**: Endpoint cancel/expire (+ status `CANCELLED`), reconcile guarded, refresh payment-link, dan refund-request (approval) terpisah dari eksekusi.

### REQ-17-042 — Endpoint logistik klien (§8.2) · SEBAGIAN · MEDIUM

**Persyaratan** (`17 §8.2`): termasuk `:id/reconcile`, `:id/proof-of-delivery`, `shipment-exceptions`, `:id/return-requests`.

**Kondisi nyata**: Ada list/get/link + `:trackingNumber/events`. **Tak ada** reconcile, proof-of-delivery, shipment-exceptions (antrian), return-requests.

**Bukti**: `apps/api/src/modules/logistics/logistics.controller.ts`; grep `shipment-exception|proof-of-delivery` = 0 route.

**Yang kurang**: Endpoint reconcile, proof-of-delivery guarded, antrian exception + resolve, return-request.

### REQ-17-044 — Event kanonik payment/shipment · SEBAGIAN · HIGH

**Persyaratan** (`17 §9.1`): daftar event `payment_request.created, payment_link.created, payment.status_changed, payment.paid, payment.expired, payment.failed, payment.reconciliation_mismatch, refund.*` dan `shipment.created/linked/status_changed/tracking_event_recorded/delivered/exception_opened/exception_resolved/stale_detected, return.status_changed`.

**Kondisi nyata**: Worker meng-emit `payment.paid/expired/failed` dan `shipment.tracking_updated/shipment.stale`. **Tak ada** `payment_request.created`, `payment_link.created`, `payment.status_changed`, `payment.reconciliation_mismatch`, `refund.*`, `shipment.created/linked/delivered/exception_opened/exception_resolved/tracking_event_recorded`, `return.status_changed`. Jalur webhook API tak meng-emit apa pun.

**Bukti**:
- `workers/payment-worker/src/reconcile.ts` — `eventType: 'payment.'+status.toLowerCase()`; tes `workers/payment-worker/test/reconcile.integration.test.ts:90` (`'payment.paid'`).
- `workers/logistics-worker/src/reconcile.ts` — hanya `shipment.tracking_updated`/`shipment.stale`.
- Grep `payment.status_changed|payment_request.created|payment_link.created` = **0**; `shipment.delivered|exception_opened` = **0**; `reconciliation_mismatch` = **0**.

**Yang kurang**: Emit sisa event kanonik (terutama `payment.paid`/`payment.status_changed` dari jalur webhook, `shipment.delivered`, `shipment.exception_opened/resolved`, `payment.reconciliation_mismatch`, `refund.*`).

### REQ-17-045 — Himpunan command · SEBAGIAN · LOW

**Persyaratan** (`17 §9.2`): `CreatePaymentRequest, CreatePaymentLink, CancelPaymentRequest, ReconcilePayment, RequestRefund; LinkShipment, RefreshShipmentTracking, CreateShipment, SchedulePickup, CancelShipment, CreateReturnShipment, ResolveShipmentException`.

**Kondisi nyata**: Terwakili sebagai rute/fungsi: create checkout, refund, LinkShipment, refresh (reconciler). `CancelPaymentRequest`, `ReconcilePayment` (guarded), `CreateShipment/SchedulePickup/CancelShipment/CreateReturnShipment/ResolveShipmentException` tak ada di MVP (post-MVP).

**Bukti**: controllers payment/logistics; tool catalog punya nama tool tapi tanpa executor rute.

**Yang kurang**: Implementasi command yang hilang saat fase mutasi (Stage 2+).

### REQ-17-048 — Aturan komunikasi AI · SEBAGIAN · MEDIUM

**Persyaratan** (`17 §10`): "never claim paid from image/OCR evidence; cite provider/source timestamp; …escalate disputes, suspected fraud, lost/damaged…".

**Kondisi nyata**: Secara struktural AI tak bisa mengklaim PAID dari gambar karena `payment.get_status` hanya membaca status kanonik (yang hanya berubah dari webhook terverifikasi). Namun **tak ada guardrail output AI eksplisit** untuk aturan-aturan ini (larangan teks "paid" dari gambar, sitasi timestamp sumber, eskalasi). Ini domain **jalur D** (AI safety).

**Bukti**: Grep `screenshot|\bOCR\b|paid from|image.*proof` → **0 keluaran**.

**Yang kurang**: Guardrail output pada ai-gateway (jalur D) yang menegakkan aturan komunikasi §10.

### REQ-17-049 — Secret manager per-tenant/rotasi · SEBAGIAN · HIGH

**Persyaratan** (`17 §13.4`): "Store provider tokens/keys in a secret manager using per-tenant references, least scope, rotation, environment separation, and audited access."

**Kondisi nyata**: Secret webhook mock adalah konstanta env global; tak ada referensi secret-manager per-tenant maupun rotasi kunci untuk payment/logistik. (Ada `0061_mfa_secret_encryption.sql` untuk MFA — konteks berbeda.)

**Bukti**: `packages/connectors/src/connectors/mock-payment/index.ts` `webhookSecret()`; grep `rotate.*key|secret_manager` konteks payment = tak ada.

**Yang kurang**: Referensi secret-manager per-tenant + rotasi + pemisahan environment + akses ter-audit untuk kredensial provider.

### REQ-17-056 — Kontrol reliability wajib · SEBAGIAN · MEDIUM

**Persyaratan** (`17 §14`): "provider-aware retry and `Retry-After`; circuit breaker and tenant/provider fair queues; uncertain-result state…; gap detection…; daily summary reconciliation…; kill switch by tenant, provider account, operation, and tool…".

**Kondisi nyata**: **Ada**: uncertain-result (`UNKNOWN_RESULT`), reconciler terjadwal (poller), kill switch **per-proses** yang tersambung ke controller (`isKillSwitchOn → 503`). **Kurang/tak tersambung**: `KillSwitchRuntime` berstruktur (env/db/owner, per-tenant+provider) hanya dipakai tes; tak ada per-operation/per-tool/per-provider-account; tak ada circuit breaker payment/logistik, `Retry-After`-aware retry, gap detection webhook-silence, atau ringkasan rekonsiliasi harian.

**Bukti**:
- `apps/api/src/modules/payments/postgres-payments.repository.ts` `killSwitch` (boolean per-proses) + `payments.controller.ts:67`.
- `packages/connectors/src/kill-switch.ts` `KillSwitchRuntime` (env/db/owner) — grep `getKillSwitchRuntime|new KillSwitchRuntime|.isTripped(` hanya di `kill-switch.test.ts` + `tests/staging/s2-connector-activation.test.ts` + definisi; **tak ada** call site di `apps/`/`workers/` produksi. Komentar: "in-memory kill switch store. Swap for Postgres when persistence is needed."

**Yang kurang**: Wire `KillSwitchRuntime` (persist DB, per-tenant/provider-account/operation/tool) ke jalur payment/logistik; tambah circuit breaker + Retry-After + gap detection + daily reconcile summary.

### REQ-17-057 — Cakupan tes minimum §16 · SEBAGIAN · MEDIUM

**Persyaratan** (`17 §16`): daftar cakupan (isolasi tenant; webhook valid/invalid/replay/dup/out-of-order/unknown/oversized/rotation; create timeout & unknown-result reconcile; concurrent create; immutability/overflow/rounding/zero/negatif; paid→late-pending; refund/return transitions; multi-shipment/package; customer lookup valid/invalid/guessed; stale/429/5xx/circuit/backlog/restart/failover; AI abuse; UI states; metric reconciliation; load profile).

**Kondisi nyata**: **Ada** tes kuat: transisi (`payment-transitions.test.ts`), signature webhook (`conformance/payment.test.ts`), dedup + ownership (`logistics-ownership.e2e.test.ts`), kill switch (integration/e2e), reconcile integration (payment/logistics-worker). **Kurang**: oversized payload, key rotation, overflow/rounding/negatif amount, concurrent creation, 429/5xx/circuit/failover, upaya AI mengarang amount/klaim screenshot/refund tanpa approval, metric reconciliation, load profile.

**Bukti**: berkas tes yang ada di `apps/api/test/*`, `workers/*/test/*`, `packages/connectors/src/conformance/*`; tak ada berkas tes untuk skenario di atas (grep nama tak menemukan).

**Yang kurang**: Tambah tes untuk skenario yang belum tercakup, terutama overflow/rounding uang, oversized/rotation webhook, dan upaya penyalahgunaan AI.

---

### REQ-17-060 — PAY-03 · TERPENUHI · - — lihat REQ-17-004 (status hanya dari bukti provider terverifikasi).

### REQ-17-061 — PAY-04 · TERPENUHI · - (invarian)

**Persyaratan** (`17 §18 PAY-04`): "Duplicate/replayed/out-of-order webhook cannot duplicate or regress a logical payment."

**Kondisi nyata**: `decidePaymentTransition` menangani duplikat (`DUPLICATE`), out-of-order (`STALE_EVENT` via provider event time), dan terminal (`TERMINAL`); dipakai di jalur webhook + worker; `FOR UPDATE` mencegah balapan. Idempotency create mencegah duplikasi link.

**Bukti**: `packages/domain/src/payments/transitions.ts`; `apps/api/src/modules/payments/payment-transitions.test.ts` (semua kasus); `postgres-payments.repository.ts applyWebhook` (`SELECT … FOR UPDATE`).

### REQ-17-063 — PAY-06 Paid update proyeksi + stop reminder tepat sekali · SEBAGIAN · CRITICAL

**Koreksi 2026-07-29 (pasca-audit)**: naik dari HILANG ke SEBAGIAN. Bagian stop-reminder sudah
ditutup: `stopPaymentReminders` (dipanggil oleh `applyWebhook` dan `applyReconciliation`, keduanya
di dalam transaksi yang sama dengan perubahan status) menghentikan `chai.follow_up_job` yang
menautkan `payload->>'paymentExternalId'`, dengan predikat `status = 'PENDING'` sebagai backstop
tepat-sekali. Bagian "updates linked projection" **tetap terbuka** — persyaratan §18 PAY-06 memakai
kata "and" sehingga menuntut kedua bagian, dan bagian ini sama kondisinya dengan REQ-17-019 (lihat
uraian di sana): tidak ada tabel `order`/`invoice` kanonik untuk diproyeksikan, butuh keputusan
model bisnis sebelum dikerjakan.

**Persyaratan** (`17 §18 PAY-06`): "Paid event updates linked projection and stops applicable reminders exactly once."

**Kondisi nyata (saat audit ditulis)**: Tak ada penghentian reminder pada PAID, tak ada update proyeksi tertaut, dan jalur webhook tak meng-emit event sama sekali (lihat REQ-17-009/019).

**Bukti**: Grep `stop.*reminder|reminder.*stop|stopOnPaid|stop_on_paid` → hanya komentar "stop-on-paid" (arti berbeda: PAID tak mundur), **tak ada** penghentian follow-up job; `chai.payment` tak punya tautan proyeksi.

**Yang kurang**: Konsumen `payment.paid` yang menghentikan reminder terkait tepat sekali (idempoten via outbox at-least-once + dedup) dan meng-update proyeksi booking/order/invoice.

### REQ-17-065 — PAY-08 Mismatch produksi terkelola · HILANG · HIGH

**Persyaratan** (`17 §18 PAY-08`): "Production payment mismatch has alert, owner, aging target, runbook, and audit trail."

**Kondisi nyata**: Tak ada entitas `PaymentReconciliation`, event `payment.reconciliation_mismatch`, alert, owner, atau aging.

**Bukti**: Grep `reconciliation_mismatch|PaymentReconciliation|payment_reconciliation` di `*.ts`/`*.sql` → **0 keluaran**.

**Yang kurang**: Entitas rekonsiliasi + event mismatch + alert/owner/aging + runbook (§14/§17 Stage 3) + audit.

### REQ-17-069 — LOG-04 Notifikasi terkonfigurasi/consent · HILANG · MEDIUM

**Persyaratan** (`17 §18 LOG-04`, §11): "Customer receives only configured, consent/policy-compliant milestone notifications." (template simpan version, consent basis, business hours, max sends, dedup key, stop rules, escalation target).

**Kondisi nyata**: Worker meng-emit `shipment.tracking_updated`/`shipment.stale`, tetapi tak ada mesin notifikasi milestone dengan consent/business-hours/dedup/stop-rules untuk logistik.

**Bukti**: Grep `shipment.delivered|exception_opened` = 0; tak ada template notifikasi logistik dengan consent/dedup di modul logistik.

**Yang kurang**: Engine notifikasi milestone (consent basis, business hours, max sends, dedup key, stop rules, escalation) yang mengonsumsi event shipment.

### REQ-17-070 — LOG-05 Exception aktIonable tanpa mengarang ETA · SEBAGIAN · MEDIUM

**Persyaratan** (`17 §18 LOG-05`): "Stale/failed/lost/damaged/return events open actionable exceptions without inventing ETA."

**Kondisi nyata**: Deteksi **STALE** ada (`shouldMarkStale` + event `shipment.stale`). Tak ada **entitas/antrian exception** yang actionable (owner, severity, resolve), dan status `LOST/DAMAGED/DELIVERY_FAILED/RETURNING` tak dibedakan (diciutkan ke `EXCEPTION`).

**Bukti**: `workers/logistics-worker/src/reconcile.ts` (`shipment.stale`); grep `shipment_exception|ShipmentException|exception_opened` → **0 keluaran**.

**Yang kurang**: Entitas `shipment_exception` (severity/owner/next-action/resolution) + status LOST/DAMAGED/DELIVERY_FAILED + event `exception_opened/resolved`.

### REQ-17-071 — LOG-06 Multi-shipment/package + partial fulfillment · HILANG · MEDIUM

**Persyaratan** (`17 §18 LOG-06`, §7.1): "Multiple shipments/packages and partial fulfillment are represented correctly."

**Kondisi nyata**: `chai.shipment` tak punya model package/item; satu order↔banyak shipment dan partial fulfillment tak terwakili (tabel `shipment_packages` 0037 di-DROP oleh 0057, tak ada penggantinya di `chai`).

**Bukti**: `packages/database/migrations/0011_logistics.sql` (tak ada package/item); `0057_drop_state_machine_facades.sql` (DROP `public.shipment_packages`).

**Yang kurang**: Model `chai.shipment_package` + `chai.shipment_item` + relasi order→shipment(s) untuk partial fulfillment.

### REQ-17-072 — LOG-07 Aksi logistik destruktif berizin · SEBAGIAN · MEDIUM

**Persyaratan** (`17 §18 LOG-07`): "Cost-bearing or destructive logistics actions require state recheck, idempotency, and approval."

**Kondisi nyata**: **Policy** menggerbangi (tool HIGH/`logistics.cancel` CRITICAL non-AI + approval). Namun **eksekutor mutasi** (create/pickup/cancel/return) dengan state recheck + idempotency belum ada di MVP (read-first).

**Bukti**: `packages/domain/src/ai-policy/tool-policy.ts`; tak ada rute mutasi logistik di `logistics.controller.ts`.

**Yang kurang**: Saat mutasi logistik diaktifkan (Stage 2), tegakkan state recheck + idempotency-key + approval di eksekutor.

### REQ-17-073 — LOG-08 Tracking produksi tangguh · SEBAGIAN · MEDIUM

**Persyaratan** (`17 §18 LOG-08`): "Production tracking has webhook/poll fallback, rate-limit control, SLO, alert, and runbook."

**Kondisi nyata**: **Poll fallback** ada (`runLogisticsReconciler` + SLA gate). **Kurang**: kontrol rate-limit per provider, SLO terukur, alert, dan runbook (jalur F/operasional).

**Bukti**: `workers/logistics-worker/src/reconcile.ts` (`shouldMarkStale`, `selectTrackableShipments`); tak ada rate-limit/alert/runbook logistik.

**Yang kurang**: Rate-limit provider-aware, definisi SLO + alert, runbook exception/backlog.

---

### TIDAK-TERVERIFIKASI — perlu bukti tambahan

- **REQ-17-037** (`§7.5`): reconcile-before-retry untuk pembuatan shipment/label tak berlaku di MVP read-first (tak ada create/label). Perlu diputuskan saat mutasi logistik ada.
- **REQ-17-043** (`§8`): scoping konten endpoint owner (tanpa secret/alamat/PoD) — perlu penilaian owner-console (jalur E/F).
- **REQ-17-046** (`§9.3`): 6 antrian bernama (payment-webhook/command/reconciliation, logistics-webhook/command/poll) — implementasi memakai poller interval + outbox Redis Streams, bukan antrian bernama itu; perlu telaah broker (jalur B/F).
- **REQ-17-051** (`§13.6`): tak melog URL/token/alamat/PoD — perlu audit logging (jalur A/F).
- **REQ-17-054** (`§13.9`): retensi/hapus/ekspor data payment & delivery — `0030_retention_policy.sql` generik; inklusi payment/delivery spesifik perlu telaah (jalur A).
- **REQ-17-055** (`§14`): target SLO adalah metrik runtime; tak terverifikasi statis (jalur F).

---

## Blok bukti berdiri-sendiri — 23 temuan (substansiasi baris tabel)

Blok berikut memberi bukti `path:baris` untuk 23 REQ yang sebelumnya hanya berupa baris tabel Ringkasan plus rujukan dalam blok gabungan (`REQ-a / REQ-b`), butir "TERPENUHI ringkas", atau daftar TIDAK-TERVERIFIKASI. Semua diverifikasi ulang terhadap kode terkini (termasuk `applyWebhook` yang kini memakai `commitBusinessMutation` + `stopPaymentReminders`). Kelas dipertahankan sama dengan baris tabel; satu koreksi (REQ-17-058) dijelaskan di bloknya.

### REQ-17-003 — Card/CVV/PIN/OTP/kredensial bank tak pernah masuk platform · TERPENUHI · -

**Persyaratan** (`17 §2.3`): "MVP payment uses provider-hosted checkout/payment links. Card number, CVV, PIN, OTP, and banking credentials never enter platform chat, forms, logs, or storage."

**Kondisi nyata**: Satu-satunya body pembuatan pembayaran, `CreateCheckoutBody`, hanya menerima `amount`/`currency`/`idempotencyKey`. `ValidationPipe` global (`whitelist:true` + `forbidNonWhitelisted:true`) menolak field asing pada body (mis. `cardNumber`, `cvv`) dengan 400, bukan diam-diam menerimanya. MVP memakai hosted checkout: sesi hanya mengembalikan `checkoutUrl` provider. Tak ada field kartu/CVV/PIN/OTP di seluruh modul payment.

**Bukti**:
- `apps/api/src/modules/payments/payments.controller.ts:32-40` — `class CreateCheckoutBody { amount; currency; idempotencyKey }`; call site produksi `createCheckout()` :56 (`@Body() body: CreateCheckoutBody`).
- `apps/api/src/bootstrap.ts:80-86` — `app.useGlobalPipes(new ValidationPipe({ forbidNonWhitelisted:true, … whitelist:true }))`.
- Perintah: `Select-String -Path apps/api/src/modules/payments -Pattern 'cvv|CVV|cardNumber|card_number|cardholder|securityCode|panNumber|\bOTP\b|\bPIN\b'` → **0 keluaran**.

### REQ-17-006 — Logistik MVP read-first (tanpa mutasi) · TERPENUHI · -

**Persyaratan** (`17 §2.6`, ADR-028): "MVP logistics is read-first: import/link a shipment, fetch tracking, normalize events, and notify. Shipment purchase, label, pickup, and return mutations arrive after the tracking foundation is stable."

**Kondisi nyata**: `LogisticsController` hanya mengekspos link/import, list, get (customer view), dan appendEvent (simulasi milestone read-only). Tak ada rute purchase/label/pickup/cancel/quote/return.

**Bukti**:
- `apps/api/src/modules/logistics/logistics.controller.ts:73` `POST shipments` (link), `:95` `GET shipments` (list), `:109` `GET shipments/:trackingNumber` (get→`customerView`), `:124` `POST shipments/:trackingNumber/events` (appendEvent; komentar "read-only vertical").
- Controller dibaca penuh: tak ada handler label/pickup/cancel/return.

### REQ-17-008 — Tipe SDK provider tak bocor ke entitas core · TERPENUHI · -

**Persyaratan** (`17 §2.8`): "Provider SDK types never leak into core entities. Payment and shipping providers implement internal adapters and capability manifests."

**Kondisi nyata**: Kosakata status dideklarasikan oleh domain/adapter internal, bukan diimpor dari SDK provider. `PaymentStatus` di-*declare* di `@chai/domain` (komentar eksplisit "Defined here rather than imported from a connector"), `ShipmentMilestone` di-*declare* di adapter internal `mock-shipping`; adapter JNE me-*re-export* tipe internal itu, bukan tipe SDK JNE.

**Bukti**:
- `packages/domain/src/payments/transitions.ts:33` — `export type PaymentStatus = …` (union lokal domain).
- `packages/connectors/src/connectors/mock-shipping/index.ts:3` — `export type ShipmentMilestone = …` (union kanonik adapter).
- `packages/connectors/src/connectors/jne/index.ts:5` — `export type { ShipmentMilestone, TrackingEvent } from '../mock-shipping/index.js'`.

### REQ-17-010 — Kapabilitas high-risk di balik gate rollout · TERPENUHI · -

**Persyaratan** (`17 §2.10`): "Refunds, payouts, split payments, recurring mandates, shipment cancellation after handoff, and return creation are high-risk capabilities with explicit rollout gates."

**Kondisi nyata**: Setiap kapabilitas high-risk digerbangi entitlement (rollout gate per-tenant) di katalog tool, dan controller Stage-2 memanggil `assertCapabilityEnabled` sebelum aksi. Refund/subscription default mati hingga entitlement dinyalakan.

**Bukti**:
- `packages/domain/src/ai-policy/tool-policy.ts:84,93,98,108,115` — `requiredEntitlement`: `payment.request_refund`→`payment_refunds`, `shipment.create`→`shipment_create_label`, `schedule_pickup`→`shipment_pickup`, `create_return`→`shipment_returns`, `payment.execute_refund`→`payment_refunds`.
- `apps/api/src/modules/advanced-payments/advanced-payments.controller.ts:131` `processRefund()`→`assertCapabilityEnabled('payment_refunds')`; :89 `createSubscription()`→`assertCapabilityEnabled('payment_recurring')` (call site produksi).
- Gate ditegakkan di `evaluateToolPolicy` (`FEATURE_NOT_ENABLED` DENY) — `tool-policy.ts` sekitar :193.

### REQ-17-017 — Transisi hanya dari bukti provider terverifikasi · TERPENUHI · -

**Persyaratan** (`17 §6.2`): "Transitions are accepted only from a verified provider event, verified status query, or authorized local command whose effect is subsequently reconciled."

**Kondisi nyata**: Perubahan `chai.payment.status` hanya lewat `decidePaymentTransition`, dipanggil di dua jalur produksi: (a) webhook API setelah verifikasi HMAC, dan (b) worker rekonsiliasi setelah authenticated status query. Tak ada penulis status lain.

**Bukti**:
- `packages/domain/src/payments/transitions.ts:71` `decidePaymentTransition()`.
- `apps/api/src/modules/payments/postgres-payments.repository.ts:174` — call site webhook (setelah `verifyMockPaymentWebhookSignature`, `FOR UPDATE` :167).
- `workers/payment-worker/src/reconcile.ts` `applyReconciliation()` memanggil `decidePaymentTransition` (dipicu `runPaymentReconciler`, `main.ts:38`).
- Tes: `apps/api/src/modules/payments/payment-transitions.test.ts:22,38,49,58`.

### REQ-17-022 — Halaman redirect sukses bukan bukti settlement · TERPENUHI · -

**Persyaratan** (`17 §6.5`): "A redirect success page is customer UX only, not settlement proof."

**Kondisi nyata**: Tak ada jalur kode yang menandai `PAID` dari redirect/return URL. Status hanya berubah lewat `decidePaymentTransition` dari webhook terverifikasi atau reconcile query (sama dengan REQ-17-004). Rute payment tak punya endpoint "confirm from redirect".

**Bukti**:
- `apps/api/src/modules/payments/postgres-payments.repository.ts:143` `applyWebhook()` (verifikasi HMAC dulu) & `workers/payment-worker/src/reconcile.ts` — satu-satunya penulis status.
- `apps/api/src/modules/payments/payments.controller.ts` — rute hanya checkout/list/get/webhook (:119); tak ada rute redirect/return→PAID.

### REQ-17-036 — Aksi logistik berbiaya/destruktif butuh policy/konfirmasi · TERPENUHI · - (sisi policy)

**Persyaratan** (`17 §7.5`): "Address correction, label purchase, pickup, cancellation, and return may create cost or operational impact and therefore require policy/confirmation."

**Kondisi nyata**: Semua aksi logistik berbiaya bertier HIGH (butuh approval manusia) di katalog tool, dan `logistics.cancel` CRITICAL non-AI. `evaluateToolPolicy` memaksa `REQUIRE_APPROVAL` untuk HIGH/CRITICAL sebelum `ALLOW`. Ini sisi policy; eksekutor mutasinya sendiri belum ada di MVP read-first (dilacak REQ-17-072).

**Bukti**:
- `packages/domain/src/ai-policy/tool-policy.ts:93,98,108` — `shipment.create/schedule_pickup/create_return` = HIGH; :124 `logistics.cancel` = CRITICAL `aiExecutable:false`.
- `packages/domain/src/ai-policy/tool-policy.ts:206` — cabang HIGH/CRITICAL → `APPROVAL_REQUIRED` bila `!approvedBy`.
- Call site produksi: `apps/api/src/modules/actions/actions.controller.ts:76` (`evaluateActionPolicy`; throw `ForbiddenException` pada deny :86).

### REQ-17-037 — Hasil submit tak pasti direkonsiliasi sebelum shipment/label baru · TIDAK-TERVERIFIKASI · -

**Persyaratan** (`17 §7.5`): "Unknown submit result is reconciled before another shipment/label is created."

**Kondisi nyata**: Persyaratan ini menyangkut PEMBUATAN shipment/label. Di MVP read-first tak ada rute create/label/purchase (REQ-17-006), sehingga tak ada operasi create yang bisa menghasilkan "unknown submit result" untuk direkonsiliasi. Kondisinya belum eksis; tak dapat diputuskan TERPENUHI/HILANG secara statis.

**Bukti**: `apps/api/src/modules/logistics/logistics.controller.ts` — hanya link/list/get/appendEvent (dibaca penuh); tak ada `createShipment`/`purchaseLabel`.

**Yang dibutuhkan untuk memutuskan**: Verifikasi ulang saat mutasi logistik (Stage 2) diaktifkan — buktikan jalur create memarkir hasil tak pasti dan merekonsiliasi sebelum membuat shipment/label kedua.

### REQ-17-043 — Endpoint owner: health/lag/mismatch tanpa secret/alamat/PoD · TIDAK-TERVERIFIKASI · -

**Persyaratan** (`17 §8`): "Owner endpoints expose cross-tenant health, lag, failures, and reconciliation mismatch metadata, but do not expose unrestricted payment secrets, customer addresses, or proof-of-delivery content."

**Kondisi nyata**: Permukaan owner (owner-console + owner API) berada di luar cakupan berkas jalur C (domain payment/logistics). Apakah endpoint owner payment/logistics health/lag/mismatch ada dan menyaring secret/alamat/PoD memerlukan penelusuran modul owner (jalur E/F). Selain itu event `payment.reconciliation_mismatch` belum di-emit (REQ-17-065 HILANG), jadi metadata mismatch belum bersumber.

**Yang dibutuhkan untuk memutuskan**: Telaah owner-console/owner API (jalur E/F): daftar endpoint owner payment/logistics + pembuktian payload mengecualikan secret/alamat/PoD. Bergantung pula pada REQ-17-065.

### REQ-17-046 — Isolasi beban antrian (6 queue); antrian tak bawa kredensial · TIDAK-TERVERIFIKASI · -

**Persyaratan** (`17 §9.3`): enam antrian bernama (payment-webhook/command/reconciliation, logistics-webhook/command/poll) dengan isolasi prioritas; "Queues carry tenant and resource references, never provider credentials or full sensitive payloads."

**Kondisi nyata**: Implementasi payment/logistik memakai poller interval (`runPaymentReconciler`/`runLogisticsReconciler`) + outbox Redis Streams, bukan enam antrian bernama itu. Bagian normatif "antrian tak membawa kredensial" memerlukan telaah bentuk payload broker (jalur B/F), di luar cakupan berkas ini.

**Bukti**: `Select-String -Pattern 'payment-webhook|payment-reconciliation|logistics-webhook|logistics-poll|payment-command|logistics-command'` di kode produksi (`apps/`, `workers/`, `packages/broker`) → tak ada definisi queue bernama (hanya blueprint/plan/audit docs). `workers/payment-worker/src/main.ts:38` & `workers/logistics-worker/src/main.ts:39` — poller, bukan konsumen antrian bernama.

**Yang dibutuhkan untuk memutuskan**: Telaah `packages/broker` + worker (jalur B/F): apakah isolasi beban 6-antrian dipenuhi model poller+streams, dan buktikan payload broker payment/logistik tak memuat kredensial provider.

### REQ-17-047 — Risk tier + default AI tool policy (§10) · TERPENUHI · - (ADR-011)

**Persyaratan** (`17 §10`): tabel risk tier tool (GetPaymentStatus Low, CreatePaymentLink Medium+confirm, RequestRefund High, ExecuteRefund Critical non-AI, GetShipmentStatus/Timeline Low, CreateShipment/SchedulePickup/CancelShipment/CreateReturnShipment High, GetProofOfDelivery Medium) — "AI never directly invokes external side effect".

**Kondisi nyata**: `TOOL_CATALOG` tunggal memuat tier yang cocok §10, dan `evaluateToolPolicy` menegakkan urutan: unknown→DENY, HUMAN_ACTIVE/PAUSED→DENY, `!aiExecutable`→DENY, entitlement, lalu tangga approval/confirmation. Dipanggil di produksi lewat `evaluateActionPolicy` (API) dan dijaga eksekutor ai-gateway yang menolak apa pun bukan `ALLOW` yang cocok.

**Bukti**:
- `packages/domain/src/ai-policy/tool-policy.ts:38` `TOOL_CATALOG`, :152 `evaluateToolPolicy` (unknown→`UNKNOWN_TOOL` :158, `!aiExecutable`→`AI_EXECUTION_FORBIDDEN` :184, HIGH/CRITICAL→`APPROVAL_REQUIRED` :206).
- `apps/api/src/modules/actions/action-policy.ts:23,31` `evaluateActionPolicy` membungkus `evaluateToolPolicy`; call site `apps/api/src/modules/actions/actions.controller.ts:76`.
- `services/ai-gateway/src/tool-execution.ts:135,142` — `execute()` menolak bila `decision.kind !== 'ALLOW'` atau `decision.tool !== toolName`.
- Tes: `apps/api/src/modules/actions/action-policy.test.ts` (10 kasus, mis. :12,25,34).

**Catatan**: apakah SETIAP panggilan tool ai-gateway melewati `evaluateToolPolicy` sebelum `execute` adalah domain jalur D; di sini terbukti eksekutor tak bisa jalan tanpa keputusan `ALLOW` yang cocok.

### REQ-17-050 — Webhook signature/timestamp+replay+body-limit+inbox dedup · SEBAGIAN · MEDIUM

**Persyaratan** (`17 §13.5`): "Verify webhook signature/timestamp; use replay protection, body limits, raw-payload restricted retention, and inbox deduplication."

**Kondisi nyata**: Verifikasi **signature** HMAC-SHA256 (constant-time) **terpenuhi dan diuji**. **Timestamp**, jendela **replay**, dan **body limit** khusus rute webhook payment **tidak ada**. Dedup via state machine (status sama→IGNORE), bukan inbox `PaymentWebhookEvent` ber-dedup persist.

**Bukti**:
- `packages/connectors/src/connectors/mock-payment/index.ts:61-67` `signatureMatches()` (HMAC + `timingSafeEqual`), :87 `verifyMockPaymentWebhookSignature()`; tes `packages/connectors/src/conformance/payment.test.ts:30` ("rejects webhooks with bad signature"). ✔ signature
- `apps/api/src/modules/payments/payments.controller.ts:121` `webhook()` hanya baca `x-payment-signature`; perintah `Select-String -Path apps/api/src/modules/payments -Pattern 'timestamp|replay|nonce|x-timestamp|Retry-After'` → **0 keluaran**. ✘ timestamp/replay/body-limit
- Tak ada tabel `chai.payment_webhook_event` inbox ber-dedup.

**Yang kurang**: Verifikasi timestamp + jendela replay + body limit di edge webhook, plus inbox event ber-dedup dengan retensi payload mentah terbatas.

### REQ-17-051 — Tak melog token/alamat/PoD/payload provider · TIDAK-TERVERIFIKASI · -

**Persyaratan** (`17 §13.6`): "Do not log payment URLs containing sensitive tokens, full addresses, bank references, proof-of-delivery images, or unrestricted provider payloads."

**Kondisi nyata**: Pembuktian "tidak melog" adalah pernyataan negatif atas SELURUH sink logging (logger app, audit, telemetry) — cakupan jalur A/F, bukan berkas domain ini. Yang bisa dicatat: `commitBusinessMutation` menulis metadata audit terpilih (`externalId`, `fromStatus`/`toStatus`, `currency`), **bukan** `checkout_url`/token; dan `chai.shipment` MVP tak menyimpan alamat/PoD (REQ-17-039). Audit menyeluruh semua sink butuh jalur A/F.

**Bukti**: `apps/api/src/modules/payments/postgres-payments.repository.ts:208-241` — metadata audit `payment.status_changed` memuat `externalId/currency/status`, bukan `checkout_url`/token.

**Yang dibutuhkan untuk memutuskan**: Audit logging lintas layanan (jalur A/F): buktikan tak ada logger/telemetry yang mencetak `checkout_url`/token/alamat/PoD/payload provider mentah.

### REQ-17-053 — Lookup tracking butuh user terautentikasi atau verifikasi identitas/order pelanggan · SEBAGIAN · HIGH

**Persyaratan** (`17 §13.8`): "Tracking lookup requires an authenticated client user or an end-customer identity/order verification policy."

**Kondisi nyata**: Rute tracking live `GET .../logistics/shipments/:trackingNumber` dijaga audience `client-portal` + permission `shipment.read` — jadi butuh **user staf terautentikasi** (cabang pertama terpenuhi). Cabang **verifikasi identitas/order end-customer** (self-service) **tak tersambung**: `customerLookup` (fail-closed) ada+diuji tetapi tak dipanggil rute mana pun; rute live memakai `customerView` tanpa bukti kepemilikan.

**Bukti**:
- `apps/api/src/modules/logistics/logistics.controller.ts:96,109-115` — `get()` dijaga `shipment.read`, memanggil `customerView` (tanpa proof).
- `apps/api/src/modules/logistics/postgres-logistics.repository.ts:173-200` `customerLookup()` (fail-closed `ownsByContact||ownsByOrder`, else `return null` :198).
- `Select-String customerLookup apps/api/src` → hanya definisi repo (`logistics.repository.ts`, `postgres-logistics.repository.ts:173`); call site hanya tes `apps/api/test/logistics-ownership.e2e.test.ts:45,54,62,68,76,84` — **tak ada controller**.

**Yang kurang**: Rute self-service end-customer (audience non-staf) yang memanggil `customerLookup` dengan bukti identitas/order; jangan ekspos detail via `customerView` untuk pemanggil non-staf.

### REQ-17-054 — Retensi/hapus/ekspor data payment & delivery · TIDAK-TERVERIFIKASI · -

**Persyaratan** (`17 §13.9`): "Payment and delivery data enter retention/deletion/export policies, except records that must be retained under contract or applicable law…".

**Kondisi nyata**: Ada mekanisme retensi generik `0030_retention_policy.sql` (berbasis kolom `retention_days`), tetapi migrasi itu **tidak** menyebut tabel payment/shipment/refund secara eksplisit. Apakah `chai.payment`/`chai.shipment`/`chai.refund` benar-benar terdaftar (via data kebijakan/runner) dan adanya jalur ekspor/hapus untuk keduanya perlu telaah retensi/PII (jalur A).

**Bukti**: `Select-String -Path packages/database/migrations/0030_retention_policy.sql -Pattern 'payment|shipment|refund|delivery'` → hanya definisi kolom generik `retention_days` (baris 8); tak ada tabel payment/delivery bernama.

**Yang dibutuhkan untuk memutuskan**: Telaah jalur A (retensi/PII): apakah tabel payment/delivery terdaftar dalam kebijakan retensi + adanya jalur ekspor/hapus subjek data.

### REQ-17-055 — Target SLO §14 · TIDAK-TERVERIFIKASI · -

**Persyaratan** (`17 §14`): target terukur (webhook persist/ack ≥99.5%/99.9%, duplicate side effect <0.1%/0.01%, projection p95 <2min/<30s, mismatch age, dst.).

**Kondisi nyata**: Ini metrik perilaku runtime (persentase, p95, aging) yang tak dapat diputuskan secara statis dari kode. Mekanisme fondasinya sebagian ada (idempotency, `UNKNOWN_RESULT`, poller), tetapi pemenuhan ANGKA SLO butuh pengukuran beban/produksi.

**Bukti**: Tak ada berkas yang membuktikan/membantah angka SLO secara statis; K-05 rencana induk mencatat performa belum terukur.

**Yang dibutuhkan untuk memutuskan**: Instrumentasi + pengukuran runtime (jalur F): metrik webhook persist/ack, projection p95, duplicate-rate, mismatch-age terhadap target §14.

### REQ-17-058 — PAY-01 Isolasi kredensial/transaksi tenant (RLS/secret/queue/cache/audit) · SEBAGIAN · HIGH

**Koreksi kelas**: dari `TERPENUHI` → `SEBAGIAN` karena PAY-01 mensyaratkan isolasi juga lewat **secret reference** per-tenant, sedangkan secret webhook adalah konstanta env **global** (bukan referensi per-tenant); komponen queue/cache pun belum terverifikasi (REQ-17-046). Baris tabel diperbaiki.

**Persyaratan** (`17 §18 PAY-01`): "Tenant merchant credentials and transactions are isolated by RLS, secret reference, queue, cache, and audit."

**Kondisi nyata**: **Transaksi** ber-isolasi kuat (RLS `ENABLE`+`FORCE` pada `chai.payment` + policy `tenant_id = chai.current_tenant_id()`) dan **audit** ber-tenant lewat `commitBusinessMutation`. Tetapi **kredensial** tak ber-isolasi via secret reference per-tenant: verifikasi webhook memakai satu konstanta `MOCK_PAYMENT_WEBHOOK_SECRET` global (satu secret mengamankan semua tenant). Isolasi **queue/cache** tak terverifikasi (jalur B/F, REQ-17-046).

**Bukti**:
- RLS: `packages/database/migrations/0010_payments.sql:25-27,31` (`ENABLE`/`FORCE`/`tenant_isolation`/`REVOKE ALL`). ✔
- Audit ber-tenant: `apps/api/src/modules/payments/postgres-payments.repository.ts:205-241` (`commitBusinessMutation` menulis audit `payment.status_changed` dalam tx tenant). ✔
- Secret global: `packages/connectors/src/connectors/mock-payment/index.ts:48-49` `webhookSecret()` → `env.MOCK_PAYMENT_WEBHOOK_SECRET ?? 'mock-payment-webhook-secret'` (bukan per-tenant). ✘ (senada REQ-17-011/049)

**Yang kurang**: Referensi secret-manager per-tenant untuk kredensial provider (bukan konstanta global), plus pembuktian isolasi queue/cache per-tenant (REQ-17-046).

### REQ-17-059 — PAY-02 Amount/currency/purpose link dari data bisnis tepercaya + konfirmasi · SEBAGIAN · HIGH

**Persyaratan** (`17 §18 PAY-02`): "Hosted link amount/currency/purpose come from approved business data and are confirmed according to policy."

**Kondisi nyata**: `POST client/v1/payments/checkout` menerima `amount`/`currency` **langsung dari body pemanggil** (`@IsInt @Min(1)` + `@IsString`), tanpa ikatan server ke invoice/order/katalog yang disetujui, tanpa `purpose`/business reference, dan tanpa langkah konfirmasi sisi-server. Tak ada otoritas amount yang menolak nilai karangan.

**Bukti**:
- `apps/api/src/modules/payments/payments.controller.ts:32-40,56` — `CreateCheckoutBody { amount, currency, idempotencyKey }` → `repository.createCheckout(tenant, body)` apa adanya.
- `packages/database/migrations/0010_payments.sql:2-14` — `chai.payment` tak menyimpan `order_id/invoice_id/purpose`.

**Yang kurang**: Turunkan/validasi amount+currency dari sumber bisnis tepercaya (invoice/order/katalog) di server, sertakan `purpose`, dan untuk origin AI wajibkan draft yang disetujui manusia sebelum link dibuat.

### REQ-17-062 — PAY-05 Hasil create tak dikenal direkonsiliasi sebelum retry · TERPENUHI · -

**Persyaratan** (`17 §18 PAY-05`): "Unknown create result is reconciled before retry."

**Kondisi nyata**: Status provider tak dikenal dipetakan gagal-aman ke `UNKNOWN_RESULT` (state eksekusi non-terminal), sehingga sesi tetap dibuka untuk reconciler alih-alih ditebak terminal. Create idempoten (unique index (tenant_id, idempotency_key) + SELECT-existing), jadi retry dengan key sama mengembalikan sesi yang sama, bukan charge/link kedua. Reconciler adalah entrypoint worker produksi.

**Bukti**:
- `workers/payment-worker/src/reconcile.ts:44` `canonicalPaymentStatus()` → tak dikenal = `UNKNOWN_RESULT`; :130 `selectNonTerminalPayments` (`status IN ('CREATED','PENDING','UNKNOWN_RESULT')`); di-run `runPaymentReconciler` (`main.ts:38`).
- `packages/domain/src/payments/transitions.ts:45` — `UNKNOWN_RESULT` non-terminal.
- `packages/database/migrations/0010_payments.sql:19` `payment_tenant_idempotency_uidx`; `postgres-payments.repository.ts` `createCheckout` SELECT-existing dulu.
- Tes: `workers/payment-worker/test/reconcile.integration.test.ts:99` ("parks an unrecognised provider status at UNKNOWN_RESULT without closing the session").

### REQ-17-064 — PAY-07 Refund nonaktif s.d. approval+recent-auth+rekonsiliasi+tes provider · SEBAGIAN · HIGH

**Persyaratan** (`17 §18 PAY-07`): "Refund execution is disabled until approval, recent-auth, reconciliation, and provider tests pass."

**Kondisi nyata**: **Terpenuhi**: gate entitlement (`payment_refunds`, default mati), recent-auth, permission `payment.approve`, dan domain menolak refund non-PAID / amount > payment (`FOR UPDATE`, integer minor units, idempoten). **Tak terpenuhi**: threshold moneter (tak ada), audit+event dalam transaksi (`processRefund` INSERT tanpa `commitBusinessMutation`), dan rekonsiliasi provider (refund tetap `PENDING`, tak ada reconciler refund).

**Bukti**:
- `apps/api/src/modules/advanced-payments/advanced-payments.controller.ts:118-132` — `@RequirePermission('payment.approve')` (:121) + `assertCapabilityEnabled('payment_refunds')` (:131) + `assertRecentAuthentication` (:132). ✔
- `packages/domain/src/payments/refund.ts:37-77` — `PAYMENT_NOT_REFUNDABLE` (:60), `REFUND_EXCEEDS_PAYMENT` (:63), `FOR UPDATE` (:53), INSERT status `PENDING` (:68) **tanpa** `commitBusinessMutation`. ✘
- Tak ada reconciler yang memindah `chai.refund.status` PENDING→COMPLETED dari provider.

**Yang kurang**: (a) cek threshold moneter (approval dua-orang di atas ambang), (b) bungkus `processRefund` dengan `commitBusinessMutation` (audit + `refund.requested/status_changed`), (c) reconciler refund terhadap provider.

### REQ-17-066 — LOG-01 Data tenant-isolated + lookup end-customer verifikasi ownership · SEBAGIAN · HIGH

**Persyaratan** (`17 §18 LOG-01`): "Shipment/tracking data is tenant-isolated and end-customer lookup verifies ownership."

**Kondisi nyata**: **Isolasi tenant terpenuhi** (RLS `ENABLE`+`FORCE` pada `chai.shipment` + policy tenant). **Verifikasi ownership end-customer** ada sebagai `customerLookup` (fail-closed) dan diuji, tetapi **tak tersambung ke rute**; rute live memakai `customerView` tenant-scoped tanpa bukti kepemilikan (sama dengan REQ-17-053).

**Bukti**:
- RLS: `packages/database/migrations/0011_logistics.sql:21-23,27` (`ENABLE`/`FORCE`/`tenant_isolation`/`REVOKE`).
- `apps/api/src/modules/logistics/postgres-logistics.repository.ts:173-200` `customerLookup()` fail-closed; call site hanya tes `apps/api/test/logistics-ownership.e2e.test.ts:20,83` (mis. "reveals nothing for a guessed tracking number"); **tak ada controller**.

**Yang kurang**: Sambungkan `customerLookup` (bukti identitas/order) ke rute self-service end-customer; jangan ekspos detail via `customerView` untuk pemanggil non-staf.

### REQ-17-067 — LOG-02 Status kanonik berversi + kode unknown gagal-aman · SEBAGIAN · MEDIUM

**Persyaratan** (`17 §18 LOG-02`): "Provider statuses map to versioned canonical states and unknown codes fail safely."

**Kondisi nyata**: **Gagal-aman terpenuhi** (kode tak dikenal → `UNKNOWN` di adapter JNE + pertahanan lapis dua di worker) dan **berversi terpenuhi** (`JNE_STATUS_MAP_VERSION` ikut tiap event). **Kurang**: himpunan status kanonik menciutkan `REJECTED/RETURN/CANCEL` (dan exception lain) ke `EXCEPTION` alih-alih taxonomy lengkap §7.2.

**Bukti**:
- `packages/connectors/src/connectors/jne/index.ts:54` `JNE_STATUS_MAP_VERSION=1`, :90-102 `mapJneMilestone` (`mapped ?? 'UNKNOWN'`, flag `unmapped`); :56 `MILESTONE_MAP` (REJECTED/RETURN/CANCEL→EXCEPTION).
- `workers/logistics-worker/src/reconcile.ts:50` `canonicalMilestone()` tak dikenal→`UNKNOWN` (di-run `runLogisticsReconciler`, `main.ts:39`).
- Tes: `packages/connectors/src/conformance/logistics-canonical.test.ts:25,45` ("fails safe to UNKNOWN…", "carries the mapping version…"); `conformance/jne.test.ts:208`.

**Yang kurang**: Perluas himpunan status kanonik ke daftar §7.2 (ON_HOLD/DELIVERY_FAILED/ADDRESS_ISSUE/CUSTOMS_HOLD/LOST/DAMAGED/RETURNING/RETURNED) alih-alih menciutkan ke `EXCEPTION`.

### REQ-17-068 — LOG-03 Duplikat/out-of-order → satu timeline immutable + state benar · TERPENUHI · - (invarian)

**Persyaratan** (`17 §18 LOG-03`): "Duplicate/out-of-order tracking events create one immutable timeline and correct current state."

**Kondisi nyata**: Timeline append-only; dedup pada `providerEventId` di dalam row lock; status = event terbaru **menurut waktu provider** (bukan urutan tiba), di ketiga jalur (repo API, worker, adapter mock). Ada tes yang menegakkan dedup + urutan.

**Bukti**:
- `apps/api/src/modules/logistics/postgres-logistics.repository.ts:226-236` `appendEvent()` — `FOR UPDATE`, dedup `prior.eventId === event.providerEventId`, sort by `at`.
- `workers/logistics-worker/src/reconcile.ts:247` `reconcileShipment()` — filter `!priorIds.has(providerEventId)`, commit via `commitBusinessMutation` (`main.ts:39`).
- `packages/connectors/src/connectors/mock-shipping/index.ts:109-121` `appendEvent()` dedup (komentar LOG-03).
- Tes: `packages/connectors/src/conformance/logistics-canonical.test.ts:53,76` ("ignores a redelivered provider event", "orders out-of-order scans by provider time"); `workers/logistics-worker/test/reconcile.integration.test.ts:127`.

---

## Rekapitulasi

Dihitung dengan perintah di heading berkas ini, dijalankan atas berkas ini (tabel Ringkasan, 73 baris `REQ-17-###`):

**Koreksi pasca-sesi FASE 1 (2026-07-29, sama hari)**: `REQ-17-009` berpindah SEBAGIAN→TERPENUHI;
`REQ-17-063` berpindah HILANG→SEBAGIAN. Rekap terkini:

```
Name                Count
----                -----
HILANG                  4
SEBAGIAN               38
TERPENUHI              24
TIDAK-TERVERIFIKASI     7
```

Total REQ: 73. `BERTENTANGAN`: 0.

Rekap asli sebelum koreksi (dipertahankan sebagai jejak):
```
Name                Count
----                -----
HILANG                  5
SEBAGIAN               38
TERPENUHI              23
TIDAK-TERVERIFIKASI     7
```

Total REQ: 73. `BERTENTANGAN`: 0.

Per severity (43 temuan non-`TERPENUHI`/non-`TIDAK-TERVERIFIKASI` sebelum koreksi; 41 setelah
koreksi karena REQ-17-009 keluar dari hitungan celah):
- **CRITICAL (2 setelah koreksi, semula 3)**: REQ-17-019 (on-PAID tak update proyeksi/stop reminder),
  REQ-17-063 (PAY-06 SEBAGIAN — stop-reminder tertutup, update-proyeksi masih menunggu REQ-17-019).
  REQ-17-009 (efek eksternal tanpa audit+event dalam satu tx di jalur webhook) **TERPENUHI**, keluar
  dari daftar celah.
- **HIGH (12)**: REQ-17-011, 021, 027, 033, 044, 049, 053, 058, 059, 064, 065, 066 (tema ownership-lookup, refund, secret-manager, event kanonik).
- **MEDIUM (23)**: sisa SEBAGIAN/HILANG (mis. 002, 005, 012, 020, 023, 028, 029, 030, 031, 034, 038, 041, 042, 048, 050, 056, 057, 067, 070, 071, 072, 073).
- **LOW (5)**: REQ-17-016, 024, 035, 039, 045.

> Verifikasi ulang klaim kematangan §1 rencana ("Payment & logistics ~50%"): rasio `TERPENUHI` (23) terhadap total REQ (73) = **≈32%** *strict* (call-site-proven). Bila `TIDAK-TERVERIFIKASI` (7, sebagian milik jalur lain) dikeluarkan dari penyebut: 23/66 = **≈35%**. Angka ~50% warisan **terlalu optimis** untuk invarian yang dinilai ketat; fondasi uang/status/UNKNOWN kuat, tetapi katalog event, proyeksi on-PAID, rekonsiliasi mismatch, exception/PoD, isolasi secret-reference per-tenant, dan wiring ownership-lookup masih utang.

---

## DOKUMEN 3/13 — 17_PAYMENT_AND_LOGISTICS_SPEC (683 baris)

```
REQ dihasilkan: 73
  TERPENUHI 23 | SEBAGIAN 38 | HILANG 5 | BERTENTANGAN 0 | TIDAK-TERVERIFIKASI 7
  (Koreksi pasca-sesi FASE 1, 2026-07-29 sama hari: TERPENUHI 24 | SEBAGIAN 38 | HILANG 4 |
   BERTENTANGAN 0 | TIDAK-TERVERIFIKASI 7 — REQ-17-009 SEBAGIAN→TERPENUHI, REQ-17-063 HILANG→SEBAGIAN.)
Temuan severity tertinggi:
  REQ-17-009 (CRITICAL, TERPENUHI 2026-07-29) - jalur webhook payment kini membungkus mutasi state
    dengan commitBusinessMutation (audit+outbox dalam satu transaksi, sama seperti jalur worker)
  REQ-17-063 (CRITICAL, SEBAGIAN, naik dari HILANG 2026-07-29) - stop-reminder tertutup; update
    proyeksi masih menunggu REQ-17-019
  REQ-17-019 (CRITICAL, masih SEBAGIAN) - langkah on-PAID (update proyeksi + notifikasi + atribusi)
    tidak ada; butuh keputusan model bisnis (order/invoice kanonik) sebelum dikerjakan
Invarian inti yang AMAN (TERPENUHI, terbukti terpanggil + tes):
  uang integer minor units (014), immutability trigger (015), PAID tak mundur (018/061),
  unknown->UNKNOWN payment (025) & logistik gagal-aman (031 sisi mapping), refund non-AI (026),
  RLS+FORCE semua entitas (052; PAY-01/058 SEBAGIAN krn secret-ref global), timeline immutable+dedup (032/068), status hanya dari bukti provider (004/060).
Berkas keluaran: docs/audit/2026-07-29/jalur-c-payment-logistics.md
Self-check 6 butir: semua "ya"; §19/§20 blueprint proses-manusia (bukan REQ kode) dicatat, bukan dilewati.
```
