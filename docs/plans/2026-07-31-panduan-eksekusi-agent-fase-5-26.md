# Panduan eksekusi FASE 5–26 untuk agent (versi instruksi ketat)

> Ditulis 2026-07-31 khusus untuk agent dengan kapasitas penalaran terbatas
> (mis. Gemini Flash). Dokumen ini **tidak menggantikan** dua dokumen rencana:
>
> - `docs/plans/2026-07-29-rencana-penyelesaian-lengkap.md` (FASE 1–14)
> - `docs/plans/2026-07-31-rencana-fitur-kurang-fase-15-26.md` (FASE 15–26)
>
> Dua dokumen itu berisi **konteks dan alasan**. Dokumen ini berisi **langkah
> yang harus dijalankan**. Baca dokumen konteks untuk fase yang sedang
> dikerjakan, lalu ikuti langkah di sini.
>
> **FASE 1, 1.5, 2, 3, 4 SUDAH SELESAI. Jangan dikerjakan lagi.**

---

# BAGIAN 0 — ATURAN MUTLAK

Baca bagian ini setiap kali memulai sesi. Melanggar salah satu = pekerjaan
ditolak dan harus diulang.

## 0.1 Sepuluh larangan

| No | Larangan | Kenapa |
|---|---|---|
| 1 | Jangan menulis `any` | Aturan proyek. Pakai tipe eksplisit atau `unknown` + penyempitan tipe. |
| 2 | Jangan menulis `eslint-disable` dalam bentuk apa pun | Aturan proyek. Kalau lint marah, perbaiki kodenya. |
| 3 | Jangan menulis `!` (non-null assertion) | Pakai `if (!x) throw ...` atau pengecekan eksplisit. |
| 4 | Jangan menghapus / men-skip / mematikan test | Jumlah test hanya boleh **naik**. |
| 5 | Jangan mengubah file migrasi SQL yang sudah ada | Buat file migrasi **baru** dengan nomor berikutnya. **WAJIB cek nomor terakhir sendiri** dengan perintah di bawah — jangan percaya nomor yang tertulis di dokumen mana pun, termasuk dokumen ini. Sesi lain mungkin sudah menambah migrasi. |
| 6 | Jangan menghapus class `InMemory*Repository` | Suite e2e memakainya. |
| 7 | Jangan menambah dependency npm baru | Kecuali diizinkan eksplisit oleh manusia. |
| 8 | Jangan memakai `float`/`number` desimal untuk uang | Uang selalu integer minor units (rupiah: `10000` = Rp100,00). |
| 9 | Jangan melonggarkan RLS / guard / policy | Kalau test gagal karena guard, perbaiki test atau kode — jangan matikan guard. |
| 10 | Jangan melaporkan "selesai" tanpa menempelkan keluaran perintah | Membaca kode lalu berasumsi **bukan** bukti. |

## 0.2 Aturan `@Inject()` — WAJIB, kalau salah aplikasi rusak tanpa error

Setiap parameter constructor NestJS **harus** punya `@Inject(...)`.

**BENAR:**
```ts
constructor(
  @Inject(DATABASE) private readonly database: Database,
  @Inject(SomeRepository) private readonly repo: SomeRepository,
) {}
```

**SALAH (aplikasi akan rusak senyap di produksi):**
```ts
constructor(
  private readonly repo: SomeRepository,
) {}
```

Alasan: build produksi memakai esbuild yang tidak menyimpan informasi tipe.
Tanpa `@Inject()`, NestJS mengisi parameter itu dengan `undefined` **tanpa
melempar error saat aplikasi start**. Bug ini pernah merusak 20 file dan baru
ketahuan saat request masuk.

## 0.3 Template RLS untuk tabel baru — copy-paste apa adanya

**SEBELUM membuat file migrasi, jalankan ini untuk tahu nomor berikutnya:**

```
cd D:\Games\Agent\Chai
Get-ChildItem packages\database\migrations\*.sql | Sort-Object Name | Select-Object -Last 3 -ExpandProperty Name
```

Ambil nomor tertinggi, tambah 1. **Jangan pakai nomor yang tertulis di dokumen
rencana** — dokumen bisa kedaluwarsa dalam hitungan jam.

