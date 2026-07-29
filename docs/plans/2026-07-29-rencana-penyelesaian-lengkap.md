# Rencana penyelesaian lengkap Chai — berurut, siap dieksekusi

Ditulis 2026-07-29 setelah MASALAH-01 selesai. Dokumen ini menggantikan
`2026-07-29-daftar-masalah-untuk-agen-lanjutan.md` sebagai rencana kerja, dan
dokumen itu tetap berlaku sebagai penjelasan latar.

Urutan fase di sini **bukan** urutan severity di dokumen audit. Urutannya
disusun dari tiga kriteria, diterapkan berurutan:

1. **Risiko nyata pada jalur yang dilalui trafik.** Cacat pada kode yang benar
   -benar jalan di produksi lebih dulu daripada cacat pada fitur yang belum ada.
2. **Bebas hambatan.** Pekerjaan yang jawaban benarnya tunggal lebih dulu
   daripada pekerjaan yang menunggu keputusan produk.
3. **Daya angkat akar bersama.** Satu perbaikan yang menutup beberapa temuan
   sekaligus lebih dulu daripada perbaikan satu-satu.

Konsekuensi penting: **REQ-17-019 (MASALAH-02 lama) turun ke FASE 7**, bukan
karena severity-nya berubah, tetapi karena ia menunggu FASE 6 dan sebuah
keputusan produk. Alasan lengkap ada di FASE 7.

---

## Cara memakai dokumen ini

- Kerjakan **satu fase per sesi**. Jangan menggabungkan dua fase dalam satu commit.
- Di dalam satu fase, kerjakan **satu temuan per commit** kecuali ditulis lain.
- Sebelum menulis kode di sebuah fase, **verifikasi ulang blok "Kondisi
  terverifikasi"** pada fase itu. Baris bertanda `[klaim audit]` belum saya
  verifikasi ulang hari ini dan bisa kedaluwarsa — dua baris CRITICAL di dokumen
  audit pernah kedaluwarsa persis seperti itu.
- Setiap klaim selesai wajib disertai **keluaran perintah dan exit code literal**.
- Bila sebuah temuan ternyata sudah terpenuhi, **koreksi dokumen audit** dan
  sebutkan alasannya. Itu hasil yang diharapkan, bukan pelanggaran.

---

## Aturan keras (tidak berubah)

1. Tanpa `eslint-disable` dalam bentuk apa pun.
2. Tanpa `any`.
3. Tanpa non-null assertion `!`. Pakai `requireRow` atau pengecekan eksplisit.
4. Jangan pernah men-skip, mematikan, atau menghapus tes. Jumlah tes hanya boleh naik.
5. Jangan pernah menyunting migrasi yang sudah ada. **Migrasi baru mulai dari 0082**
   (terakhir dipakai: `0081_campaign_jsonb_repair.sql`).
6. Jangan melonggarkan guard atau invarian. RLS `ENABLE` + `FORCE`, role runtime
   `NOBYPASSRLS`, urutan guard Audience → Authorization → Entitlement.
7. Jangan menghapus repositori in-memory. Suite e2e bergantung padanya.
8. Tanpa dependensi baru tanpa alasan kuat dan versi yang dipin.
9. Uang selalu integer minor units plus kode mata uang.
10. `PAID` tidak pernah mundur; status terminal tetap terminal; kode provider tak
    dikenal menjadi `UNKNOWN_RESULT`.

### Lingkungan

- PowerShell di Windows. `&&` tidak valid sebagai pemisah; pakai `;`. Selalu echo
  `$LASTEXITCODE`.
- Suite integrasi butuh Docker (testcontainers). Nyalakan dengan
  `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"` lalu poll
  `docker ps`.
- Jebakan teknis (postgres-js jsonb, `audit_log.resource_id` uuid, strictness TS,
  batas impor, token provider string, UUIDv7, skrip `tsx` harus di paket
  `"type": "module"`, header `x-test-subject` hanya `APP_ENV` local/test, URL di
  belakang nginx, kredensial uji) — semuanya masih berlaku, baca
  `2026-07-29-daftar-masalah-untuk-agen-lanjutan.md` bagian "Jebakan teknis".
- Tambahan jebakan dari sesi MASALAH-01: untuk menulis kolom `jsonb` pakai
  `${tx.json(value as Parameters<typeof tx.json>[0])}::jsonb`. Untuk tipe tanpa
  index signature (`string[]`, interface spesifik seperti `FlowDefinition`,
  `StoredEvent[]`) perlu double-cast `as unknown as Parameters<...>[0]`.

---

## Baseline terverifikasi (akhir sesi MASALAH-01)

Semua angka di bawah hasil eksekusi, bukan klaim. Pakai ini sebagai pembanding;
jumlah tes tidak boleh turun dari sini.

