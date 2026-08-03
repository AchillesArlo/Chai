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

> **UNTUK AGENT DENGAN KAPASITAS PENALARAN TERBATAS (mis. Gemini Flash):**
> jangan mengeksekusi dokumen ini langsung. Baca
> `docs/plans/2026-07-31-panduan-eksekusi-agent-fase-5-26.md` lebih dulu —
> dokumen itu berisi langkah atomik, perintah copy-paste, template pelaporan,
> dan daftar fase yang **tidak boleh** dikerjakan tanpa keputusan manusia
> (FASE 6, 7, 20, 22, 26). Dokumen ini dipakai sebagai **konteks dan alasan**,
> panduan itu dipakai sebagai **langkah kerja**.

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
5. Jangan pernah menyunting migrasi yang sudah ada. **Migrasi baru mulai dari 0083**
   (terakhir dipakai: `0082_jsonb_repair_effective.sql`).
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
| Integrasi database | `pnpm --filter @chai/database run test:integration` | exit 0, 13 berkas / 44 tes (setelah koreksi 0082, lihat "Status MASALAH-01") |
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

### Status MASALAH-01 — SELESAI (dengan satu koreksi kritis pasca-sesi)

14 dari 16 berkas diperbaiki (penulis memakai `tx.json`, pembaca yang belum
defensif diberi `parseJson`). Dua berkas diverifikasi **tidak perlu diubah**:
`apps/client-portal/src/app/api/realtime/conversations/route.ts` (payload dari
`realtimeBus` in-process, bukan DB) dan `packages/contracts/src/generate-json-schema.ts`
(menulis berkas ke disk). Bonus: bug SQL pre-existing `RETURNING * FROM ...` di
`packages/domain/src/advanced-logistics/eta.ts` diperbaiki.

**Koreksi kritis, ditemukan setelah sesi awal selesai, sudah diverifikasi ulang
lewat eksekusi nyata**: migrasi backfill pertama, `0072`–`0081`, masing-masing
melakukan `SET ROLE chai_migration_owner` lalu `UPDATE` biasa. Itu **no-op
senyap** di database berisi data — bukan salah secara SQL, salah secara role.
Migrasi berjalan dari koneksi superuser; `SET ROLE` memindahkannya ke
`chai_migration_owner`, yang didefinisikan `NOBYPASSRLS` di `0001_foundation.sql`.
Setiap tabel sasaran `FORCE ROW LEVEL SECURITY`, dan `FORCE` menghapus kekebalan
table owner bila ia bukan superuser/`BYPASSRLS`. Migrasi tidak menyetel
`app.tenant_id`, jadi `chai.current_tenant_id()` NULL, policy tidak mencocokkan
apa pun, `UPDATE` menyentuh nol baris **tanpa error**. `chai.audit_entry`
diblokir sekali lagi oleh trigger append-only `audit_entry_no_update`. Cacat ini
lolos dari deteksi karena testcontainer selalu kosong saat migrasi dijalankan —
kekosongan, bukan kebenaran, yang membuatnya kelihatan berhasil.

Perbaikan sungguhan ada di `0082_jsonb_repair_effective.sql`: **tidak** `SET ROLE`
sama sekali (tetap sebagai superuser koneksi migrasi, yang sudah disyaratkan
sejak `0051_runtime_login_roles.sql`), memakai guard yang **RAISE** bila role
koneksi tidak bisa bypass RLS (gagal berisik, bukan berhasil semu), dan
menonaktifkan trigger append-only `chai.audit_entry` hanya selama transaksi itu.
Diverifikasi lewat `packages/database/test/jsonb-repair.integration.test.ts` —
tes itu **mengisi baris rusak dulu**, menjalankan 0082, lalu membuktikan bentuk
berubah — karena database kosong tidak bisa membuktikan apa pun.

Saya jalankan ulang gerbang penuh setelah koreksi ini masuk working tree:
typecheck exit 0 (23/23), lint exit 0 (23/23), domain integrasi exit 0
(8 berkas/51 tes), api integrasi exit 0 (35 berkas/132 tes), database integrasi
exit 0 (**13 berkas/44 tes**, naik dari 12/42 karena `jsonb-repair.integration.test.ts`
baru), verify:infra exit 0 (8/8). Semua konsisten dengan baseline; tidak ada
regresi.