Contoh nyata betapa cepat berubahnya: dokumen rencana FASE 5–14 menulis "mulai
0083". Saat panduan ini pertama ditulis, nomor terakhir sudah `0086`. Beberapa
jam kemudian di hari yang sama sudah `0087_order_catalog.sql` karena sesi lain
menambahkannya. Karena itu perintah di atas bukan formalitas — jalankan setiap
kali.

Setiap tabel baru yang punya kolom `tenant_id` **wajib** punya blok ini di file
migrasinya:

```sql
ALTER TABLE chai.NAMA_TABEL ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.NAMA_TABEL FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.NAMA_TABEL
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.NAMA_TABEL FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.NAMA_TABEL TO chai_app_runtime;
```

Ganti `NAMA_TABEL` saja. Jangan mengubah bagian lain.

Setiap file migrasi juga harus dimulai dengan `SET ROLE chai_migration_owner;`
dan diakhiri `RESET ROLE;`. Contoh lengkap yang benar ada di
`packages/database/migrations/0085_action_request.sql` — **buka file itu dan
tiru strukturnya**.

## 0.4 Cara mencari di dalam kode (jangan sampai men-scan `node_modules`)

**SALAH** — akan mengeluarkan ratusan baris error dan memakan waktu lama:
```
Get-ChildItem . -Recurse -Include *.ts | Select-String -Pattern "sesuatu"
```

**BENAR** — sebutkan folder sumber secara eksplisit:
```
Get-ChildItem apps\api\src -Recurse -Include *.ts | Select-String -Pattern "sesuatu"
Get-ChildItem apps\api\src,packages\domain\src,workers -Recurse -Include *.ts | Select-String -Pattern "sesuatu"
```

Folder sumber yang biasa dipakai: `apps\api\src`, `apps\client-portal\src`,
`apps\owner-console\src`, `packages\domain\src`, `packages\connectors\src`,
`packages\auth\src`, `packages\ui\src`, `workers`, `services`.

Kalau muncul banyak error `Could not find a part of the path
...node_modules\.pnpm...`, itu tanda Anda memakai bentuk yang salah. Ulangi
dengan folder eksplisit.

## 0.5 Tabel "kalau membuat X, tiru file Y"

Jangan mengarang struktur baru. Buka file referensi, tiru polanya.

| Yang dibuat | Buka dan tiru file ini |
|---|---|
| Repository baru | `apps/api/src/modules/payments/payments.repository.ts` (abstract + in-memory) dan `postgres-payments.repository.ts` (Postgres) |
| Module NestJS baru | `apps/api/src/modules/payments/payments.module.ts` |
| Migrasi tabel tenant | `packages/database/migrations/0085_action_request.sql` |
| Port lintas-modul | `apps/api/src/modules/shared/action-tool.port.ts` |
| Adapter untuk port | `apps/api/src/modules/payments/payments-action.adapter.ts` |
| Test integrasi Postgres | `apps/api/test/integration/actions.integration.test.ts` |
| Test e2e HTTP | `apps/api/test/actions.e2e.test.ts` |
| Test unit murni | `apps/api/src/modules/actions/actions.controller.test.ts` |
| Fastify hook | `apps/api/src/common/webhook-body-limit.hook.ts` |
| Mutasi + audit + event 1 transaksi | pakai `commitBusinessMutation` — contoh pemakaian di `apps/api/src/modules/actions/postgres-actions.repository.ts` |

---

# BAGIAN 1 — PROTOKOL KERJA SETIAP SESI

Jalankan langkah 1 sampai 9 **berurutan**. Jangan melompat.

## Langkah 1 — Tentukan fase yang dikerjakan

Jalankan perintah ini untuk melihat status semua fase sekaligus:

```
cd D:\Games\Agent\Chai
Select-String -Path docs\plans\2026-07-29-rencana-penyelesaian-lengkap.md -Pattern "^## FASE" | Select-Object -ExpandProperty Line
```

Baris yang **tidak** mengandung kata `SELESAI` adalah fase yang belum dikerjakan.
Ambil yang nomornya paling kecil.