| Gerbang | Perintah | Hasil |
|---|---|---|
| Lint | `pnpm run lint` | exit 0, 23/23 paket |
| Typecheck | `pnpm run typecheck` | exit 0, 23/23 paket |
| Build | `pnpm run build --force` | exit 0, 23/23 paket |
| Unit + boundary | `pnpm run test` | exit 0, 36/36 task |
| Integrasi database | `pnpm --filter @chai/database run test:integration` | exit 0, 12 berkas / 42 tes |
| Integrasi domain | `pnpm --filter @chai/domain run test:integration` | exit 0, 8 berkas / 51 tes |
| Integrasi api | `pnpm --filter @chai/api run test:integration` | exit 0, 35 berkas / 132 tes |
| E2e api | `pnpm --filter @chai/api run test:e2e` | exit 0, 26 berkas / 143 tes |
| Integrasi broker | `pnpm --filter @chai/broker run test:integration` | exit 0, 1 berkas / 9 tes |
| Integrasi automation-worker | `pnpm --filter @chai/worker-automation-worker run test:integration` | exit 0, 3 berkas / 6 tes |
| Integrasi payment-worker | `pnpm --filter @chai/worker-payment-worker run test:integration` | exit 0, 1 berkas / 3 tes |
| Integrasi logistics-worker | `pnpm --filter @chai/worker-logistics-worker run test:integration` | exit 0, 1 berkas / 3 tes |
| Integrasi outbox-dispatcher | `pnpm --filter @chai/worker-outbox-dispatcher run test:integration` | exit 0, 3 berkas / 7 tes |
| Config infra | `pnpm run verify:infra` | exit 0, 8/8 config valid |

Catatan flakiness yang sudah diketahui: `pnpm run test` pernah sekali exit 1 dengan
`MODULE_NOT_FOUND` pada native binding `rolldown` di `@chai/worker-channel-worker`
setelah `build --force` menghapus cache. Menjalankan ulang paket itu sendiri dan
`pnpm run test` penuh keduanya exit 0. Bila terjadi lagi: jalankan ulang, jangan
kejar sebagai regresi.

### Status MASALAH-01 — SELESAI

14 dari 16 berkas diperbaiki (penulis memakai `tx.json`, pembaca yang belum
defensif diberi `parseJson`), migrasi backfill `0072`–`0081`, tes bentuk jsonb
ditambahkan per tabel. Dua berkas diverifikasi **tidak perlu diubah**:
`apps/client-portal/src/app/api/realtime/conversations/route.ts` (payload dari
`realtimeBus` in-process, bukan DB) dan `packages/contracts/src/generate-json-schema.ts`
(menulis berkas ke disk). Bonus: bug SQL pre-existing `RETURNING * FROM ...` di
`packages/domain/src/advanced-logistics/eta.ts` diperbaiki — sebelumnya
`PostgresAdvancedLogisticsRepository.predictEta` tidak bisa dipanggil sama sekali.

**Utang dokumentasi yang harus ditutup di FASE 1**: dokumen audit masih menandai
MASALAH-01 sebagai celah terbuka, dan `REQ-17-009`/`REQ-17-063` masih tertulis
SEBAGIAN/HILANG padahal sudah TERPENUHI.

---

## FASE 1 — Isolasi tenant & tes yang tak pernah dijalankan

Fase terkecil dengan risiko tertinggi. Dua temuan, keduanya jawaban benarnya
tunggal, keduanya pada jalur hidup.

### 1.1 REQ-09-014 — sesi widget publik mengambil `tenantId` dari body (HIGH, release-blocking)

**Kondisi terverifikasi**: modul widget ada di
`apps/api/src/modules/widget/widget.controller.ts`,
`widget.repository.ts`, `postgres-widget.repository.ts`, `widget.module.ts`.
`[klaim audit]` `tenantId` diambil dari body pada rute sesi publik tanpa auth.

**Kenapa lebih dulu dari segalanya**: ini cacat isolasi tenant. README menyebut
isolasi tenant sebagai invarian yang pelanggarannya adalah bug rilis, jadi label
HIGH generiknya menyesatkan — perlakukan sebagai release-blocking.

**Langkah**:
1. Baca ketiga berkas widget dan rutenya. Tentukan persis nilai apa yang datang
   dari klien dan mana yang bisa diturunkan sisi server.
2. `tenantId` harus berasal dari sesuatu yang tidak bisa dipilih klien: token
   widget yang diterbitkan server (ditandatangani, berisi `tenantId`), atau
   pemetaan dari `origin`/`widgetKey` ke tenant di DB. **Jangan** dari body,
   header, atau query.
3. Bandingkan dengan pola yang sudah benar di
   `apps/client-portal/src/app/api/realtime/conversations/route.ts`
   (`tenantFromSession`) — di sana tenant diambil dari cookie terverifikasi dan
   komentarnya menyebut 10_SECURITY §6 / ADR-003. Ikuti semangat yang sama.
4. Migrasi baru bila perlu kolom `widget_key`/`allowed_origin` (mulai 0082).

**Definisi selesai**: ada tes integrasi yang membuktikan permintaan yang menamai
`tenantId` tenant lain di body **tidak** memperoleh data tenant itu, dan sesi
widget hanya bisa dibuat untuk tenant yang sah menurut kunci/origin-nya.

### 1.2 REQ-02-018 — suite isolasi tenant tak pernah dijalankan (HIGH, TIDAK-TERVERIFIKASI)

**Kondisi terverifikasi hari ini (bukan klaim)**: berkas
`tests/security/tenant-isolation.spec.ts`, `tests/security/rbac-enforcement.spec.ts`,
`tests/security/input-validation.spec.ts`, `tests/e2e/multi-tenant-isolation.spec.ts`
dan seluruh `tests/e2e/*.spec.ts` **tidak tercakup pola include mana pun**:

- `vitest.integration.config.ts` `include` hanya memuat
  `tests/integration|staging|load|chaos|pentest/**/*.test.ts`.
- `pnpm run test` = `vitest run tests && turbo run test`; pola default vitest
  mengambil `*.test.ts`, sehingga `*.spec.ts` terlewat.