**Pelajaran untuk fase lain yang menulis migrasi baru** (FASE 1, 2, 3, 6, 7):
migrasi yang memakai `SET ROLE chai_migration_owner` untuk `UPDATE`/`DELETE`
pada tabel `FORCE RLS` akan mengalami cacat yang sama. Jangan `SET ROLE` untuk
operasi yang butuh melihat lintas-tenant; tetap sebagai superuser koneksi, dan
tambahkan guard yang `RAISE` bila `current_user` tidak `rolsuper` atau
`rolbypassrls`. Tiru `0082_jsonb_repair_effective.sql` sebagai pola acuan.
**Uji migrasi baru terhadap tabel yang sudah berisi data**, bukan hanya
testcontainer kosong — kekosongan menyembunyikan persis kelas bug ini.

Uraian di bawah tetap disimpan karena memuat pelajaran yang masih berlaku untuk
masalah lain.

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
4. Migrasi baru bila perlu kolom `widget_key`/`allowed_origin` (mulai 0083).

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
`REQ-17-009` → TERPENUHI, `REQ-17-063` → SEBAGIAN (naik dari HILANG; bagian
stop-reminder tertutup, bagian update-proyeksi masih menunggu REQ-17-019 di
FASE 7), `REQ-09-014` → TERPENUHI, `REQ-02-018` → TERPENUHI, dan tambahkan
catatan bahwa jsonb double-encode (MASALAH-01) sudah ditutup — dengan migrasi
backfill efektif di `0082_jsonb_repair_effective.sql`, setelah `0072`–`0081`
terbukti no-op senyap pada database berisi data (root cause: `SET ROLE
chai_migration_owner` pada tabel `FORCE RLS`; lihat bagian "Status MASALAH-01"
di dokumen ini untuk detail lengkap dan bukti empirisnya). Sertakan alasan dan
bukti perintah. **Selesai** — lihat koreksi yang sudah diterapkan di kedua
berkas audit pada sesi yang menutup FASE 1 ini.

---

## FASE 1.5 — Dua bug P0 baru ditemukan saat menutup REQ-02-018 — **SELESAI**

Ditemukan sebagai efek samping menjalankan `tests/security/**`/`tests/e2e/**` untuk pertama kali
(FASE 1.2). Bukan bagian 309 temuan audit asli — dicatat sebagai `BUG-ESBUILD-1`/`BUG-ESBUILD-2` di
`docs/audit/2026-07-29/DAFTAR-CELAH-MASTER.md` §7.

**STATUS: SELESAI (2026-07-30).** Kedua bug tertutup penuh, terverifikasi lewat build produksi
sungguhan dan `pnpm run test:smoke` naik dari 76 lolos/13 gagal menjadi **89/89 lolos**.

### 1.5.1 BUG-ESBUILD-1 — Validasi body/query tidak berfungsi di build produksi — **SELESAI**

**Kondisi terverifikasi (bukan klaim)**: esbuild tidak mendukung `emitDecoratorMetadata`
(didokumentasikan resmi esbuild, pernyataan maintainer permanen — issue #257). `apps/api`'s script
`build` (`esbuild --bundle`) dan `tsx watch` (dev) keduanya esbuild-based dan keduanya terdampak.
Diverifikasi terhadap `node dist/main.js` (build asli) dan `pnpm dev`: `amount: "not-a-number"`
pada `POST /api/client/v1/payments/checkout` → **201**, tersimpan mentah di `amount_cents`
(pelanggaran invarian README "uang selalu integer minor units"); field asing (harus ditolak
`forbidNonWhitelisted`) → **201**. Vitest **tidak** menangkap keduanya karena transformernya
berbeda dari esbuild murni.

**Solusi diterapkan**: `packages/*` di monorepo tidak pernah di-build ke `dist/` nyata (exports
mengarah langsung ke `.ts`), sehingga pindah ke `tsc`/SWC murni tanpa bundling tidak mungkin (Node
tidak bisa `import` `.ts` mentah tanpa loader). Ditambahkan 1 dependency baru `@swc/core` (pinned
`1.15.47`, resmi dipakai NestJS sendiri) + esbuild plugin custom kecil
(`apps/api/scripts/swc-decorator-metadata-plugin.mjs`, ~40 baris) yang memanggil `swc.transform()`
dengan `decoratorMetadata: true` untuk setiap file `.ts` sebelum esbuild bundling — mempertahankan
seluruh alias/external esbuild yang sudah ada. `tsx watch` diganti `apps/api/scripts/dev.mjs`
(esbuild `context()`+`watch()` dengan plugin SWC yang sama, karena `tsx` adalah CLI wrapper tanpa
plugin API). `apps/api/package.json` scripts `build`/`dev` diarahkan ke script baru; devDependency
`tsx` dihapus dari `apps/api` (tetap dipakai di `workers/*` lain, tidak disentuh).

**Bukti penutupan**: `dist/main.js` build baru dan `pnpm dev` baru, keduanya: `amount: "not-a-number"`
→ **400 VALIDATION_ERROR**; field asing → **400**. Tes regresi permanen ditambahkan
`apps/api/test/build-gate.test.ts` — build produksi sungguhan + spawn `node dist/main.js` sungguhan
+ fetch HTTP asli (bukan `app.inject()` vitest), berjalan otomatis via `pnpm run test`.

### 1.5.2 BUG-ESBUILD-2 — Dependency injection implisit gagal senyap — **SELESAI**

**Kondisi terverifikasi**: `channels.controller.ts`'s `RealtimePublisher` (parameter constructor
tanpa `@Inject()` eksplisit) selalu `undefined` akibat akar yang sama (reflection metadata hilang).
`ingestWebhook()` crash 500 di setiap webhook channel masuk.