**Catatan penting**: gunakan `| Select-Object -ExpandProperty Line` seperti di
atas. Kalau Anda menulis `| Select-Object -First 12` saja, PowerShell bisa
menampilkan baris kosong — itu masalah format, bukan berarti tidak ada hasil.

Untuk FASE 15–26, perintahnya:

```
Select-String -Path docs\plans\2026-07-31-rencana-fitur-kurang-fase-15-26.md -Pattern "^## FASE" | Select-Object -ExpandProperty Line
```

Untuk FASE 27–33 (temuan audit lanjutan):

```
Select-String -Path docs\plans\2026-07-31-rencana-fase-27-33.md -Pattern "^# FASE" | Select-Object -ExpandProperty Line
```

**PENGECUALIAN URUTAN — baca ini sebelum memilih.** FASE 27 dan FASE 28 berasal
dari audit lanjutan dan menutup dua lubang keamanan yang aktif hari ini:

- **FASE 27**: 64 titik `@Body()` di 13 controller tidak divalidasi sama sekali,
  meskipun `ValidationPipe` aktif. Klien bisa mengirim field sembarang.
- **FASE 28**: `scan_status` attachment dikendalikan klien — bisa mengaku `CLEAN`
  tanpa scan pernah berjalan.

Keduanya **tidak butuh keputusan manusia** dan tidak bergantung pada fase lain.
Kerjakan FASE 27 lebih dulu daripada melanjutkan FASE 8 dan seterusnya, kecuali
Anda diberi instruksi lain.

## Langkah 1b — Pastikan tidak menabrak sesi lain

Repo ini dikerjakan oleh **beberapa sesi agent**, kadang bersamaan. Judul fase
yang belum bertanda `SELESAI` **tidak menjamin** belum ada yang menyentuhnya.

Sebelum menulis kode, periksa jejak pekerjaan yang sangat baru:

```
cd D:\Games\Agent\Chai
Get-ChildItem packages\database\migrations\*.sql | Sort-Object LastWriteTime |
  Select-Object -Last 5 Name, LastWriteTime
git status --short
```

Kalau ada migrasi atau berkas yang berubah dalam **beberapa jam terakhir** dan
berkaitan dengan fase yang akan Anda kerjakan, **berhenti dan laporkan** —
kemungkinan sesi lain sedang mengerjakannya.

Kejadian nyata: pada 2026-07-31 pukul 10:41, `0087_order_catalog.sql` muncul
(tabel `service_item`, `order`, `order_item`, `invoice`) padahal FASE 6 masih
belum bertanda `SELESAI` di dokumen rencana saat itu. Dua sesi yang mengerjakan
fase yang sama bersamaan bisa menghasilkan dua migrasi bernomor sama dan
konflik skema — FASE 6 kemudian diselesaikan sesi lain siang harinya (13:08–14:10)
setelah keputusan produknya sudah diambil manusia di luar dokumen.

**Status per 2026-07-31 siang**: FASE 1, 1.5, 2, 3, 4, 5, **6** sudah
`SELESAI`. Fase berikutnya yang belum dikerjakan adalah **FASE 7** — dan FASE 7
**butuh keputusan manusia** (lihat Langkah 2). Jadi fase pertama yang bisa Anda
kerjakan sendiri adalah **FASE 8**.

**Kerjakan satu fase saja per sesi. Jangan dua.**

## Langkah 2 — Cek apakah fase ini butuh keputusan manusia

Buka BAGIAN 2 dokumen ini. Kalau fase yang akan dikerjakan ada di daftar
"FASE YANG BUTUH KEPUTUSAN MANUSIA", **BERHENTI SEKARANG**. Tulis pesan ke
manusia memakai template di BAGIAN 4.3 dan tunggu jawaban.

## Langkah 3 — Catat baseline (WAJIB, jangan dilewat)

Jalankan perintah ini satu per satu. Catat angka yang keluar. Ini dipakai di
akhir sesi untuk membuktikan tidak ada test yang hilang.

```
cd D:\Games\Agent\Chai
pnpm run test
```

Catat: jumlah "Test Files" dan "Tests" untuk `@chai/api`.

```
docker ps
```