- `pnpm run test:smoke` = `playwright test` (menyasar `tests/smoke`).

Jadi berkas-berkas itu yatim: tidak ada satu skrip pun yang menjalankannya.

**Langkah**:
1. Putuskan runner yang tepat per berkas: `tests/security/*.spec.ts` adalah tes
   API in-process (lihat `tests/security/input-validation.spec.ts` yang memanggil
   endpoint) → masukkan ke config vitest. `tests/e2e/*.spec.ts` yang memakai
   Playwright → masukkan ke config Playwright.
2. Tambahkan pola include, atau ganti nama berkas menjadi `*.test.ts` bila itu
   lebih jujur. **Jangan** menonaktifkan tes yang gagal saat pertama dijalankan —
   kegagalan pertama adalah informasi, bukan gangguan.
3. Jalankan, laporkan exit code dan jumlah tes. Perkirakan beberapa gagal:
   berkas ini kemungkinan mengasumsikan header `x-test-subject` (hanya berlaku
   `APP_ENV` local/test) atau server yang sudah berjalan.
4. Perbaiki apa yang gagal, atau catat sebagai temuan baru dengan bukti bila
   kegagalannya menyingkap cacat produk.
5. Ubah kelas REQ-02-018 di dokumen audit berdasarkan keluaran nyata.

**Definisi selesai**: `tests/security/**` berjalan lewat sebuah skrip npm,
exit code dilaporkan, dan kelas REQ-02-018 dikoreksi.

### 1.3 Koreksi dokumen audit (utang dari MASALAH-01)

Perbarui `docs/audit/2026-07-29/DAFTAR-CELAH-MASTER.md` dan
`docs/audit/2026-07-29/jalur-c-payment-logistics.md`:
`REQ-17-009` → TERPENUHI, `REQ-17-063` → TERPENUHI, dan tambahkan catatan bahwa
jsonb double-encode (MASALAH-01) sudah ditutup dengan migrasi 0072–0081.
Sertakan alasan dan bukti perintah.

---

## FASE 2 — Sesi dan otentikasi

Tiga temuan HIGH pada jalur login yang setiap pengguna lewati.

### 2.1 REQ-10-013 — store refresh token in-memory, gagal multi-replika (HIGH)

**Kondisi terverifikasi**: `apps/api/src/auth/refresh-token-store.ts` ada;
pendukungnya `apps/api/src/auth/session-tokens.ts`,
`apps/api/src/auth/login.controller.ts`, `packages/auth/src/session-cookies.ts`.
`[klaim audit]` store-nya in-memory sehingga rotasi + "reuse revokes family"
tidak bertahan lintas replika.

**Kenapa ini lebih dulu dari CSRF**: begitu API dijalankan dua replika (yang
memang rencananya), rotasi token diam-diam berhenti bekerja dan reuse detection
kehilangan riwayat. Ini kegagalan senyap, bukan kegagalan berisik.

**Langkah**: pindahkan famili token ke Postgres (tabel baru mulai 0082:
`tenant_id`/`user_id`, `family_id`, `token_hash`, `status`, `rotated_at`,
`reused_at`, RLS bila ber-tenant). Simpan **hash** token, jangan token mentah.
Pertahankan perilaku "reuse mencabut seluruh famili". Jangan hapus store
in-memory bila e2e bergantung padanya — gate-nya dengan pola
`useFactory` + `inject: [DATABASE]` seperti modul lain.

**Definisi selesai**: tes integrasi membuktikan (a) rotasi normal berhasil,
(b) memakai ulang token lama mencabut seluruh famili, (c) keputusan yang sama
diambil oleh instance repository kedua yang tidak berbagi memori.

### 2.2 REQ-10-012 — CSRF untuk mutasi cookie-auth (HILANG, HIGH)

**Kondisi terverifikasi**: sesi berbasis cookie ada (`SESSION_COOKIE_NAMES` di
`@chai/auth`, dipakai `apps/client-portal` dan owner-console).
`[klaim audit]` tidak ada proteksi CSRF untuk mutasi.

**Langkah**: pilih satu mekanisme dan terapkan di satu tempat, bukan per rute.
Double-submit cookie atau `SameSite=Strict` + token per-sesi. Periksa dulu nilai
`SameSite` yang sedang dipakai di `packages/auth/src/session-cookies.ts` — bila
sudah `Strict`, sebagian risiko sudah tertutup dan pekerjaannya menyempit.

**Definisi selesai**: tes yang mengirim mutasi lintas-origin tanpa token CSRF
ditolak, dan mutasi normal dari portal tetap lolos.

### 2.3 REQ-10-005 — recent-auth hanya di 2 rute (HIGH)

**Kondisi terverifikasi**: guard ada di `apps/api/src/guards/high-risk.ts`.
`[klaim audit]` baru dipakai 2 rute.

**Langkah**: inventarisasi aksi sensitif (hapus tenant/anggota, rotasi secret,
refund, ubah pembayaran, ekspor data). Terapkan guard di semuanya. Karena
guard-nya sudah ada, ini pekerjaan penempatan, bukan pembuatan.

**Definisi selesai**: daftar rute sensitif ada di kode (bukan di kepala), setiap
rute di daftar itu memakai guard, dan ada tes yang membuktikan rute tanpa
recent-auth ditolak.

---

## FASE 3 — Verifikasi webhook