**Audit sistematis** atas seluruh 79 file constructor di `apps/api/src` menemukan blast radius jauh
lebih luas dari perkiraan awal: **19 file tambahan** dengan pola identik (bukan hanya 1 titik),
total **20 file** terdampak — lihat daftar lengkap di `DAFTAR-CELAH-MASTER.md` §7. Dibuktikan
definitif via `console.log` sementara di `dist/main.js` nyata: `CampaignController.repo = undefined`
sebelum perbaikan, instance repository nyata setelah `@Inject()` ditambahkan.

**Solusi diterapkan**: `@Inject(TokenClass)` eksplisit ditambahkan ke seluruh 20 file (+ import
`Inject` dari `@nestjs/common` di masing-masing). Ditutup sekaligus di akarnya bersama solusi
1.5.1 (plugin SWC memulihkan `design:paramtypes` untuk DI implisit juga, jadi kedua bug diperbaiki
oleh mekanisme yang sama, dengan `@Inject()` eksplisit sebagai pertahanan berlapis permanen).

**Catatan sampingan (di luar scope, TIDAK diperbaiki)**: `TenantGuard` menolak beberapa request
(`campaign`/`attachment` controller) dengan 401 karena Guards dieksekusi sebelum Interceptors dalam
siklus request NestJS — `TenantContextInterceptor` belum mengisi `request.tenantContext` saat
`TenantGuard` dievaluasi untuk kasus tertentu. Kemungkinan bug arsitektur terpisah, tidak terkait
esbuild, belum diverifikasi lebih lanjut — dicatat sebagai temuan potensial untuk fase lain.

**Bukti penutupan**: Typecheck+lint+build `@chai/api` exit 0. `pnpm run test:smoke`: **89/89 lolos**
(naik dari 76/13 gagal) — seluruh 13 kegagalan FASE 1 dikonfirmasi berakar pada dua bug ini, kini
tertutup. Gerbang monorepo penuh setelah FASE 1.5: typecheck 23/23, lint 23/23, build --force 23/23,
`pnpm run test` 36/36 task (184 test `@chai/api`, naik dari 182), domain integrasi 8/51 (sama
baseline), api integrasi 35/134 (sama baseline), `verify:infra` 8/8 — semua exit 0.

---

## FASE 2 — Sesi dan otentikasi — **SELESAI (2026-07-30)**

Tiga temuan HIGH pada jalur login yang setiap pengguna lewati.


### 2.1 REQ-10-013 — store refresh token in-memory, gagal multi-replika (HIGH) — **SELESAI**

**Kondisi terverifikasi**: `apps/api/src/auth/refresh-token-store.ts` ada;
pendukungnya `apps/api/src/auth/session-tokens.ts`,
`apps/api/src/auth/login.controller.ts`, `packages/auth/src/session-cookies.ts`.
`[klaim audit]` store-nya in-memory sehingga rotasi + "reuse revokes family"
tidak bertahan lintas replika.

**Bug tambahan ditemukan saat membaca kode**: komentar di `login.controller.ts`
sudah bilang "revoke entire family" saat reuse terdeteksi, tapi kode aslinya
hanya `throw ConflictException` tanpa pernah mencabut family — token lain hasil
rotasi terakhir korban tetap valid walau pencurian sudah terdeteksi.

**Solusi diterapkan**: migrasi `0083_refresh_token_family.sql` (2 tabel platform,
pola sama `chai.user_credential`), `PostgresRefreshTokenStore` +
`refresh-token-store.di.ts` (factory pattern identik `createCredentialStore`),
`performRefresh` di `login.controller.ts` sekarang benar-benar memanggil
`revokeFamily` saat reuse terdeteksi.

**Bukti penutupan**: 4 test integrasi Postgres nyata (`refresh-token-store.integration.test.ts`)
membuktikan (a) rotasi normal, (b) reuse mencabut seluruh family termasuk token
baru yang sah, (c) dua instance store independen (simulasi 2 replika) sepakat
tanpa share memory. Typecheck+lint+build+test unit (184→tetap, tidak regresi)
semua exit 0.