Kalau perintah ini **gagal**, nyalakan Docker Desktop dulu:

```
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
```

Tunggu 60 detik, lalu jalankan `docker ps` lagi sampai berhasil.

```
pnpm --filter @chai/api run test:integration
pnpm --filter @chai/domain run test:integration
```

Catat jumlah test masing-masing.

**Angka referensi per 2026-07-31 pagi** (setelah FASE 1–4 selesai). Angka ini
**akan naik** setiap fase selesai — jangan jadikan target, jadikan lantai
minimum. Kalau angka Anda **lebih kecil** dari ini, laporkan ke manusia: ada
yang rusak sebelum Anda mulai.

| Suite | File | Test |
|---|---|---|
| `pnpm run test` → `@chai/api` | 31 | 196 |
| `@chai/api` integrasi | 37 | 147 |
| `@chai/domain` integrasi | 8 | 51 |
| `test:smoke` | — | 89 |

Catatan: FASE 5 sudah diselesaikan sesi lain pada 2026-07-31 dan menambah test
baru, jadi angka nyata Anda kemungkinan **lebih tinggi** dari tabel di atas.
Itu normal. Yang penting: catat angka nyata Anda di awal sesi, dan pastikan di
akhir sesi angkanya tidak turun.

## Langkah 4 — Baca konteks fase

Buka dokumen rencana, baca **seluruh** bagian fase yang dikerjakan. Perhatikan:
- Baris bertanda `[klaim audit]` → ini **belum diverifikasi**, mungkin salah.
- Baris "Kondisi terverifikasi" → ini sudah diverifikasi, tapi bisa kedaluwarsa.

## Langkah 5 — VERIFIKASI KONDISI (wajib sebelum menulis kode)

Setiap fase di BAGIAN 3 punya blok "PERINTAH VERIFIKASI". Jalankan semuanya.
**Tempelkan hasilnya ke laporan Anda.**

Bandingkan hasil nyata dengan yang ditulis dokumen rencana:

| Hasil | Tindakan |
|---|---|
| Sama dengan dokumen | Lanjut ke Langkah 6. |
| Ternyata **sudah beres** | **JANGAN tulis kode.** Koreksi status di `DAFTAR-CELAH-MASTER.md` jadi TERPENUHI, tulis alasannya, lapor ke manusia. Ini hasil yang bagus, bukan kegagalan. |
| Berbeda dan Anda tidak paham | **BERHENTI.** Lapor ke manusia pakai template BAGIAN 4.3. |

## Langkah 6 — Tulis test dulu, kode kemudian

1. Tulis test yang **gagal** karena fitur belum ada.
2. Jalankan test itu, pastikan benar-benar gagal (kalau langsung lolos, testnya
   salah).
3. Tulis kode secukupnya sampai test lolos.
4. Jangan menambah fitur yang tidak diminta fase ini.

## Langkah 7 — Verifikasi bertahap (jalankan sesering mungkin)

Setelah setiap perubahan file, jalankan:

```
cd D:\Games\Agent\Chai
pnpm --filter @chai/api run typecheck
```

Kalau gagal: perbaiki dulu sebelum menulis kode lain. Jangan menumpuk error.

```
pnpm --filter @chai/api run lint
```

Kalau gagal: perbaiki. **Jangan** menambahkan `eslint-disable`.

## Langkah 8 — Gerbang verifikasi akhir (semua harus exit 0)

Jalankan **semua** perintah ini. Tempelkan hasil tiap perintah ke laporan.

```
cd D:\Games\Agent\Chai

pnpm run typecheck
pnpm run lint
pnpm run build --force
pnpm run test
pnpm run verify:infra
pnpm --filter @chai/domain run test:integration
pnpm --filter @chai/api run test:integration
Remove-Item -Recurse -Force test-results -ErrorAction SilentlyContinue
pnpm run test:smoke
```

Cek dua hal:
1. Semua perintah selesai tanpa error.
2. Jumlah test **sama atau lebih banyak** dari baseline Langkah 3.

Kalau ada yang gagal: perbaiki, lalu jalankan **ulang dari awal** blok ini.

## Langkah 9 — Bersihkan dan laporkan