Tiga temuan berakar sama: signature sudah ada, **timestamp dan jendela replay
tidak ada**.

### Temuan: REQ-10-016, REQ-09-006, REQ-09-023

**Kondisi terverifikasi**: verifier signature nyata ada di
`packages/connectors/src/connectors/mock-payment/index.ts`
(`verifyMockPaymentWebhookSignature`, HMAC + `timingSafeEqual`) dan dipakai
`applyWebhook` di `apps/api/src/modules/payments/postgres-payments.repository.ts`.
`[klaim audit]`: verifikasi timestamp/replay window tidak ada; JNE tanpa
signature; verifier Midtrans riil tidak ter-wire.

**Langkah**:
1. Tambahkan verifikasi timestamp + jendela replay **di satu helper bersama** di
   `packages/connectors`, lalu pakai dari semua verifier. Jangan menyalin per
   provider — grep seluruh pemanggil verifier dan perbaiki di akar.
2. Tabel dedup event webhook (mulai 0082) sesuai blueprint `05 §11.7`
   (`payment_webhook_event`): provider account, external event id, versi kunci
   signature, waktu provider, hasil verifikasi, referensi/hash payload, hasil
   proses. Unik per tenant + provider account + external id.
3. Body limit pada rute webhook.
4. Wire verifier Midtrans riil; JNE butuh keputusan: bila provider memang tak
   menyediakan signature, tulis mitigasi eksplisit (allowlist IP + rekonsiliasi
   wajib) dan komentari alasannya, jangan diam-diam menerima.

**Definisi selesai**: tes membuktikan webhook dengan timestamp kedaluwarsa
ditolak, webhook yang diulang dalam jendela tidak diproses dua kali, dan payload
melebihi batas ditolak sebelum diparse.

---

## FASE 4 — Policy engine tersambung ke runtime

Ini menyentuh invarian README: "Policy engine adalah satu-satunya pemberi izin
efek samping tool AI." Logikanya ada, sambungannya tidak.

### Temuan: REQ-08-008, REQ-08-021, REQ-09-034

**Kondisi terverifikasi**: `apps/api/src/modules/actions/action-policy.ts` +
`action-policy.test.ts` (10 tes, lulus) + `actions.controller.ts`;
`packages/domain/src/ai-policy/tool-policy.ts`;
`packages/connectors/src/kill-switch.ts` + `__tests__/kill-switch.test.ts`.
`[klaim audit]`: ketiganya ada tetapi tidak ter-wire ke jalur produksi.

**Langkah**:
1. Lacak jalur eksekusi tool AI sungguhan dari `services/ai-gateway` sampai efek
   sampingnya. Buktikan dengan grep di mana keputusan izin *seharusnya* diminta
   dan tunjukkan bahwa hari ini tidak diminta.
2. Sisipkan policy engine sebagai satu-satunya gerbang. Tool tak dikenal
   **ditolak**, bukan dianggap aman.
3. Kontrak eksekusi 12 langkah + `ActionRequest` idempoten + audit (REQ-08-021):
   pakai `commitBusinessMutation` supaya mutasi + audit + event satu transaksi.
4. Kill switch konektor: sambungkan `packages/connectors/src/kill-switch.ts` ke
   jalur produksi. Catat bahwa kill switch payment/logistics saat ini adalah
   circuit breaker in-process (ada komentar `ponytail:` di
   `postgres-logistics.repository.ts`) — tidak bertahan restart dan tidak
   lintas-replika. Bila diangkat ke state durable, itu migrasi baru.

**Definisi selesai**: tes membuktikan tool yang tidak diizinkan policy **tidak**
menghasilkan efek samping, tool tak dikenal ditolak, dan kill switch aktif
menghentikan konektor pada jalur produksi (bukan hanya di unit test helper).

---

## FASE 5 — Rahasia dan kredensial

Tujuh temuan HIGH satu tema. Kerjakan sebagai satu fase karena akarnya sama.

### Temuan: REQ-10-022, REQ-05-003, REQ-17-011, REQ-17-049, REQ-17-058, REQ-09-029, REQ-04-010

**Kondisi terverifikasi**: secret manager **sudah ada** di
`packages/domain/src/secret-management/manager.ts` (+ `manager.test.ts`), dan
`apps/api/src/modules/connector-config/postgres-connector-config.repository.ts`
menyentuh `secretRef`. Jadi ini kemungkinan besar pekerjaan **menyambungkan dan
menegakkan**, bukan membangun dari nol — verifikasi ulang dulu sebelum
memperlakukannya sebagai pekerjaan besar.

**Langkah**:
1. Verifikasi apa yang benar-benar tersimpan di kolom secret konektor hari ini
   (query nyata di suite integrasi: apakah plaintext?). Ini menentukan apakah
   REQ-10-022 "SEBAGIAN" atau lebih buruk.
2. Semua secret lewat `secret-management/manager.ts`; kolom DB hanya menyimpan
   **referensi + versi kunci**, tidak pernah plaintext.
3. Secret webhook harus **per-tenant**, bukan global (REQ-17-058). Ini juga
   menutup sebagian REQ-17-011.
4. Rotasi teraudit: setiap rotasi menulis baris audit lewat `appendAuditEntry`.
5. REQ-04-010 (frontend): `SecretInput` tidak boleh bisa reveal setelah simpan.
   Ini perbaikan UI kecil dan berdiri sendiri — boleh commit terpisah.