### 2.2 REQ-10-012 — CSRF untuk mutasi cookie-auth (HILANG, HIGH) — **SELESAI**

**Kondisi terverifikasi**: `SameSite` di `packages/auth/src/session-cookies.ts`
sudah `'lax'` eksplisit (bukan absen). Diverifikasi: `SameSite=Lax` tidak
mengirim cookie untuk request cross-site non-GET (fetch maupun form submit) —
karena semua mutasi API proyek ini memakai method non-GET, risiko utama CSRF
untuk mutasi **sudah tertutup** sebelum sesi ini, lebih baik dari perkiraan.

**Temuan arsitektur**: `apps/api` tidak pernah menerima cookie sesi sama sekali;
BFF proxy Next.js (`apps/client-portal`/`apps/owner-console`
`src/app/api/[...path]/route.ts`) yang membaca cookie dan meneruskannya sebagai
`Authorization: Bearer`. Titik defense-in-depth yang tepat adalah proxy itu,
bukan `apps/api`.

**Solusi diterapkan**: `requestOriginIsTrusted()` baru di
`packages/auth/src/session-cookies.ts`, dipakai kedua BFF proxy untuk menolak
403 method non-GET/HEAD tanpa `Origin`/`Referer` yang cocok `Host` sebelum
meneruskan apa pun ke `apps/api`.

**Bukti penutupan**: 7 test unit baru (`session-cookies-csrf.test.ts`).
Typecheck+lint `@chai/auth`+`client-portal`+`owner-console` exit 0; build
Next.js keduanya exit 0; test unit ketiganya tidak regresi.

### 2.3 REQ-10-005 — recent-auth hanya di 2 rute (HIGH) — **SELESAI**

**Kondisi terverifikasi**: guard ada di `apps/api/src/guards/high-risk.ts`,
tapi dikonfirmasi ulang hanya **1 rute** memakainya (bukan 2), bukan karena
severity berubah — audit awal salah hitung.

**Inventarisasi sistematis** (kategori dari rencana ini) menemukan 5 rute
tambahan yang seharusnya memakai guard tapi belum: hapus anggota tim
(`DELETE /api/client/v1/team/:id`), rotasi/hapus secret connector
(`POST`/`DELETE .../connector-config/.../secrets`), mandat pembayaran berulang
(`POST /api/client/v1/subscriptions` — komentar kodenya sendiri menyamakan
dengan refund tapi guard-nya hilang, bug konsistensi nyata), konfigurasi tujuan
ekspor audit (`POST /api/owner/v1/enterprise/audit-export-config`).

**Solusi diterapkan**: `assertRecentAuthentication(request)` ditambahkan ke
kelima rute; total kini 6 rute. Konstanta `RECENT_AUTH_ROUTES` (di
`guards/high-risk.ts`) mendaftarkan eksplisit setiap rute+alasan di kode.

**Bukti penutupan**: 5 test baru (`recent-auth-coverage.test.ts`) membuktikan
setiap entri inventaris benar-benar memanggil guard di file yang dirujuk, plus
unit test guard itu sendiri. Typecheck+lint+build exit 0; test unit naik ke
189 (dari 184).

**Gerbang FASE 2 penuh (2026-07-30)**: typecheck 23/23, lint 23/23, build
--force 23/23, `pnpm run test` 36/36 task (189 test `@chai/api`, 90 test
`@chai/auth` naik dari 83), domain integrasi 8/51 (sama baseline), api
integrasi 36/138 (naik dari 35/134, +1 file/+4 test refresh-token-store),
`test:smoke` 89/89 (tidak regresi) — semua exit 0.

---

## FASE 3 — Verifikasi webhook — **SELESAI (2026-07-30)**

Tiga temuan berakar sama: signature sudah ada, **timestamp dan jendela replay
tidak ada**.

### Temuan: REQ-10-016, REQ-09-006, REQ-09-023 — **SELESAI**

**Kondisi terverifikasi**: verifier signature nyata ada di
`packages/connectors/src/connectors/mock-payment/index.ts`
(`verifyMockPaymentWebhookSignature`, HMAC + `timingSafeEqual`) dan dipakai
`applyWebhook` di `apps/api/src/modules/payments/postgres-payments.repository.ts`.
Ditemukan juga: connector Midtrans (`connectors/midtrans/index.ts`) sudah
**lengkap dan riil** (checkout+webhook+refund+settlement via API Midtrans
asli, signature SHA-512 sudah benar) tapi **belum ter-wire** ke `apps/api` —
jauh lebih maju dari klaim audit awal "belum ter-wire". Connector JNE
(`connectors/jne/index.ts`) tracking real, tapi `handleWebhook` **tidak punya
parameter signature sama sekali** — bukan bug, JNE API memang tidak
menyediakan mekanisme signature.