```
Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -notlike "*Adobe*" } | Stop-Process -Force
Remove-Item -Recurse -Force test-results -ErrorAction SilentlyContinue
netstat -ano | findstr "LISTENING" | findstr ":300"
```

Perintah terakhir harus **tidak mengeluarkan apa pun**. Kalau masih ada, ada
proses server yang belum mati.

Lalu:
1. Perbarui `DAFTAR-CELAH-MASTER.md` (lihat BAGIAN 4.1).
2. Perbarui dokumen rencana (lihat BAGIAN 4.2).
3. Tulis laporan (lihat BAGIAN 4.4).
4. **BERHENTI.** Jangan mulai fase berikutnya.

---

# BAGIAN 2 — FASE YANG BUTUH KEPUTUSAN MANUSIA

**JANGAN kerjakan fase di bawah ini sendiri.** Semuanya butuh keputusan yang
tidak boleh diambil oleh agent. Kalau ditugaskan salah satu, tulis pesan ke
manusia pakai template BAGIAN 4.3.

| Fase | Keputusan yang dibutuhkan |
|---|---|
| **FASE 7** | Notifikasi lewat jalur mana (in-app saja / juga ke contact), dan definisi atribusi pembayaran. FASE 6 (SELESAI) sudah menutup sumber amount dan tabel `order`/`invoice`; FASE 7 tinggal isi consumer on-PAID. |
| **FASE 20** | Boleh menambah Temporal atau BullMQ? Keduanya dependency infrastruktur besar. |
| **FASE 22** (bagian `REQ-17-071`) | Boleh mengubah model data shipment jadi multi-package? Perubahan skema besar. |
| **FASE 26** (bagian `REQ-10-015`) | Boleh mengganti autentikasi API key jadi OIDC? Menyentuh keamanan inti. |
| **FASE 28** (bagian 28.B saja) | Pakai virus scanner nyata (mis. ClamAV) atau attachment tetap `PENDING` selamanya? Menambah dependency infrastruktur. Bagian 28.A aman dikerjakan. |
| **FASE 29** | Di mana payload mentah pesan masuk disimpan, berapa lama, apa yang diredaksi? Payload berisi data pribadi pelanggan. |
| **FASE 31** | Kapan AI membalas, apakah perlu persetujuan agen, apa yang terjadi saat guardrail menolak, batas biaya per tenant? Ini menentukan bentuk produk. |

Fase yang **aman dikerjakan sendiri**: 5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
18, 19, 21, 23, 24, 25, **27**, **28.A**, **30**, **32** (sebagian), **33**
(sebagian).

**Mulai dari FASE 27** kalau tidak diberi instruksi lain — lihat catatan
pengecualian urutan di Langkah 1.

Catatan untuk FASE 25 (Community Gateway/WAHA): aman dikerjakan **hanya kalau**
FASE 16, 17, 23, 24 sudah `SELESAI`. Kalau belum, laporkan bahwa prasyaratnya
belum terpenuhi.

---

# BAGIAN 3 — PERINTAH VERIFIKASI PER FASE

Untuk setiap fase: jalankan perintah, tempelkan hasilnya, baru menulis kode.

## FASE 5 — Rahasia dan kredensial — **SUDAH SELESAI 2026-07-31, JANGAN DIKERJAKAN**

Sesi lain sudah menyelesaikannya (migrasi `0086_secret_refs.sql`, modul
`apps/api/src/modules/secret/`). Kalau ditugaskan fase ini, cek dulu:

```
cd D:\Games\Agent\Chai
Select-String -Path docs\plans\2026-07-29-rencana-penyelesaian-lengkap.md -Pattern "^## FASE 5"
```

Kalau ada tulisan `SELESAI`, lewati dan lanjut ke fase berikutnya yang belum
selesai.

## FASE 6 — Sumber amount tepercaya — **SUDAH SELESAI 2026-07-31, JANGAN DIKERJAKAN**

Migrasi `0087_order_catalog.sql`, modul `apps/api/src/modules/order/`, port
`PaymentOrderPort` di `modules/shared/action-tool.port.ts`. Kalau ditugaskan
fase ini, cek dulu:

```
cd D:\Games\Agent\Chai
Select-String -Path docs\plans\2026-07-29-rencana-penyelesaian-lengkap.md -Pattern "^## FASE 6"
Test-Path apps\api\src\modules\order\order.module.ts
```

Kalau keduanya menunjukkan `SELESAI`/`True`, lewati. **Catatan**: FASE 6
menutup REQ-17-021 saja. REQ-17-059/08-023/08-039/08-040 (jalur AI/tool) belum
ditutup — itu bagian FASE 7, bukan alasan mengerjakan ulang FASE 6.

## FASE 8 — Refund dan mismatch

```
cd D:\Games\Agent\Chai
Get-Content packages\domain\src\payments\refund.ts
Get-Content apps\api\src\modules\advanced-payments\advanced-payments.controller.ts | Select-Object -First 80
Get-ChildItem apps\api\src -Recurse -Include *.ts | Select-String -Pattern "assertRecentAuthentication"
Get-Content apps\api\src\guards\high-risk.ts | Select-String -Pattern "RECENT_AUTH_ROUTES" -Context 0,20
```

**Yang dicari:** apakah rute refund sudah punya `assertRecentAuthentication`
(hasil FASE 2 sudah menambahkannya — verifikasi, jangan tambahkan dua kali).

## FASE 9 — Event kanonik dan consumer

```
cd D:\Games\Agent\Chai
Get-ChildItem packages\broker\src -File
Get-ChildItem workers -Directory
Get-ChildItem apps\api\src,workers,packages\domain\src,packages\broker\src -Recurse -Include *.ts | Select-String -Pattern "chai:outbox:"
Get-ChildItem apps\api\src,workers -Recurse -Include *.ts | Select-String -Pattern "eventType:"
```

**PENTING — jangan pakai `Get-ChildItem . -Recurse`** (titik = seluruh folder).
Itu akan menelusuri `node_modules` dan mengeluarkan ratusan baris error yang
tidak berarti. Selalu sebutkan folder sumber secara eksplisit seperti contoh di
atas.

**Yang dicari:** event apa yang benar-benar di-emit hari ini, dan apakah ada
consumer yang membacanya. Per 2026-07-31: 12 match untuk `chai:outbox:`.

## FASE 10 — Kebocoran lintas-tenant

```
cd D:\Games\Agent\Chai
Get-ChildItem apps\api\src -Recurse -Include *.ts | Select-String -Pattern "customerLookup|customerView"
Get-Content apps\api\src\modules\logistics\logistics.controller.ts | Select-Object -First 60
```

**Yang dicari:** apakah `customerLookup` (versi dengan proof of ownership) sudah
dipakai rute, atau masih ada rute yang memakai versi tanpa proof.

## FASE 11 — Perbaikan berdiri sendiri

Fase ini berisi 4 item kecil yang **tidak saling bergantung**. Kerjakan satu per
satu, commit terpisah.

```
cd D:\Games\Agent\Chai
Get-ChildItem apps\client-portal\src,apps\owner-console\src -Recurse -Include *.tsx | Select-String -Pattern "onClick.*delete|onClick.*remove|Hapus|Delete"
Get-Content apps\api\src\modules\attachment\postgres-attachment.repository.ts | Select-String -Pattern "scan_status" -Context 3,3
```

Item 11.1 (`REQ-03-035`): tombol destruktif tanpa konfirmasi.
Item 11.2 (`REQ-10-019`): `scan_status` tidak pernah diisi.
Item 11.3 (`REQ-08-018`): grounded answer — bersinggungan FASE 4/6, kerjakan
terakhir.
Item 11.4 (`REQ-05-002`): ini **hanya menulis dokumen ADR**, bukan kode.

## FASE 12 — Temuan TIDAK-TERVERIFIKASI

```
cd D:\Games\Agent\Chai
Select-String -Path docs\audit\2026-07-29\DAFTAR-CELAH-MASTER.md -Pattern "TIDAK-TERVERIFIKASI"
```

Untuk setiap baris hasil: jalankan sesuatu yang membuktikan status sebenarnya,
lalu ubah kelasnya. "Menutup butir TIV" artinya **menjalankan**, bukan membaca.