**Definisi selesai**: tes integrasi membuktikan tidak ada plaintext secret di
tabel konektor, rotasi menghasilkan baris audit, dan dua tenant tidak berbagi
secret webhook.

---

## FASE 6 — Sumber amount tepercaya (prasyarat FASE 7)

Fase ini yang membuat FASE 7 mungkin dikerjakan tanpa mengarang.

### Temuan: REQ-17-021, REQ-17-059, REQ-08-023, REQ-08-039, REQ-08-040

**Kondisi terverifikasi hari ini (bukan klaim)**:
`apps/api/src/modules/payments/payments.controller.ts` mendefinisikan
`CreateCheckoutBody { amount: @IsInt @Min(1); currency: @IsString; idempotencyKey: @IsString }`
lalu memanggil `this.repository.createCheckout(tenantScope(request), body)` apa
adanya. Tidak ada otoritas amount sisi server. Ini satu-satunya pintu produksi
pembayaran; tidak ada pemanggil lain di luar tes.

**Kenapa ini release-blocking secara nyata**: siapa pun yang bisa mencapai
endpoint itu — termasuk agen AI — menentukan harga sendiri. Blueprint `17 §6.5`
/ AC PAY-02 mewajibkan amount diturunkan dari invoice/order/katalog yang
disetujui atau draft yang disetujui manusia.

**Langkah**:
1. Putuskan **sumber otoritas amount**. Ini keputusan produk minimal yang tidak
   bisa dihindari. Opsi paling ringan yang tetap memenuhi spek: tabel
   `chai.price_catalog`/`service_item` per tenant (mulai 0082) berisi
   `amount_minor` + `currency` + `status`, dan checkout merujuk item itu, bukan
   mengirim angka.
2. Ubah kontrak endpoint: terima referensi item + kuantitas, **bukan** `amount`.
   Server menghitung dan menolak selisih.
3. Untuk asal AI: wajibkan draft yang disetujui manusia sebelum link dibuat
   (REQ-08-039). Uang/alamat/kurir tidak pernah dari teks model bebas
   (REQ-08-023) — tegakkan di jalur tool AI yang sudah digerbangi FASE 4.
4. REQ-08-040 (AI tak bocorkan shipment pelanggan lain dari tracking tebakan)
   bersinggungan dengan FASE 10; boleh dikerjakan di sini bila jalurnya sama.

**Definisi selesai**: tes membuktikan checkout dengan amount karangan ditolak,
amount yang tersimpan sama dengan amount katalog, dan permintaan asal AI tanpa
persetujuan manusia tidak menghasilkan link pembayaran.

**Efek samping yang diharapkan**: begitu checkout merujuk item bisnis, referensi
bisnis lahir dengan sendirinya. Itulah pintu masuk FASE 7 dan sekaligus menutup
REQ-17-024 (business reference dalam kunci idempotensi).

---

## FASE 7 — REQ-17-019: on-PAID lengkap (bekas MASALAH-02)

**Butuh keputusan produk sebelum menulis kode. Jangan mulai tanpa itu.**

### Persyaratan
`17 §6.3` langkah 9: "On `PAID`, the platform updates linked booking/order/invoice
projection, stops applicable reminders, notifies parties, and records attribution."

### Kondisi terverifikasi hari ini (bukan klaim)

Sudah beres:
- `applyWebhook` (`apps/api/src/modules/payments/postgres-payments.repository.ts`)
  dan `applyReconciliation` (`workers/payment-worker/src/reconcile.ts`) **keduanya**
  memakai `commitBusinessMutation`, memanggil `stopPaymentReminders`, dan
  meng-emit `payment.<status>` dengan nama event yang seragam.

Belum beres, dan alasannya struktural:
- `chai.payment` (`0010_payments.sql`, ditambah `status_event_at` di
  `0043_payment_integrity.sql`) **tidak punya kolom referensi bisnis apa pun**.
- **Tidak ada tabel `order`, `invoice`, maupun booking komersial** di skema. Yang
  ada `chai.lead` (prospek, tanpa harga) dan `chai.appointment` (jadwal, tanpa
  harga) di `0007_leads_and_appointments.sql`.
- **Tidak ada kode produksi yang membuat reminder pembayaran.** Kunci
  `paymentExternalId` yang dicari `stopPaymentReminders` hanya muncul di
  `packages/domain/src/payments/reminders.ts` sendiri dan di berkas tes. Reminder
  dibuat lewat endpoint automation generik dengan payload sembarang
  (`apps/api/src/modules/automation/automation.service.ts`). Artinya separuh yang
  dokumen lama nyatakan "sudah selesai" benar dan teruji, tetapi **di produksi
  tidak punya apa pun untuk dibatalkan**.
- **Tidak ada consumer produksi untuk `payment.*`.** Nol match di luar tes,
  termasuk nol consumer stream Redis `chai:outbox:payment.*`.
- Blueprint `05 §11.6` mendefinisikan model normatif yang jauh lebih besar:
  `payment_request` (dengan referensi *jamak opsional*
  `contact/conversation/lead/appointment/order/invoice`), `payment_attempt`,
  `payment_transaction`, `payment_reconciliation`. Implementasi hari ini satu
  tabel datar. Diagram ER-nya: `ORDER ||--o{ PAYMENT_REQUEST : funds`.
- Trigger `chai.payment_money_is_immutable` (`0043`) mengunci `amount_cents`,
  `currency`, `external_id` pada UPDATE. Kolom baru tidak terkena, tetapi sadari
  trigger ini ada saat menulis ulang baris payment.