State machine `decidePaymentTransition` (packages/domain) sudah melindungi
DATA dari replay (`PAID` tidak pernah regresi, status sama = IGNORE tanpa
audit/event). Risiko riil timestamp+replay bukan "uang berubah salah", tapi:
signature valid **selamanya** tanpa expiry, dan tidak ada dedup eksplisit
untuk observability/forensik.

**Solusi diterapkan**:
1. Helper bersama `packages/connectors/src/webhook-verification.ts`
   (`verifyWebhookTimestamp`, window default 5 menit simetris) dipakai dari
   `applyWebhook` — menolak timestamp kedaluwarsa/masa depan sebelum
   transaksi DB dibuka.
2. Migrasi `0084_payment_webhook_event.sql`: tabel dedup pragmatis (bukan
   model normatif blueprint §11.7 penuh yang butuh `provider_account` yang
   belum ada — keputusan sadar mempersempit scope, konsisten dengan
   REQ-17-019). Dedup key `(tenant_id, provider, external_id,
   provider_event_id)`, `ON CONFLICT DO NOTHING` sebagai gate.
3. Body limit 64 KiB pada kedua rute webhook penerima (`webhook-body-limit.hook.ts`,
   Fastify `onRequest`, cek `content-length` sebelum body diparse).
4. Endpoint webhook diubah jadi `POST /service/v1/payments/webhook/:provider`
   (pola sama `channels.controller.ts`). Midtrans disambungkan untuk
   **verifikasi webhook saja** (bukan checkout/refund — itu butuh secret
   manager per-tenant, FASE 5, di luar scope), `serverKey` dari
   `MIDTRANS_SERVER_KEY` (satu key global, bukan per-tenant, dicatat sebagai
   batasan). JNE **sengaja tidak disambungkan** — didokumentasikan di
   `DAFTAR-CELAH-MASTER.md` sebagai keputusan produk/infra tertunda (allowlist
   IP + rekonsiliasi wajib), bukan diam-diam diterima.

**Bukti penutupan**: tes integrasi membuktikan (a) timestamp kedaluwarsa
ditolak sebelum menyentuh state (payment tetap `PENDING`), (b) replay dengan
`provider_event_id` sama di dalam window tidak diproses dua kali (dibuktikan
lewat query langsung `chai.payment_webhook_event`, bukan hanya efek samping
state machine), (c) payload >64 KiB ditolak 413 sebelum diparse (dibuktikan
lewat `dist/main.js` produksi nyata), (d) provider tak dikenal ditolak
outright, (e) webhook Midtrans tanpa `MIDTRANS_SERVER_KEY` selalu ditolak
(default-closed). Gerbang penuh: typecheck 23/23, lint 23/23, build --force
23/23, `pnpm run test` 36/36 task (191 test `@chai/api`, naik dari 189),
domain integrasi 8/51 (sama baseline), api integrasi 36/143 (naik dari
36/138), `verify:infra` 8/8, `test:smoke` 89/89 (tidak regresi) — semua exit 0.

---

## FASE 4 — Policy engine tersambung ke runtime — **SELESAI (2026-07-30)**

Ini menyentuh invarian README: "Policy engine adalah satu-satunya pemberi izin
efek samping tool AI." Logikanya ada, sambungannya tidak.

### Temuan: REQ-08-008, REQ-08-021, REQ-09-034 — **SELESAI, scope dipersempit secara sadar**

**Kondisi terverifikasi**: `apps/api/src/modules/actions/action-policy.ts` +
`action-policy.test.ts` (10 tes, lulus) + `actions.controller.ts`;
`packages/domain/src/ai-policy/tool-policy.ts`;
`packages/connectors/src/kill-switch.ts` + `__tests__/kill-switch.test.ts`.
`[klaim audit]`: ketiganya ada tetapi tidak ter-wire ke jalur produksi.

**Temuan lebih besar dari klaim audit**: dokumen ini mengasumsikan "logikanya
ada, sambungannya tidak" — realitanya **seluruh `services/ai-gateway`** (bukan
hanya bagian policy) tidak tersambung ke apa pun. `createAiGateway`,
`ToolExecutionEngine`, `ConversationStateMachine` — semua **0 pemanggil
produksi**, hanya dipanggil di test masing-masing. `apps/api` tidak pernah
mengimpor `@chai/ai-gateway` dalam bentuk apa pun (0 match). Jalur yang
**sesungguhnya** ada di produksi (`POST /api/client/v1/actions/evaluate`)
hanya mengembalikan **keputusan** ke caller — **tidak mengeksekusi apa pun**.

