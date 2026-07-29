# Daftar masalah Chai untuk agen lanjutan

Serah-terima pekerjaan. Ditulis 2026-07-29, HEAD `d4f9b8b`, working tree bersih.

Dokumen ini menggantikan kebutuhan membaca ulang seluruh riwayat sesi. Yang belum
selesai ada di bagian [Masalah](#masalah), diurutkan prioritas. Baca bagian
[Aturan keras](#aturan-keras-jangan-dilanggar) dan [Jebakan teknis](#jebakan-teknis-yang-sudah-memakan-waktu)
lebih dulu — keduanya sudah pernah memakan waktu berjam-jam, dan melanggarnya
akan menghasilkan pekerjaan yang harus dibuang.

---

## Keadaan sekarang, terverifikasi

Semua angka di bawah adalah hasil eksekusi perintah, bukan klaim.

| Gerbang | Perintah | Hasil |
|---|---|---|
| Lint | `pnpm run lint` | exit 0, 23/23 paket |
| Typecheck | `pnpm run typecheck` | exit 0, 23/23 paket |
| Build | `pnpm run build --force` | exit 0, 23/23 paket |
| Unit + boundary | `pnpm run test` | exit 0, 36/36 task |
| Integrasi api | `pnpm --filter @chai/api run test:integration` | exit 0, **121 tes / 33 berkas** |
| E2e api | `pnpm --filter @chai/api run test:e2e` | exit 0 |
| Integrasi lain | database, domain, broker, automation-worker, payment-worker | exit 0 semua |
| Config infra | `pnpm run verify:infra` | exit 0, **8/8 config valid** |

**28 bug sudah ditemukan dan ditutup** dalam sesi-sesi sebelumnya, termasuk empat
pemblokir deploy absolut (build image rusak, crash ESM saat boot, role Postgres
runtime tanpa password, sertifikat TLS produksi tidak ada di repo). Jangan
mengulang pekerjaan itu.

**Audit blueprint selesai**: 309 temuan, 309 punya blok bukti (100%), tersebar di
`docs/audit/2026-07-27/` dan `docs/audit/2026-07-29/`. Daftar definitifnya
`docs/audit/2026-07-29/DAFTAR-CELAH-MASTER.md`.

Rekap kelas: TERPENUHI 73, SEBAGIAN 173, HILANG 44, BERTENTANGAN 1,
TIDAK-TERVERIFIKASI 18.
Rekap severity: CRITICAL 3, HIGH 37, MEDIUM 131, LOW 55.

### PENTING: daftar master sudah kedaluwarsa di dua baris

Daftar master adalah rekaman pada satu titik waktu. Dua temuan CRITICAL di sana
**sudah diperbaiki setelah dokumen itu ditulis**:

- `REQ-17-009` tertulis SEBAGIAN — **sudah TERPENUHI**. `applyWebhook` kini memakai
  `commitBusinessMutation`, jadi mutasi + audit + event commit dalam satu transaksi.
- `REQ-17-063` tertulis HILANG — **sudah TERPENUHI**. Reminder dihentikan lewat
  `stopPaymentReminders`, dengan tes yang membuktikan tepat sekali.

Jangan kerjakan dua itu lagi. Satu-satunya CRITICAL yang masih terbuka adalah
`REQ-17-019`, dan hanya sebagiannya (lihat MASALAH-02).

---

## Aturan keras, jangan dilanggar

Ini bukan preferensi gaya. Melanggarnya adalah pekerjaan yang harus dibuang.

1. **Tanpa `eslint-disable`** dalam bentuk apa pun.
2. **Tanpa `any`.**
3. **Tanpa non-null assertion `!`.** ESLint config `strict` menolaknya
   (`Forbidden non-null assertion`). Pakai `requireRow` atau pengecekan eksplisit.
4. **Jangan pernah men-skip, mematikan, atau menghapus tes.** Jumlah tes hanya
   boleh naik. Baseline sekarang: integrasi api 121.
5. **Jangan pernah menyunting migrasi yang sudah ada.** Semuanya dipin checksum di
   ledger `0048_schema_migration_ledger.sql`. Migrasi baru mulai dari nomor bebas
   berikutnya, yaitu **0083** (terakhir dipakai: `0082_jsonb_repair_effective.sql`).
6. **Jangan melonggarkan guard atau invarian.** RLS wajib `ENABLE` + `FORCE`, role
   runtime `NOBYPASSRLS`, urutan guard Audience → Authorization → Entitlement.
7. **Jangan menghapus repositori in-memory.** Suite e2e bergantung padanya.
8. **Tanpa dependensi baru** tanpa alasan kuat dan versi yang dipin.
9. **Uang selalu integer minor units** plus kode mata uang. Tidak ada float, tidak
   ada `DECIMAL` untuk uang.
10. **`PAID` tidak pernah mundur**; status terminal tetap terminal; kode provider
    tak dikenal menjadi `UNKNOWN_RESULT`, bukan ditebak.

Verifikasi setiap klaim dengan menjalankan perintah, dan laporkan **exit code
literal**. Jangan melaporkan "berhasil" tanpa keluaran perintah.

---

## Lingkungan

- Shell: **PowerShell di Windows**. `&&` **tidak valid** sebagai pemisah perintah;
  gunakan `;`. Selalu echo `$LASTEXITCODE`.
- Node 24.12, pnpm 11.13.1, Turborepo, TypeScript strict.
- Suite integrasi butuh **Docker** (testcontainers). Docker Desktop mati antar
  sesi; nyalakan dengan
  `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"` lalu poll
  `docker ps` sampai berhasil.
- Stack: NestJS di atas Fastify, Next.js App Router, PostgreSQL 17 dengan **66
  migrasi SQL mentah**, Redis Streams, vitest. Tidak ada Prisma/MongoDB/MySQL/SQLite.

---

## Jebakan teknis yang sudah memakan waktu

Baca ini sebelum menulis kode. Setiap butir sudah pernah menyebabkan kegagalan nyata.

**postgres-js dan jsonb.** `${JSON.stringify(obj)}` untuk kolom `jsonb` adalah
**salah** — postgres-js sudah men-serialisasi objek sendiri, jadi hasilnya
tersimpan sebagai jsonb *string skalar*. Gejalanya: `jsonb_typeof(kolom)` =
`'string'` dan `kolom ->> 'kunci'` mengembalikan `NULL` untuk semua kunci. Bentuk
yang benar: `${sql.json(obj)}`. Bila tipe input `Record<string, unknown>`,
`sql.json` menuntut `JSONValue`; pakai
`${tx.json(payload as Parameters<typeof tx.json>[0])}` (bukan `any`).

**Kolom jsonb kembali sebagai string.** Karena bug di atas, banyak pembaca
mengompensasi dengan `parseJson` lokal. Jangan berasumsi nilai jsonb sudah objek.

**`audit_log.resource_id` bertipe uuid.** Mengirim ID teks seperti `external_id`
menghasilkan `invalid input syntax for type uuid`. ID provider yang berbentuk teks
harus masuk `metadata`.

**Strictness TypeScript:** `noUncheckedIndexedAccess` (pakai `requireRow`, jangan
`rows[0]!`), `noImplicitOverride` (setiap override wajib kata kunci `override`),
`verbatimModuleSyntax` + `consistent-type-imports`, `noUnusedLocals`.

**Batas impor** (ditegakkan `eslint.config.mjs` + `tests/import-boundary.test.ts`):
modul tidak boleh mengimpor repositori modul lain; `analytics`/`advanced-analytics`
tidak boleh mengimpor `**/modules/*/*.repository`; frontend tidak boleh mengimpor
`@chai/database`, `@chai/domain`, atau `pg`. Konsekuensinya `parseJson` dan
`requireRow` **sengaja diduplikasi per berkas** — menyalinnya benar di sini, jangan
"dirapikan" menjadi modul bersama.

**Pola repositori Postgres.** Contoh acuan:
`apps/api/src/modules/sla/postgres-sla.repository.ts`. Selalu lewat
`withTenantTransaction(this.database, { principalId, tenantId }, work)`. Kolom body
pesan di `chai.message` bernama **`text_content`**, bukan `text`.

**Gate DB per modul:** `useFactory` + `inject: [DATABASE]` →
`database ? new PostgresXRepository(database) : new InMemoryXRepository()`.
Sebagian modul memakai **token provider berupa string** (misal
`'QuarantineRepository'`); harus dipertahankan persis, kalau tidak DI rusak saat
runtime **tanpa tertangkap typecheck**.

**ID kontrak wajib UUIDv7.** `TenantIdSchema` menuntut versi 7 dan varian
`[89abAB]`; `randomUUID()` v4 ditolak. Untuk kolom uuid biasa lewat SQL mentah, v4
tetap boleh.

**Skrip utilitas wajib di paket `"type": "module"`.** `tsx` memilih CJS/ESM dari
`package.json` terdekat ke **path skrip**, bukan cwd. Root tidak punya
`"type": "module"`, jadi skrip top-level-await di `scripts/` gagal (TS1375).
Bentuk yang jalan: `pnpm --filter @chai/database exec tsx src/<skrip>.ts`.

**Header `x-test-subject` hanya berlaku bila `APP_ENV` bernilai `local` atau
`test`** (`apps/api/src/auth/local-identity.ts`). Jadi `tests/performance/*` tidak
bisa mengukur staging/produksi; ukur lewat login sungguhan → Bearer token.

**URL di belakang nginx (port 80):** owner-console di `/login`, client-portal di
`/portal/login`. client-portal memakai `basePath: '/portal'`; nginx **tidak boleh**
menghapus prefiks itu. `basePath` hanya otomatis untuk `next/link` dan
`next/router` — `NextResponse.redirect` dengan base absolut dan
`window.location.href` **tidak** ikut ter-prefiks.

**Kredensial uji** (deterministik, hasil seed):
`owner@websitetest.chai.local` dan `founder@websitetest.chai.local`, password
`WebsiteTest#2026`, tenant `01936b40-0000-7000-8000-000000000001`. Seed:
```powershell
$env:DATABASE_URL = "postgres://chai_admin:change-me-staging-password@localhost:5432/chai"
pnpm --filter @chai/database exec tsx src/seed-website-test-accounts.ts
```

---

## Masalah

### MASALAH-01 — jsonb double-encode sistemik (SELESAI)

**Status: SELESAI 2026-07-29.** 14 dari 16 berkas diperbaiki ke `tx.json(...)`;
2 diverifikasi bukan penulis jsonb (body SSE dan JSON Schema ke disk). Backfill
efektif ada di migrasi `0082_jsonb_repair_effective.sql`, setelah 0071–0081
terbukti no-op senyap. Uraian di bawah tetap disimpan karena memuat pelajaran
yang masih berlaku untuk masalah lain.

**Bukti.** Pola `${JSON.stringify(...)}` untuk kolom jsonb menyimpan string
skalar. Dibuktikan dengan query diagnostik: `jsonb_typeof(payload)` = `'string'`,
nilai mentah `"{\"paymentExternalId\":\"pay_x\"}"`, dan `payload ->> 'kunci'` =
`NULL`. Dua penulis di `follow_up_job` sudah diperbaiki; sisanya belum.

**Yang paling penting:** `packages/domain/src/outbox/producer.ts` baris **68** dan
**102** menulis **seluruh** `outbox_event.payload` dan `audit_log.metadata`. Jadi
seluruh event outbox dan seluruh metadata audit di sistem ini tersimpan sebagai
string skalar.

**Konsekuensi nyata yang sudah terkonfirmasi:** role `chai_analytics_reader` punya
`SELECT` pada tabel itu tetapi **tidak bisa memfilter per kunci jsonb**. Indeks
GIN/ekspresi pada kunci jsonb juga mustahil. Untuk pembaca JS bug ini tidak
terlihat karena decode ganda membatalkan encode ganda — itulah sebabnya ia
bertahan lama.

**Cakupan tepat: 16 berkas produksi, 34 baris.** Daftar lengkapnya:

```
apps/api/src/modules/ai-agent/postgres-ai-agent.repository.ts            (8)
apps/api/src/modules/marketplace/marketplace.repository.ts               (3)
apps/api/src/modules/automation-builder/automation-builder.repository.ts (2)
apps/api/src/modules/contact-segment/postgres-contact-segment.repository.ts (2)
apps/api/src/modules/logistics/postgres-logistics.repository.ts          (2)
apps/api/src/modules/notification/postgres-notification.repository.ts    (2)
apps/api/src/modules/template/postgres-template.repository.ts            (2)
apps/api/src/modules/audit-immutability/postgres-audit-immutability.repository.ts (1)
apps/api/src/modules/campaign/postgres-campaign.repository.ts            (1)
apps/client-portal/src/app/api/realtime/conversations/route.ts           (1)
packages/contracts/src/generate-json-schema.ts                           (2)
packages/domain/src/automation/versioning.ts                             (3)
packages/domain/src/outbox/producer.ts                                   (2)
packages/domain/src/advanced-logistics/eta.ts                            (1)
packages/domain/src/realtime/event-store.ts                              (1)
workers/logistics-worker/src/reconcile.ts                                (1)
```

Perintah untuk mendaftar ulang sendiri (sudah diuji, keluar bersih tanpa error —
`-LiteralPath` wajib karena ada berkas rute Next.js bernama `[...path]` yang
ditafsirkan sebagai wildcard oleh PowerShell):
```powershell
Get-ChildItem -Recurse -File -Include *.ts -Path apps,packages,workers,services |
  Where-Object { $_.FullName -notmatch 'node_modules|\\test\\|\.test\.ts$|\.d\.ts$' } |
  Where-Object { (Get-Content -LiteralPath $_.FullName -Raw -ErrorAction SilentlyContinue) -match '\$\{JSON\.stringify' } |
  ForEach-Object { $_.FullName.Replace("$PWD\",'') }
```

**Peringatan penting:** tidak semua 16 berkas itu menulis kolom jsonb.
`packages/contracts/src/generate-json-schema.ts` menulis berkas ke disk, dan
`route.ts` kemungkinan men-serialisasi payload SSE. **Periksa satu per satu**;
jangan sapu rata dengan find-replace.

**Kenapa ini berisiko dan perlu hati-hati.** Setiap penulis yang diperbaiki akan
mengubah bentuk data yang dibaca konsumernya. Pembaca yang saat ini melakukan
`JSON.parse` atau `parseJson` akan menerima objek dan bisa rusak. Karena itu
penulis dan pembacanya harus diperbaiki **berpasangan**, per tabel, bukan sekaligus.

**Definisi selesai:**
- Untuk setiap tabel yang diperbaiki: penulis memakai `sql.json`, semua pembacanya
  disesuaikan, dan ada migrasi baru (mulai **0083**) yang membetulkan baris lama
  dengan `UPDATE ... SET kolom = (kolom #>> '{}')::jsonb WHERE jsonb_typeof(kolom) = 'string'`.

  **PERINGATAN PENTING — jangan tiru pola migrasi 0071–0081.** Kesepuluh migrasi itu
  plus 0071 melakukan `SET ROLE chai_migration_owner` lalu `UPDATE` biasa, dan
  semuanya **no-op senyap** pada database yang berisi data. Sebabnya dua, keduanya
  sudah diverifikasi empiris terhadap PostgreSQL 17 nyata: (1) seluruh tabel
  sasaran ber-RLS `FORCE`, dan `FORCE` mencabut kekebalan owner, sementara
  migrasi tidak menyetel konteks tenant sehingga `chai.current_tenant_id()`
  bernilai NULL dan policy tidak mencocokkan apa pun — nol baris, tanpa error;
  (2) `chai.audit_entry` diblokir lagi oleh trigger `audit_entry_no_update`.
  Cacat itu lolos justru karena testcontainer selalu kosong.

  Pola yang **benar** ada di `0082_jsonb_repair_effective.sql`: jangan `SET ROLE`,
  jalan sebagai role penghubung (migrasi memang sudah mensyaratkan superuser sejak
  `0051`), sertakan guard yang **RAISE** bila role tidak bisa bypass RLS, dan
  nonaktifkan trigger append-only hanya selama transaksi. Tiru berkas itu.
- Ada tes integrasi yang menegaskan `jsonb_typeof(kolom) = 'object'` dan
  `kolom ->> 'kunci'` mengembalikan nilai, bukan `NULL`. Acuan:
  `packages/database/test/jsonb-repair.integration.test.ts` — tes itu **mengisi
  baris rusak lebih dulu**, sebab database kosong tidak bisa membuktikan apa pun.
- Seluruh gerbang di tabel [Keadaan sekarang](#keadaan-sekarang-terverifikasi)
  tetap exit 0 dan jumlah tes tidak turun.

**Saran urutan:** mulai dari `producer.ts` (dampak terbesar, dan pembacanya
terpusat), satu tabel per commit, jangan digabung.

---

### MASALAH-02 — REQ-17-019 CRITICAL, tinggal separuh (P0)

**Sudah selesai:** transisi ke `PAID` kini menulis baris audit, meng-emit event
`payment.paid`, dan menghentikan reminder tepat sekali.

**Belum:** update proyeksi bisnis (booking/order/invoice), notifikasi, dan
atribusi.

**Akar penyebabnya struktural, bukan sekadar kode yang lupa ditulis:**
`chai.payment` **tidak punya kolom referensi bisnis** sama sekali (tidak ada
order_id/invoice_id). Jadi tidak ada cara mengetahui proyeksi mana yang harus
di-update. Reminder bisa dihentikan hanya karena ditautkan lewat
`payload->>'paymentExternalId'` di `follow_up_job` — itu tautan lewat payload,
bukan foreign key sungguhan (lihat komentar `ponytail:` di
`packages/domain/src/payments/reminders.ts`).

**Ini pekerjaan fitur dengan model data baru, bukan bug fix.** Butuh keputusan
desain lebih dulu:
1. Apa entitas bisnis yang dibayar? Belum ada tabel order/invoice kanonik.
2. Referensi bisnis masuk sebagai kolom di `chai.payment` atau tabel penghubung?
3. Notifikasi memakai jalur mana — `notification.repository` yang sudah ada?

**Jangan mengarang model proyeksi tanpa keputusan itu.** Ajukan desainnya lebih
dulu. Bila referensi bisnis ditambahkan, ubah predikat di
`stopPaymentReminders` menjadi join sungguhan (jalur upgrade sudah dicatat di
komentar fungsinya).

**Titik integrasi yang sudah siap:** kedua produsen status paid sudah seragam
meng-emit `payment.<status>` dan sudah memanggil satu helper bersama, jadi efek
hilir baru cukup ditambahkan di satu tempat:
- `apps/api/src/modules/payments/postgres-payments.repository.ts` (`applyWebhook`)
- `workers/payment-worker/src/reconcile.ts` (`applyReconciliation`)

---

### MASALAH-03 — CI belum pernah dieksekusi sekali pun (P0, terblokir)

`git remote -v` **kosong**. Tidak ada remote, jadi `.github/workflows/ci.yml`
belum pernah jalan. **Semua hasil hijau di dokumen ini hijau di satu mesin
Windows saja.**

Ini terblokir pada pemilik repo: butuh akun/URL remote.

Isi workflow-nya **sudah benar secara statis** (diverifikasi hari ini):
`branches: [main, master]` di baris 11 sehingga repo `master` ini tercakup, dan
langkah-langkahnya lengkap — `lint`, `typecheck`, `build`, `test`, `verify:infra`,
plus empat suite integrasi (`@chai/database`, `@chai/domain`, `@chai/api`
integrasi, `@chai/api` e2e). Jadi tidak ada yang perlu diperbaiki di berkas itu;
yang belum ada hanyalah eksekusinya.

Risiko nyata saat pertama kali jalan: CI berjalan di Linux, sementara semua
verifikasi sejauh ini di Windows. Perbedaan yang mungkin muncul: akhiran baris
CRLF/LF (git memperingatkan konversi di hampir setiap commit), sensitivitas huruf
pada path impor, dan ketersediaan Docker untuk testcontainers di runner.
**Perkirakan CI merah di percobaan pertama** karena alasan lingkungan, bukan
karena kode.

---

### MASALAH-04 — 37 temuan HIGH (P1)

Daftar penuh beserta buktinya ada di `DAFTAR-CELAH-MASTER.md` §1.2. Kelompokkan
per tema, karena banyak yang berakar sama — memperbaiki akarnya menutup beberapa
temuan sekaligus.

**Tema 1: rahasia dan kredensial** — `REQ-10-022`, `REQ-05-003`, `REQ-17-011`,
`REQ-17-049`, `REQ-17-058`, `REQ-09-029`, `REQ-04-010`.
Inti: tidak ada secret manager/KMS, secret konektor nyatanya tidak dienkripsi,
tidak ada rotasi teraudit, secret webhook masih global bukan per-tenant.

**Tema 2: verifikasi webhook** — `REQ-10-016`, `REQ-09-006`, `REQ-09-023`.
Inti: signature diverifikasi tetapi **timestamp dan replay window tidak ada**;
JNE tanpa signature; verifier Midtrans riil tidak ter-wire.

**Tema 3: sesi dan otentikasi** — `REQ-10-012` (CSRF untuk mutasi cookie-auth,
HILANG), `REQ-10-013` (store refresh token in-memory sehingga **gagal
multi-replika**), `REQ-10-005` (recent-auth hanya di 2 rute).

**Tema 4: policy engine tidak ter-wire ke runtime** — `REQ-08-008`, `REQ-08-021`,
`REQ-09-034`. Ini menyentuh invarian "policy engine adalah satu-satunya pemberi
izin efek samping tool AI": logikanya ada, tetapi tidak tersambung ke jalur
produksi. Perlakukan sebagai release-blocking.

**Tema 5: AI mengarang data sensitif** — `REQ-08-023`, `REQ-08-039`, `REQ-08-040`,
`REQ-17-021`, `REQ-17-059`. Inti: uang/alamat/kurir tidak boleh berasal dari teks
model bebas.

**Tema 6: kebocoran lintas-tenant** — `REQ-09-014` (sesi widget publik tanpa auth,
`tenantId` diambil **dari body**), `REQ-17-033`, `REQ-17-053`, `REQ-17-066`,
`REQ-09-026`. `REQ-09-014` adalah cacat isolasi tenant, jadi release-blocking
terlepas severity generiknya.

**Tema 7: refund** — `REQ-17-027`, `REQ-17-064`. Refund belum di balik
approval + recent-auth + rekonsiliasi provider.

**Tema 8: event kanonik tidak lengkap** — `REQ-17-044`, `REQ-06-010`.
Mayoritas event `payment.*`/`shipment.*` yang diminta blueprint tidak di-emit, dan
tidak ada konsumen produksi end-to-end. Catatan: jalur webhook payment **sudah**
meng-emit sejak perbaikan terakhir, jadi verifikasi ulang kondisi nyatanya sebelum
menulis kode.

---

### MASALAH-05 — satu temuan BERTENTANGAN (P1)

`REQ-03-035`: blueprint mewajibkan pola konfirmasi sesuai tingkat risiko, tetapi
implementasi punya **aksi destruktif satu-klik tanpa konfirmasi**. Kelas
BERTENTANGAN berarti kode secara aktif melawan spesifikasi, bukan sekadar belum
ada. Perbaikan kecil, dampak nyata.

---

### MASALAH-06 — 18 temuan TIDAK-TERVERIFIKASI (P2)

Butir-butir ini tidak bisa diputuskan secara statis; semuanya butuh eksekusi.
Yang ber-severity HIGH:

- `REQ-02-018` — tes integrasi isolasi tenant diklaim lulus tetapi **runner-nya
  belum pernah dijalankan**. Ini paling mudah ditutup: jalankan suite-nya dan
  laporkan exit code.
- `REQ-02-023` — sertifikasi provider payment/shipment + kill switch + runbook
  teruji.
- `REQ-09-026` — lookup tracking butuh verifikasi ownership.

Sisanya beserta "apa yang dibutuhkan untuk menutupnya" ada di
`DAFTAR-CELAH-MASTER.md` §4. Menutup butir TIV berarti **menjalankan sesuatu**,
lalu mengubah kelasnya berdasarkan keluaran nyata.

---

### MASALAH-07 — utang yang diketahui, bukan bug (P3)

- **PITR memakai `pg_dump`, bukan `pg_basebackup`.** WAL archiving sudah aktif dan
  terbukti (`pg_stat_archiver`: `archived_count=2`, `failed_count=0`), RPO turun
  dari 1 jam ke sekitar 60 detik. Tetapi basis restore yang benar untuk PITR
  tekstual adalah `pg_basebackup`.
- **Healthcheck worker hanya liveness** (`pgrep`), tidak membuktikan worker
  benar-benar memproses pekerjaan.
- **Lima modul masih persist di skema `public`**, bukan `chai`.
- **`AuditMiddleware` masih tidak ter-wire.** Terkonfirmasi hari ini: satu-satunya
  kemunculan `AuditMiddleware` di seluruh `apps` dan `packages` adalah
  definisinya sendiri di `audit.middleware.ts:79` — nol call site. Aman karena
  body-nya sudah diredaksi, tetapi ia tidak melakukan apa pun.
- **Cakupan performa hanya 3 endpoint baca.** Baseline ada di
  `docs/testing/2026-07-28-baseline-performa.md` (health 173 req/s p95 278ms;
  conversations 217 req/s p95 291ms; leads 281 req/s p95 197ms; 1500 request, nol
  error). Target blueprint "1000 conversations" belum pernah diuji.
- **Paritas staging vs produksi.** Staging kehilangan 11 service produksi (ELK,
  prometheus, grafana, otel, sentinel, backup, worker payment/logistics) dan
  **tidak me-mount `postgres.conf`**. Kesenjangan inilah sebabnya 9 bug produksi
  bisa bersembunyi. Mitigasi yang dipilih bukan menduplikasi service berat ke
  staging, melainkan `pnpm run verify:infra` yang memvalidasi setiap config lewat
  consumer aslinya di image yang dipin. Pertahankan skrip itu.
- **Jalur A melewati katalog kolom `§4–§13` dari `05_DATA_MODEL`** dengan alasan
  "skema, bukan normatif". Itu bisa menyembunyikan batasan nyata seperti kewajiban
  uang integer minor units. Layak diaudit ulang.
- **39 rujukan di dokumen audit dikutip sebagai nama berkas polos** tanpa path
  lengkap. Sudah diverifikasi semuanya menunjuk berkas nyata (nol fabrikasi), tapi
  gaya kutipannya kurang presisi.

---

## Cara kerja yang diharapkan

1. Baca [Aturan keras](#aturan-keras-jangan-dilanggar) dan
   [Jebakan teknis](#jebakan-teknis-yang-sudah-memakan-waktu).
2. Ambil **satu** masalah. Jangan menggabungkan MASALAH-01 dan MASALAH-02 dalam
   satu commit.
3. Untuk setiap temuan audit, **verifikasi ulang kondisi nyatanya di kode hari
   ini** sebelum menulis perbaikan. Dokumen audit bisa kedaluwarsa — dua baris
   CRITICAL di dalamnya sudah kedaluwarsa persis seperti itu.
4. Perbaiki **akar masalahnya di satu tempat bersama**, bukan menambal per
   pemanggil. Bila memperbaiki sebuah fungsi, grep seluruh pemanggilnya.
5. Tinggalkan **satu pemeriksaan yang bisa dijalankan** untuk logika non-trivial —
   tes terkecil yang gagal bila logikanya rusak.
6. Jalankan seluruh gerbang di tabel [Keadaan sekarang](#keadaan-sekarang-terverifikasi)
   dan laporkan **exit code literal**.
7. Pastikan jumlah tes **naik atau tetap**, tidak pernah turun.
8. Bila sebuah temuan audit ternyata sudah terpenuhi atau kelasnya salah, koreksi
   dokumen audit dan sebutkan alasannya. Itu hasil yang diharapkan, bukan
   pelanggaran.

## Jangan lakukan

- Jangan menyunting migrasi yang sudah ada; migrasi baru mulai **0072**.
- Jangan find-replace `JSON.stringify` secara massal; periksa tiap berkas apakah
  benar-benar menulis kolom jsonb.
- Jangan menghapus atau menonaktifkan tes untuk membuat gerbang hijau.
- Jangan menambah dependensi baru tanpa alasan kuat dan versi yang dipin.
- Jangan mengulang 28 bug yang sudah ditutup, dan jangan mengerjakan `REQ-17-009`
  atau `REQ-17-063` lagi.
- Jangan melaporkan pekerjaan selesai tanpa keluaran perintah yang membuktikannya.

## Rujukan

- `docs/audit/2026-07-29/DAFTAR-CELAH-MASTER.md` — daftar 309 temuan, definitif.
- `docs/audit/2026-07-27/` dan `docs/audit/2026-07-29/` — berkas bukti per jalur.
- `docs/plans/2026-07-27-rencana-audit-blueprint.md` — metode audit, §10 protokol
  eksekusi, §10.4 aturan bukti, §10.5 template temuan.
- `docs/PANDUAN_PENGGUNAAN.md` — cara menjalankan software, tiap perintah sudah
  diverifikasi.
- `docs/testing/2026-07-28-instruksi-testing-website.md` — 19 skenario client-portal
  + 16 owner-console.
- `Omnichannel_AI_Platform_Engineering_Blueprint_v1.2/` — sumber kebenaran spesifikasi.
- `README.md` bagian "Invarian" — invarian yang pelanggarannya adalah bug rilis.