### Keputusan yang harus diambil pemilik produk

1. **Entitas bisnis apa yang dibayar?** Pilihan:
   - (a) Buat `chai.order` (+ `order_item`) dan `chai.invoice` sesuai
     `05 §11.3`/`§11.4`. Paling sesuai blueprint, paling banyak kerja.
   - (b) Tautan opsional polymorphic ke entitas yang sudah ada
     (`appointment`/`lead`) lewat `resource_type` + `resource_id`. Lebih ringan,
     tetapi "proyeksi" yang di-update harus didefinisikan (mis. `appointment`
     dapat kolom `payment_status`).
   - (c) Bila FASE 6 sudah membuat katalog/`service_item`, referensi bisnis bisa
     berupa item katalog + kuantitas, dan proyeksinya adalah baris pesanan yang
     lahir dari checkout itu.
2. **Referensi masuk sebagai kolom di `chai.payment` atau tabel penghubung?**
   Blueprint memakai referensi jamak di `payment_request`, yang mengarah ke
   kolom-kolom nullable pada satu baris, bukan tabel penghubung.
3. **Notifikasi lewat jalur mana?** `apps/api/src/modules/notification/*` sudah
   ada (`NotificationRepository.createNotification`, `postgres-notification.repository.ts`)
   tetapi belum pernah dipanggil dari jalur payment. Cukup in-app ke pemilik
   tenant, atau juga ke `contact` lewat channel?
4. **Atribusi berarti apa?** Grep `payment.*attribution` nol keluaran. Perlu
   definisi: dimensi apa yang dicatat (kanal, kampanye, agen, percakapan) dan ke
   tabel mana.

### Langkah setelah keputusan turun

1. Migrasi (mulai 0082): kolom/tabel referensi bisnis sesuai keputusan.
2. Ubah `stopPaymentReminders` dari cocok-payload menjadi **join sungguhan**.
   Jalur upgrade sudah dicatat di komentar `ponytail:` fungsinya: tambahkan
   `payment_id uuid REFERENCES chai.payment(id)` pada `chai.follow_up_job`, lalu
   predikat itu menjadi join. Pertahankan backstop `status = 'PENDING'`.
3. Bangun **produsen** reminder pembayaran (tanpa ini, langkah 2 tetap jalur
   mati): saat checkout dibuat, jadwalkan follow-up yang tertaut ke `payment_id`.
4. Consumer on-PAID di satu tempat. Karena kedua produsen status sudah memanggil
   satu helper bersama, efek hilir baru cukup ditambahkan sekali. Isinya:
   update proyeksi, notifikasi, atribusi. Semuanya di dalam transaksi yang sama
   lewat `commitBusinessMutation`.
5. Sertakan business reference dalam kunci idempotensi (REQ-17-024).

**Definisi selesai**: tes integrasi end-to-end membuktikan satu webhook `PAID`
menghasilkan, dalam satu transaksi: status berubah, baris audit, event
`payment.paid`, reminder tertaut dibatalkan **tepat sekali**, proyeksi bisnis
ter-update, notifikasi tercatat, atribusi tercatat. Dan webhook `PAID` kedua yang
diulang tidak menghasilkan efek kedua.

---

## FASE 8 — Refund dan operasional mismatch

### Temuan: REQ-17-027, REQ-17-064, REQ-17-065

**Kondisi terverifikasi**: logika refund ada di
`packages/domain/src/payments/refund.ts`,
`apps/api/src/modules/advanced-payments/{advanced-payments.repository.ts,postgres-advanced-payments.repository.ts,advanced-payments.controller.ts}`,
dengan tes `apps/api/test/integration/advanced-payments.integration.test.ts`.
`[klaim audit]`: refund belum di balik approval + recent-auth + rekonsiliasi
provider; REQ-17-064 mewajibkan refund **nonaktif** sampai semua itu ada.

**Langkah**:
1. Sampai gerbangnya lengkap, pastikan refund benar-benar tidak bisa dieksekusi
   di produksi (entitlement + stage gate mati secara default — sesuai invarian
   "kapabilitas modul default mati").
2. Pasang approval + recent-auth (guard dari FASE 2.3) + threshold + audit.
3. Rekonsiliasi provider untuk refund, memakai pola `UNKNOWN_RESULT` yang sudah
   ada di `packages/domain/src/payments/transitions.ts`.
4. REQ-17-065: mismatch produksi butuh alert + owner + aging + runbook + audit.
   Tabel `payment_reconciliation` di blueprint `05 §11.7` adalah acuannya.

**Definisi selesai**: refund tanpa approval/recent-auth ditolak oleh tes;
mismatch menghasilkan baris yang bisa di-aging dan punya owner; runbook ada di
`docs/` dan pernah dijalankan sekali.

---

## FASE 9 — Event kanonik dan consumer produksi

### Temuan: REQ-17-044, REQ-06-010

**Kondisi terverifikasi**: jalur webhook payment **sudah** meng-emit
`payment.<status>`, dan worker rekonsiliasi juga. Tetapi tidak ada consumer
produksi (nol match `chai:outbox:payment.*`). Infrastrukturnya siap:
`packages/broker/src/outbox-stream.ts` (`encodeOutboxFields`/`decodeOutboxMessage`,
sudah benar), dispatcher `packages/domain/src/outbox/dispatcher.ts`, worker
`workers/outbox-dispatcher`.