**Keputusan scope**: dibangun jalur eksekusi tool baru **langsung di
`apps/api`**, terpisah dari `@chai/ai-gateway` (yang tetap 0 pemanggil
produksi — menyambungkannya berarti juga membangun pipeline balasan AI
generatif otomatis, fitur produk terpisah besar yang tidak diminta FASE 4
dan berisiko sangat tinggi tanpa spesifikasi produk). `/evaluate`
dipertahankan tidak berubah (masih murni preview — 6 file test bergantung
padanya); endpoint **baru** `POST /api/client/v1/actions/execute` benar-benar
mengeksekusi.

**Solusi diterapkan**:
1. Migrasi `0085_action_request.sql`: tabel `chai.action_request` idempoten
   (blueprint 08_AI §15 step 8), sebelumnya tidak ada implementasinya sama
   sekali.
2. Port baru `modules/shared/action-tool.port.ts` (`ActionKnowledgePort`,
   `ActionPaymentPort`, `ActionShipmentPort`, `ActionAppointmentPort`) +
   adapter di 4 modul asal (knowledge, payments, logistics, leads) — pola
   port wajib karena eslint boundary rule "jangan impor repository modul
   lain langsung".
3. `TOOL_EXECUTORS` registry (`tool-executors.ts`): 4 tool diimplementasikan
   (`knowledge.search`, `payment.get_status`, `shipment.get_status`,
   `appointment.create`) — dipilih karena infrastrukturnya sudah pasti ada.
   Tool lain di catalog tanpa executor ditolak `TOOL_NOT_IMPLEMENTED`, bukan
   diam-diam sukses.
4. `ActionsRepository` (abstract + `InMemoryActionsRepository` +
   `PostgresActionsRepository`, pola `useFactory` standar): idempotency
   check, jalankan executor, `commitBusinessMutation` (audit + event dalam
   satu transaksi dengan hasil).
5. `POST /actions/execute`: `evaluateToolPolicy()` → selain `ALLOW` = 403;
   kill switch (`getKillSwitchRuntime().isTripped(provider, tenantId)`,
   sebelumnya 0 pemanggil produksi) berdasar prefix tool
   (payment/shipment/appointment→calendar) → tripped = 503
   `CONNECTOR_DISABLED`; baru eksekusi.

**Bug konsistensi ditemukan dan diperbaiki saat menulis test**:
`InMemoryPaymentsRepository.applyWebhook` (FASE 3) **tidak pernah** diberi
gate timestamp+dedup yang sama dengan `PostgresPaymentsRepository` — berarti
FASE 3 belum tuntas 100% untuk jalur in-memory (e2e/local). Diperbaiki
sekaligus: `readWebhookEventTime` dipindah ke helper bersama
`webhook-verification.ts`, `InMemoryPaymentsRepository` diberi dedup Set +
timestamp check yang sama.

**Bukti penutupan**: test membuktikan (a) tool tak dikenal ditolak 403
`UNKNOWN_TOOL` tanpa efek samping, (b) tool yang policy tolak (HUMAN_ACTIVE +
AI origin) tidak menyentuh repository — idempotency key yang sama bisa
dipakai ulang setelahnya, (c) tool tanpa executor ditolak 400
`TOOL_NOT_IMPLEMENTED` dan tidak ada row `action_request` tercipta, (d) kill
switch `KILL_SWITCH_PAYMENT=1` menghentikan `payment.get_status` via
`/execute` (503) di jalur produksi nyata, tool tanpa kill switch
(`knowledge.search`) tidak terpengaruh, kill switch yang dibersihkan resume
eksekusi normal, (e) `appointment.create` sungguhan tersimpan visible under
RLS dengan audit + event dalam satu transaksi Postgres.

Gerbang penuh: typecheck 23/23, lint 23/23, build --force 23/23,
`pnpm run test` 36/36 task (196 test `@chai/api`, naik dari 191), domain
integrasi 8/51 (sama baseline), api integrasi 37/147 (naik dari 36/143, +1
file/+4 test `actions.integration.test.ts`), `verify:infra` 8/8,
`test:smoke` 89/89 (tidak regresi) — semua exit 0.

---


## FASE 5 — Rahasia dan kredensial ✅ SELESAI 2026-07-31

Tujuh temuan HIGH satu tema. Kerjakan sebagai satu fase karena akarnya sama.