## FASE 13 — CI

```
cd D:\Games\Agent\Chai
git remote -v
Get-Content .github\workflows\ci.yml
```

Kalau `git remote -v` **kosong**: fase ini **terblokir**, bukan salah Anda.
Laporkan bahwa CI tidak bisa diverifikasi tanpa remote repository, lalu lanjut
ke fase berikutnya.

## FASE 14 — Utang yang diketahui

Fase ini berisi daftar catatan, bukan bug. Baca daftarnya di dokumen rencana.
Untuk setiap item: putuskan "kerjakan sekarang" atau "catat sebagai ditunda
sadar". Kalau ragu, catat sebagai ditunda dan laporkan.

Satu item sudah tidak berlaku: `AuditMiddleware` ditangani FASE 15.

## FASE 15–26

Perintah verifikasi untuk fase-fase ini sudah ada di dokumennya sendiri:
`docs/plans/2026-07-31-rencana-fitur-kurang-fase-15-26.md`, di setiap bagian
"VERIFIKASI KONDISI". Jalankan itu.

---

# BAGIAN 4 — TEMPLATE (copy-paste, isi bagian dalam kurung siku)

## 4.1 Update `DAFTAR-CELAH-MASTER.md`

Untuk setiap REQ yang benar-benar tertutup, ubah baris tabelnya:

Sebelum:
```
| REQ-XX-XXX | A | Deskripsi | SEBAGIAN | HIGH |
```

Sesudah:
```
| REQ-XX-XXX | A | Deskripsi (kini [apa yang berubah]) | TERPENUHI | HIGH |
```

Lalu tambahkan paragraf koreksi di bagian "Ringkasan eksekutif" dokumen itu:

```
**Koreksi pasca-sesi FASE [N] ([tanggal])**: [jumlah] temuan berpindah ke
TERPENUHI — [daftar REQ, mis. `REQ-10-021`, `REQ-05-008`]. Alasan tiap
perpindahan ada di baris REQ masing-masing di §1.
```

**JANGAN menghitung ulang total statistik (angka TERPENUHI/SEBAGIAN/HILANG
keseluruhan).** Alasan: tabel §1 hanya memuat 244 dari 309 REQ — sisanya ada di
berkas jalur terpisah (`docs/audit/2026-07-29/jalur-*.md`). Menghitung dari
tabel §1 saja menghasilkan angka yang **berbeda** dari ringkasan eksekutif dan
akan membuat dokumen saling bertentangan.

Kalau ingin tahu jumlah baris per status **di tabel §1 saja** (bukan total
keseluruhan), perintahnya:

```
(Select-String -Path docs\audit\2026-07-29\DAFTAR-CELAH-MASTER.md -Pattern "^\| REQ-.*\| TERPENUHI \|").Count
(Select-String -Path docs\audit\2026-07-29\DAFTAR-CELAH-MASTER.md -Pattern "^\| REQ-.*\| SEBAGIAN \|").Count
(Select-String -Path docs\audit\2026-07-29\DAFTAR-CELAH-MASTER.md -Pattern "^\| REQ-.*\| HILANG \|").Count
```

Per 2026-07-31 hasilnya: 17 / 159 / 42 (total 244 baris tabel). Kalau angka
Anda berbeda jauh dari ini tanpa Anda mengubah apa pun, laporkan.

Rekonsiliasi statistik total adalah tugas manusia. Sebutkan di laporan Anda:
"statistik total perlu direkonsiliasi manusia".

## 4.2 Update dokumen rencana

Ubah judul fase:

```
## FASE [N] — [nama] — **SELESAI ([tanggal])**
```

Ganti bagian "Langkah" menjadi "Solusi diterapkan", dan "Definisi selesai"
menjadi "Bukti penutupan" + angka literal.

## 4.3 Kalau harus BERHENTI dan tanya manusia