**Langkah**:
1. Inventarisasi event `payment.*`/`shipment.*` yang blueprint minta versus yang
   benar-benar di-emit hari ini. Verifikasi ulang — sebagian sudah ada sejak
   perbaikan terakhir, jadi jangan menulis ulang yang sudah jalan.
2. Tambahkan event yang benar-benar hilang.
3. Bangun **satu** consumer produksi end-to-end sebagai bukti jalur hidup
   (kandidat paling berguna: consumer notifikasi dari FASE 7).

**Definisi selesai**: tes integrasi membuktikan event yang diproduksi API/worker
sampai ke consumer produksi lewat Redis Streams, dan consumer melakukan
deduplikasi berdasarkan event id.

---

## FASE 10 — Sisa kebocoran lintas-tenant / ownership

### Temuan: REQ-17-033, REQ-17-053, REQ-17-066, REQ-09-026

**Kondisi terverifikasi**: verifikasi ownership sudah ada dan benar di
`apps/api/src/modules/logistics/postgres-logistics.repository.ts`
(`customerLookup` gagal-tertutup: tanpa bukti `contactId`/`orderReference`
mengembalikan `null` dengan komentar ADR-027), dan ada e2e
`apps/api/test/logistics-ownership.e2e.test.ts` (6 tes).
`[klaim audit]`: logikanya ada tetapi **tidak tersambung ke rute** (REQ-17-033),
dan REQ-09-026 masih TIDAK-TERVERIFIKASI.

**Langkah**: buktikan lewat tes tingkat rute (bukan repository) bahwa lookup
pelanggan/tracking di HTTP benar-benar menuntut bukti ownership. Bila sudah
tersambung, koreksi kelas temuannya dengan bukti. Bila belum, sambungkan.

**Definisi selesai**: tes tingkat rute membuktikan nomor resi tebakan tidak
mengungkapkan keberadaan pengiriman, untuk semua rute yang mengekspos tracking.

---

## FASE 11 — Perbaikan berdiri sendiri

Boleh dikerjakan kapan saja; ditaruh di sini agar tidak menghalangi jalur kritis.

### 11.1 REQ-03-035 — BERTENTANGAN (HIGH)
Aksi destruktif satu-klik tanpa konfirmasi, padahal blueprint mewajibkan pola
konfirmasi sesuai tingkat risiko. Kelas BERTENTANGAN berarti kode aktif melawan
spesifikasi. Perbaikan kecil, dampak nyata. Cari tombol destruktif di
`apps/client-portal` dan `apps/owner-console`, tambahkan konfirmasi berjenjang
(ketik nama untuk aksi paling berbahaya).

### 11.2 REQ-10-019 — malware scan (HILANG, HIGH)
**Kondisi terverifikasi**: `scan_status` ada di
`apps/api/src/modules/attachment/postgres-attachment.repository.ts` dan
`attachment.repository.ts`, dengan tes di `apps/api/test/attachment.test.ts` dan
`test/integration/attachment.integration.test.ts`. `[klaim audit]` kolomnya tak
pernah diisi. Minimal yang jujur: pipeline scan yang benar-benar mengisi status,
dan berkas dengan status belum-bersih **tidak bisa diunduh**. Bila scanner nyata
belum tersedia, jangan berpura-pura: default ke "tidak bisa diunduh" dan tandai
`ponytail:` dengan jalur upgrade.

### 11.3 REQ-08-018 — grounded answer untuk klaim tenant-spesifik
Kebijakan jawaban ter-grounding. Bersinggungan dengan FASE 4 dan 6.

### 11.4 REQ-05-002 — owner `x-tenant-id` perlu ADR
Bukan pekerjaan kode, tetapi keputusan tertulis: apakah owner-console boleh
memilih tenant lewat header, dan dengan penjagaan apa. Tulis ADR-nya.

---

## FASE 12 — Menutup temuan TIDAK-TERVERIFIKASI

18 butir di `DAFTAR-CELAH-MASTER.md` §4. Menutup butir TIV berarti
**menjalankan sesuatu**, lalu mengubah kelasnya berdasarkan keluaran nyata.

- `REQ-02-018` sudah ditangani di FASE 1.2.
- `REQ-09-026` sudah ditangani di FASE 10.
- `REQ-02-023` — sertifikasi provider payment/shipment + kill switch + runbook
  teruji. Bergantung FASE 4 (kill switch ter-wire) dan FASE 8 (runbook).
- `REQ-07-016` — workflow data-deletion & export durable.
- `REQ-02-013` — setiap query vektor menyertakan predikat tenant; versi embedding
  eksplisit.
- Sisanya: baca §4, jalankan, laporkan.

---

## FASE 13 — CI (MASALAH-03, terblokir pemilik repo)

`git remote -v` kosong, jadi `.github/workflows/ci.yml` belum pernah jalan.
Isi workflow-nya sudah benar secara statis (`branches: [main, master]`; langkah
lint/typecheck/build/test/verify:infra + empat suite integrasi).

**Terblokir pada**: akun/URL remote dari pemilik repo. Tidak ada yang bisa
dikerjakan agen di sini selain menunggu.

Saat pertama kali jalan, perkirakan **merah karena lingkungan, bukan kode**:
akhiran baris CRLF/LF, sensitivitas huruf pada path impor di Linux, dan
ketersediaan Docker untuk testcontainers di runner. Perlakukan percobaan pertama
sebagai kalibrasi.