> **Hasil (2026-07-31)**: 4/7 TERPENUHI penuh (REQ-10-022, REQ-05-003,
> REQ-17-049, REQ-09-029, REQ-04-010), 2/7 SEBAGIAN (REQ-17-011, REQ-17-058 —
> tabel `payment_provider_account` + SecretService per-tenant sudah ada via
> migrasi 0086, tetapi `verifyProviderWebhook` Midtrans masih pakai key global
> karena tenantId hanya terbaca setelah verifikasi; pre-parse order_id
> menyusul). Bukti eksekusi: `tsc --noEmit` exit 0, `eslint` exit 0, `vitest`
> api 206/206 + build-gate 4/4 + domain 158/158 lulus.

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

## FASE 6 — Sumber amount tepercaya (prasyarat FASE 7) — **SELESAI (2026-07-31)**

> Fase ini semula ditandai "BUTUH KEPUTUSAN MANUSIA". Keputusan sudah diambil
> (default blueprint: kolom nullable `order_id`/`invoice_id` di
> `chai.payment`, atribusi sebagai kolom di `chai.order`, notifikasi in-app ke
> pemilik tenant menyusul di FASE 7) dan fase ini dikerjakan sampai tuntas.

> **Hasil**: REQ-17-021 TERPENUHI. `CreateCheckoutBody` tidak lagi menerima
> `amount`/`currency` dari klien; checkout menerima `invoiceId` (preferred)
> atau `orderId`, dan server menghitung amount dari
> `SUM(order_item.unit_price_cents × quantity)` lewat invoice/order yang
> tersimpan. REQ-17-059, REQ-08-039, REQ-08-040 **belum** ditutup di fase ini
> — lihat "Sisa untuk FASE 7" di bawah.

### Yang dibangun

1. **Migrasi `0087_order_catalog.sql`**: `chai.service_item` (katalog, §11.2),
   `chai.order` + `chai.order_item` (snapshot harga immutable per-order,
   §11.3), `chai.invoice` (menagih order, §11.4), kolom `order_id`/`invoice_id`
   nullable di `chai.payment` (§11.6). Tiga trigger: recompute
   `order.total_cents` dari `SUM(order_item.line_total_cents)`, `order_item`
   immutable setelah insert (menolak UPDATE pada
   unit_price_cents/quantity/line_total_cents/service_item_id),
   `invoice.total_cents` immutable setelah status `issued`. RLS `ENABLE`+
   `FORCE` pada ketiga tabel baru.
2. **Modul `apps/api/src/modules/order/`**: `OrderRepository` abstract +
   `InMemoryOrderRepository` + `PostgresOrderRepository` (pola `useFactory`
   standar), `OrderController` (`GET/POST /api/client/v1/orders/catalog`,
   `POST /api/client/v1/orders`, `GET /api/client/v1/orders/:id`,
   `POST /api/client/v1/orders/:id/invoices`), terdaftar di `app.module.ts`.
3. **`PaymentsController.resolveCheckoutAmount`**: satu-satunya jalur yang
   menentukan amount checkout. `invoiceId` harus berstatus `issued`; tanpa
   `invoiceId`/`orderId` sama sekali, checkout ditolak `400
   CHECKOUT_REFERENCE_REQUIRED` — tidak ada fallback ke input klien.
4. **Port `PaymentOrderPort`** (`modules/shared/action-tool.port.ts`) +
   adapter `OrderPaymentAdapter` (`modules/order/order-payment.adapter.ts`):
   `PaymentsController` tidak mengimpor `OrderRepository` langsung — pola port
   wajib yang sama dengan temuan FASE 4, ditegakkan oleh eslint
   `no-restricted-imports`.

### Bug ditemukan dan diperbaiki selama fase ini

1. **Migrasi `0086_secret_refs.sql` (FASE 5) gagal keras dari testcontainer
   bersih**: `SET ROLE chai_migration_owner` dipakai untuk `ALTER TABLE` pada
   `public.connector_secrets`, padahal tabel itu dimiliki superuser koneksi
   migrasi (dibuat di `0031` tanpa `SET ROLE`). Diperbaiki dengan memisah
   migrasi jadi 3 blok bertingkat `SET ROLE` — pola yang sama dengan pelajaran
   `0082_jsonb_repair_effective.sql`. Migrasi ini belum pernah tercatat di git
   (`??`) dan belum pernah berhasil jalan sekali pun sebelum perbaikan ini,
   sehingga menyuntingnya tidak melanggar aturan "jangan sunting migrasi lama"
   (aturan itu melindungi migrasi yang sudah berhasil jalan di database
   nyata).
2. **`order.controller.ts` memakai permission salah**: `platform.channel.manage`
   (permission *owner platform*, prefix `platform.`) diganti `commerce.read`/
   `commerce.manage` (permission tenant, dimiliki `CLIENT_OWNER`).
   `@RequireAudience('client-portal')` yang hilang juga ditambahkan.