```
BERHENTI — butuh keputusan manusia.

Fase: FASE [N] — [nama]

Yang saya temukan:
[tempelkan keluaran perintah verifikasi]

Kenapa saya berhenti:
[pilih satu:]
- Fase ini ada di daftar "butuh keputusan manusia" (BAGIAN 2).
- Kondisi nyata berbeda dari dokumen rencana: dokumen bilang [X], kenyataannya [Y].
- Pendekatan yang sama sudah gagal 2 kali. Error terakhir: [tempelkan error].
- Prasyarat belum selesai: fase ini butuh FASE [M] yang belum SELESAI.

Yang saya butuhkan dari Anda:
[pertanyaan spesifik, bukan "bagaimana selanjutnya"]

Saya TIDAK mengubah file apa pun.
```

## 4.4 Laporan selesai

```
FASE [N] — [nama] — SELESAI

## Yang diubah
- [path/file] — [apa yang diubah, 1 baris]
- [path/file] — [apa yang diubah, 1 baris]

## Migrasi baru
- [nomor + nama file], atau "tidak ada"

## Test baru
- [path test] — [jumlah] test baru

## Gerbang verifikasi
| Perintah | Hasil |
|---|---|
| pnpm run typecheck | exit 0, [N]/[N] paket |
| pnpm run lint | exit 0, [N]/[N] paket |
| pnpm run build --force | exit 0, [N]/[N] paket |
| pnpm run test | exit 0, [N] file / [N] test |
| pnpm run verify:infra | exit 0, [N]/8 config |
| @chai/domain integrasi | exit 0, [N] file / [N] test |
| @chai/api integrasi | exit 0, [N] file / [N] test |
| pnpm run test:smoke | exit 0, [N] test |

## Perbandingan baseline
| Suite | Sebelum | Sesudah |
|---|---|---|
| test unit @chai/api | [N] | [N] |
| integrasi @chai/api | [N] | [N] |
| smoke | [N] | [N] |

## Dokumen diperbarui
- DAFTAR-CELAH-MASTER.md: [REQ yang diubah statusnya]
- [dokumen rencana]: FASE [N] ditandai SELESAI

## Temuan tambahan (kalau ada)
[hal yang ditemukan tapi di luar scope fase ini — catat, jangan diperbaiki]

## Kebersihan
- Proses node dimatikan: ya
- test-results dihapus: ya
- Port 3000-3099 kosong: ya
```

---

# BAGIAN 5 — MASALAH UMUM DAN CARA MENANGANINYA

| Gejala | Penyebab paling mungkin | Yang harus dilakukan |
|---|---|---|
| `pnpm --filter ... test:integration` gagal dengan error Docker | Docker Desktop mati | `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`, tunggu 60 detik, ulangi |
| `typecheck` gagal di `.next/dev/types/routes.d.ts` | Cache Next.js korup | `Remove-Item -Recurse -Force apps\owner-console\.next` lalu ulangi |
| Test lolos di vitest tapi rusak di produksi | Constructor tanpa `@Inject()` | Tambahkan `@Inject(Token)` ke semua parameter constructor |
| `no-restricted-imports` error soal repository | Mengimpor repository modul lain | Buat port di `apps/api/src/modules/shared/`, tiru `action-tool.port.ts` |
| Test e2e gagal `Tenant context required` | Test tidak mengirim header yang benar | Tambahkan header `x-test-subject: local\|client-owner` |
| Test mutasi gagal 400 `IDEMPOTENCY_KEY_REQUIRED` | Semua mutasi wajib header ini | Tambahkan header `idempotency-key: [string unik minimal 8 karakter]` |
| Migrasi gagal `relation already exists` | Nomor migrasi tabrakan | Cek nomor terakhir lagi, pakai nomor berikutnya |
| Port 3001 sudah dipakai | Server dari sesi sebelumnya belum mati | Jalankan perintah pembersihan Langkah 9 |
| Test integrasi gagal `invalid input syntax for type uuid` | Mengirim string biasa ke kolom uuid | Pakai UUID valid — lihat konstanta di `apps/api/src/database/api-ids.ts` |
| Lint error `import()` type annotations forbidden | Pakai `import('x').Type` inline | Pindahkan jadi `import type { Type } from 'x'` di atas file |

## Kalau benar-benar macet

Jangan mencoba pendekatan ketiga. Tulis pesan pakai template BAGIAN 4.3 dan
berhenti. Melapor lebih cepat lebih baik daripada merusak lebih banyak.