Bila pemilik repo menambahkan remote di tengah rencana ini, naikkan FASE 13 ke
prioritas tertinggi: tanpa CI, semua hasil hijau hanya berlaku di satu mesin
Windows.

---

## FASE 14 — Utang yang diketahui (MASALAH-07)

Bukan bug; kerjakan setelah fase di atas atau saat menyentuh area terkait.

- **PITR memakai `pg_dump`, bukan `pg_basebackup`.** WAL archiving sudah aktif dan
  terbukti; basis restore tekstual yang benar tetap `pg_basebackup`.
- **Healthcheck worker hanya liveness** (`pgrep`), tidak membuktikan worker
  memproses pekerjaan.
- **Lima modul masih persist di skema `public`**, bukan `chai`.
- **`AuditMiddleware` tidak ter-wire** — nol call site, hanya definisinya di
  `audit.middleware.ts`. Aman karena body sudah diredaksi, tetapi tidak
  melakukan apa pun. Putuskan: sambungkan atau hapus.
- **Cakupan performa hanya 3 endpoint baca.** Baseline di
  `docs/testing/2026-07-28-baseline-performa.md`. Target blueprint "1000
  conversations" belum pernah diuji.
- **Paritas staging vs produksi**: staging kehilangan 11 service dan tidak
  me-mount `postgres.conf`. Mitigasi yang dipilih adalah `pnpm run verify:infra`
  — pertahankan skrip itu.
- **Katalog kolom `05_DATA_MODEL` §4–§13 dilewati Jalur A** dengan alasan "skema,
  bukan normatif". Sesi MASALAH-02 membuktikan itu menyembunyikan batasan nyata:
  §11.6 mendefinisikan `payment_request`/`payment_attempt`/`payment_transaction`
  yang sama sekali tidak ada di implementasi. **Audit ulang §4–§13 layak
  dijadikan pekerjaan tersendiri**, dan hasilnya mungkin memunculkan temuan baru
  berkelas HILANG.
- **39 rujukan di dokumen audit dikutip sebagai nama berkas polos.** Semuanya
  menunjuk berkas nyata (nol fabrikasi), tetapi gaya kutipannya kurang presisi.

---

## Ringkasan urutan

| Fase | Isi | Temuan | Hambatan |
|---|---|---|---|
| 1 | Isolasi tenant widget, suite tes yatim, koreksi audit | REQ-09-014, REQ-02-018 | tidak ada |
| 2 | Refresh token durable, CSRF, recent-auth | REQ-10-013, 10-012, 10-005 | tidak ada |
| 3 | Timestamp + replay window webhook | REQ-10-016, 09-006, 09-023 | keputusan JNE tanpa signature |
| 4 | Policy engine + kill switch ter-wire | REQ-08-008, 08-021, 09-034 | tidak ada |
| 5 | Secret manager, per-tenant, rotasi teraudit | REQ-10-022, 05-003, 17-011, 17-049, 17-058, 09-029, 04-010 | tidak ada |
| 6 | Otoritas amount sisi server | REQ-17-021, 17-059, 08-023, 08-039, 08-040 | keputusan sumber amount |
| 7 | on-PAID lengkap | REQ-17-019, 17-024 | **keputusan model bisnis** |
| 8 | Refund + mismatch ops | REQ-17-027, 17-064, 17-065 | tidak ada |
| 9 | Event kanonik + consumer produksi | REQ-17-044, 06-010 | tidak ada |
| 10 | Ownership lookup di tingkat rute | REQ-17-033, 17-053, 17-066, 09-026 | tidak ada |
| 11 | Konfirmasi destruktif, malware scan, grounded, ADR tenant header | REQ-03-035, 10-019, 08-018, 05-002 | tidak ada |
| 12 | Menutup 18 butir TIV | §4 daftar master | butuh eksekusi |
| 13 | CI | MASALAH-03 | **pemilik repo** |
| 14 | Utang diketahui | MASALAH-07 | tidak ada |

## Jangan lakukan

- Jangan menyunting migrasi yang sudah ada; migrasi baru mulai **0082**.
- Jangan menghapus atau menonaktifkan tes untuk membuat gerbang hijau.
- Jangan mengerjakan FASE 7 sebelum keputusan model bisnis turun, dan jangan
  mengarang proyeksi `order`/`invoice` yang belum diputuskan.
- Jangan mengulang MASALAH-01, `REQ-17-009`, atau `REQ-17-063` — semuanya sudah
  TERPENUHI.
- Jangan melaporkan pekerjaan selesai tanpa keluaran perintah yang
  membuktikannya.

## Rujukan

- `docs/plans/2026-07-29-daftar-masalah-untuk-agen-lanjutan.md` — latar, jebakan
  teknis lengkap, kredensial uji.
- `docs/audit/2026-07-29/DAFTAR-CELAH-MASTER.md` — 309 temuan, definitif. §1.2
  daftar HIGH, §4 daftar TIV.
- `docs/audit/2026-07-29/jalur-c-payment-logistics.md` — bukti per temuan payment
  dan logistik, termasuk teks persyaratan REQ-17-019.
- `Omnichannel_AI_Platform_Engineering_Blueprint_v1.2/05_DATA_MODEL_AND_TENANCY.md`
  — §11.3 order/order_item, §11.4 invoice, §11.6 payment_request/attempt/transaction,
  §11.7 webhook_event/reconciliation/refund_request.
- `README.md` bagian "Invarian" — pelanggarannya adalah bug rilis.