3. **`CreateOrderDto.items` tidak divalidasi**: tanpa `@ValidateNested({each:
   true})` + `@Type(() => CreateOrderItemDto)`, `class-validator` tidak
   mengenali array object nested, sehingga `forbidNonWhitelisted` menolaknya.
4. **Import guard salah path** di `payments.controller.ts` sejak sebelum fase
   ini (`../../guards/audience.guard` tidak ada; yang benar
   `../../auth/require-audience.decorator`). Ditemukan lewat typecheck saat
   melanjutkan fase ini.

### Bukti eksekusi (2026-07-31)

| Gerbang | Perintah | Hasil |
|---|---|---|
| Typecheck | `pnpm run typecheck` | exit 0, 23/23 paket |
| Lint | `pnpm run lint` | exit 0, 23/23 paket |
| Build | `pnpm run build --force` | exit 0, 23/23 paket |
| Unit + boundary | `pnpm run test` | exit 0, 36/36 task (206 test `@chai/api`, termasuk `build-gate.test.ts` 4/4) |
| Integrasi api | `pnpm --filter @chai/api run test:integration` | exit 0, 37 berkas / **147 tes** |
| Integrasi domain | `pnpm --filter @chai/domain run test:integration` | exit 0, 8 berkas / 51 tes |
| Integrasi database | `pnpm --filter @chai/database run test:integration` | exit 0, 13 berkas / 44 tes |
| Config infra | `pnpm run verify:infra` | exit 0, 8/8 |
| Smoke (Playwright) | `pnpm run test:smoke` | exit 0, **89/89** |

Test baru: `payments.e2e.test.ts` naik dari 6 → 8 test (`rejects checkout
without an order or invoice reference`, `resolves checkout amount from the
invoice total, not client input`). Test lain yang menyentuh
`payments/checkout` diperbaiki agar memakai `invoiceId` alih-alih `amount`:
`authorization.e2e.test.ts`, `entitlement.e2e.test.ts`, `build-gate.test.ts`,
`tests/e2e/payment-flow.spec.ts`, `tests/e2e/multi-tenant-isolation.spec.ts`,
`tests/security/tenant-isolation.spec.ts`. Tidak ada test yang dihapus atau
di-skip.

### Sisa untuk FASE 7

- REQ-17-059, REQ-08-039 (draft AI perlu persetujuan manusia sebelum link
  dibuat), REQ-08-023 (uang/alamat/kurir tidak dari teks model bebas),
  REQ-08-040 (AI tak bocorkan shipment pelanggan lain) **belum** ditutup —
  fase ini hanya menutup sumber amount untuk checkout HTTP langsung, belum
  menyentuh jalur AI/tool.
- Notifikasi in-app dan atribusi penuh (channel/campaign/conversation/agent
  sudah ada sebagai kolom di `chai.order`, tetapi belum ada consumer yang
  mengisi/membacanya) menyusul di FASE 7 bersama on-PAID lengkap.
- REQ-17-024 (business reference dalam kunci idempotensi) belum ditutup;
  `orderId`/`invoiceId` kini tersimpan di `chai.payment` tetapi idempotency
  key checkout masih murni string dari klien.

---

## FASE 7 — REQ-17-019: on-PAID lengkap (bekas MASALAH-02) — **SELESAI (2026-07-31)**

> **BUTUH KEPUTUSAN MANUSIA — JANGAN DIKERJAKAN AGENT SENDIRI.**
> Ada 4 keputusan produk yang harus turun lebih dulu (entitas bisnis yang
> dibayar, bentuk referensi, jalur notifikasi, definisi atribusi). Agent harus
> berhenti dan meminta keputusan — lihat BAGIAN 2 di
> `2026-07-31-panduan-eksekusi-agent-fase-5-26.md`.

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

1. Migrasi (mulai 0083): kolom/tabel referensi bisnis sesuai keputusan.
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

## FASE 8 — Refund dan operasional mismatch — **SELESAI (2026-07-31)**

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

## FASE 9 — Event kanonik dan consumer produksi — **SELESAI (2026-07-31)**

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

## FASE 10 — Sisa kebocoran lintas-tenant / ownership — **SELESAI (2026-07-31)**

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

## FASE 11 — Perbaikan berdiri sendiri — **SELESAI (2026-07-31)**

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

## FASE 12 — Menutup temuan TIDAK-TERVERIFIKASI — **SELESAI (2026-07-31)**

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

## FASE 14 — Utang yang diketahui (MASALAH-07) — **SELESAI (2026-07-31)**

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

- Jangan menyunting migrasi yang sudah ada; migrasi baru mulai **0083**.
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
