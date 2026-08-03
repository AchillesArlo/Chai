# Panduan Agent Penguji — verifikasi independen pekerjaan agent pelaksana

> Ditulis 2026-07-31 setelah FASE 6 selesai. Semua angka baseline di dokumen
> ini hasil eksekusi nyata pada tanggal itu, bukan salinan dokumen lama.

## Untuk siapa dokumen ini

Anda adalah **agent penguji**. Agent lain (pelaksana) mengerjakan sebuah fase
perbaikan, lalu Anda memverifikasi klaimnya secara independen. Anda bukan
pelaksana lanjutan.

---

# BAGIAN 0 — PERAN DAN BATAS WEWENANG (baca sampai habis sebelum apa pun)

## 0.1 Yang WAJIB Anda lakukan

1. Jalankan setiap gerbang verifikasi sendiri, jangan percaya laporan pelaksana.
2. Bandingkan hasil nyata dengan tabel ekspektasi di BAGIAN 1 dan BAGIAN 3.
3. Tulis laporan memakai template BAGIAN 6, dengan **hasil literal perintah**.
4. Nyatakan LULUS atau TIDAK LULUS secara eksplisit. Tidak ada "sebagian".

## 0.2 Yang DILARANG Anda lakukan

| Larangan | Alasan |
|---|---|
| **Memperbaiki kode yang gagal** | Anda penguji, bukan pelaksana. Perbaikan oleh penguji menghilangkan bukti kegagalan dan tidak ada yang mengaudit perbaikan Anda. |
| Menghapus/men-skip test yang gagal | Test gagal adalah temuan, bukan gangguan. |
| Mengubah angka ekspektasi di dokumen ini | Kalau ekspektasi salah, laporkan; jangan sunting supaya lulus. |
| Menjalankan `git commit`, `git reset`, `git checkout` | Anda tidak mengubah riwayat. Cukup baca dengan `git status`/`git diff`. |
| Menyimpulkan "lulus" karena sebagian besar hijau | Satu gerbang merah = TIDAK LULUS. |
| Menambah dependency, mengubah konfigurasi test | Itu mengubah objek yang sedang diuji. |
| Menjalankan `docker compose down -v` di tengah pengujian | Menghapus data uji yang mungkin masih dibutuhkan. |

**Satu pengecualian**: kalau gerbang gagal karena **environment** (Docker mati,
port bentrok, `node_modules` rusak), Anda boleh memperbaiki environment itu —
bukan kode aplikasi. Lihat BAGIAN 5 untuk cara membedakannya.

## 0.3 Kalau menemukan kegagalan

Jangan berhenti di kegagalan pertama. Selesaikan seluruh gerbang yang masih
bisa dijalankan, supaya laporan Anda memuat gambaran lengkap, bukan satu
kegagalan pertama saja. Kecuali kegagalan itu memblokir gerbang berikutnya
(mis. `build` gagal → `test` tidak akan bermakna) — dalam hal itu, catat
bahwa gerbang selanjutnya diblokir dan sebutkan oleh apa.

---

# BAGIAN 1 — BASELINE YANG HARUS DIPENUHI

## 1.1 Angka acuan (hasil eksekusi 2026-07-31, setelah FASE 6 SELESAI)

Semua perintah dijalankan dari `D:\Games\Agent\Chai` dengan PowerShell.

| # | Gerbang | Perintah | Hasil wajib |
|---|---|---|---|
| 1 | Typecheck | `pnpm run typecheck` | exit 0, **23/23** paket |
| 2 | Lint | `pnpm run lint` | exit 0, **23/23** paket |
| 3 | Build | `pnpm run build --force` | exit 0, **23/23** paket |
| 4 | Unit+boundary | `pnpm run test` | exit 0, **36/36** task, `@chai/api` **≥206** test |
| 5 | Integrasi api | `pnpm --filter @chai/api run test:integration` | exit 0, **≥37** berkas / **≥147** test |
| 6 | Integrasi domain | `pnpm --filter @chai/domain run test:integration` | exit 0, **≥8** berkas / **≥51** test |
| 7 | Integrasi database | `pnpm --filter @chai/database run test:integration` | exit 0, **≥13** berkas / **≥44** test |
| 8 | Config infra | `pnpm run verify:infra` | exit 0, **8/8** config valid |
| 9 | Smoke (Playwright) | `pnpm run test:smoke` | exit 0, **≥89** test lolos, **0** gagal |

## 1.2 Aturan angka

- Tanda **≥** berarti angka itu **lantai minimum**. Pekerjaan yang benar
  menambah test, jadi angka lebih tinggi itu **bagus**.
- Angka **turun** = TIDAK LULUS, walaupun exit code 0. Test yang hilang berarti
  ada yang dihapus atau di-skip — itu dilarang aturan proyek.
- Angka **23/23** dan **36/36** adalah jumlah paket/task, bukan test. Kalau
  jumlah paket berubah (mis. 24/24 karena ada package baru), itu bukan
  kegagalan — catat saja di laporan.

## 1.3 Prasyarat sebelum menjalankan gerbang 5, 6, 7

Gerbang integrasi butuh Docker (testcontainers menyalakan PostgreSQL sendiri):

```
docker ps
```

Harus mengeluarkan tabel header (walau kosong). Kalau error, nyalakan Docker
Desktop dan tunggu sampai `docker ps` berhasil sebelum melanjutkan.

---

# BAGIAN 2 — PROTOKOL PENGUJIAN (jalankan berurutan)

## Langkah 1 — Catat apa yang diklaim pelaksana

Baca laporan pelaksana. Catat: fase mana yang dikerjakan, file apa yang
diklaim diubah/dibuat, dan angka gerbang yang dia klaim.

Kalau tidak ada laporan, lanjutkan saja — Anda tetap menguji terhadap
dokumen rencana fase itu.

## Langkah 2 — Lihat perubahan nyata di repo

```
cd D:\Games\Agent\Chai
```

```
git status --short
```

```
git diff --stat
```

Bandingkan dengan klaim di Langkah 1. **Setiap file yang berubah tapi tidak
disebut di laporan adalah temuan** — catat, jangan diabaikan. Begitu juga
sebaliknya: file yang diklaim diubah tapi tidak muncul di `git status`.

## Langkah 3 — Pastikan tidak ada test yang dihapus atau di-skip

```
git diff | Select-String -Pattern "^-.*\b(it|test|describe)\(" 
```

**PENTING — perintah ini menangkap dua hal berbeda**, dan Anda harus
membedakannya sebelum melapor:

1. **Test yang benar-benar dihapus** → pelanggaran.
2. **Test yang di-rename atau diubah isinya** → BUKAN pelanggaran. Baris lama
   muncul sebagai `-` dan baris baru muncul sebagai `+`.

Cara membedakan: untuk setiap hasil `-`, cari pasangan `+`-nya di file yang
sama:

```
git diff | Select-String -Pattern "^\+.*\b(it|test|describe)\("
```

Lalu bandingkan **jumlah totalnya**:
- Jumlah baris `+` **≥** jumlah baris `-` → tidak ada test yang hilang
  (rename/tambah). Aman.
- Jumlah baris `+` **<** jumlah baris `-` → ada test yang benar-benar hilang.
  Pelanggaran, laporkan.

Bukti paling menentukan tetap **jumlah test dari runner** di gerbang 4–9
(BAGIAN 1). Kalau jumlah test di runner tidak turun, tidak ada test yang
hilang — apa pun yang terlihat di diff.

Contoh nyata (2026-07-31, FASE 6): diff menunjukkan 5 baris `-` termasuk
`test('checkout rejects invalid amount')`, tetapi itu **rename** menjadi
`test('checkout rejects missing order or invoice reference')`. Jumlah test
naik dari 6 → 8. Bukan pelanggaran.

```
Get-ChildItem apps,packages,workers,tests,services -Recurse -Include *.test.ts,*.spec.ts | Where-Object { $_.FullName -notmatch '\\node_modules\\' } | Select-String -Pattern "\.skip\(|\.todo\(|xit\(|xdescribe\("
```

Setiap hasil = test yang dimatikan. Ini pelanggaran tanpa pengecualian
(berbeda dari kasus rename di atas). Catat semuanya.

**Catatan soal keluaran `git diff`**: perintah `git diff` di repo ini
memunculkan banyak baris `warning: ... LF will be replaced by CRLF`. Itu
normal di Windows dan **bukan** temuan — abaikan.

## Langkah 4 — Cari pelanggaran aturan keras proyek

Jalankan keempat perintah ini. **Hasil apa pun = pelanggaran**, kecuali
disebutkan lain:

```
git diff | Select-String -Pattern "^\+.*eslint-disable"
```
Larangan mutlak. Tidak ada pengecualian.

```
git diff | Select-String -Pattern "^\+.*:\s*any\b|^\+.*as any\b"
```
Larangan mutlak.

```
git diff | Select-String -Pattern "^\+.*\w+!\.|^\+.*\w+!\s*[;,)]"
```
Non-null assertion (`!`). Dilarang; harus pakai pengecekan eksplisit.
Catatan: pola ini bisa salah tangkap (mis. `!==`, `!x`). Periksa setiap hasil
secara manual sebelum melaporkannya sebagai pelanggaran.

```
git diff -- package.json apps/*/package.json packages/*/package.json workers/*/package.json services/*/package.json | Select-String -Pattern "^\+.*\"" 
```
Dependency baru. Kalau ada, versinya wajib dipin exact (bukan `^` atau `~`)
DAN pelaksana wajib memberi alasan di laporannya. Tanpa keduanya = temuan.

## Langkah 5 — Periksa migrasi (kalau fase itu menambah migrasi)

```
git status --short packages\database\migrations
```

Untuk **setiap** file migrasi baru, periksa 3 hal:

**(a) Nomornya tidak menabrak yang sudah ada:**
```
Get-ChildItem packages\database\migrations\*.sql | Sort-Object Name | Select-Object -Last 5 -ExpandProperty Name
```
Tidak boleh ada dua file dengan nomor prefix sama (mis. dua `0088_`).

**(b) Migrasi lama tidak disunting:**
```
git status --short packages\database\migrations | Select-String -Pattern "^ M"
```
Hasil apa pun di sini = migrasi lama diubah. Itu dilarang, **kecuali** migrasi
itu belum pernah di-commit (tanda `??` bukan ` M`) — dalam kasus itu bukan
pelanggaran. Periksa dengan `git log --oneline -- <path-file>`: kalau kosong,
file itu belum pernah di-commit.

**(c) Tabel ber-`tenant_id` wajib RLS:**
Buka setiap file migrasi baru. Kalau ada `CREATE TABLE` dengan kolom
`tenant_id`, file itu **wajib** memuat ketiga baris ini untuk tabel tersebut:
```sql
ALTER TABLE <nama> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <nama> FORCE ROW LEVEL SECURITY;
CREATE POLICY ... USING (tenant_id = chai.current_tenant_id())
```
Tidak lengkap = temuan keamanan, severity tinggi.

**(d) Migrasi benar-benar BISA DIJALANKAN dari database kosong** — ini
verifikasi terpenting di langkah ini, dan yang paling sering terlewat.

Gerbang 5/6/7 (BAGIAN 1) sudah menjalankan migrasi lewat testcontainers dari
database kosong, jadi kalau ketiganya exit 0, migrasi baru terbukti jalan.
**Kalau salah satu gerbang integrasi gagal dengan pesan seperti di bawah,
akarnya adalah migrasi, bukan test:**

```
PostgresError: must be owner of table <nama_tabel>
```

Ini bug nyata yang sudah pernah terjadi (migrasi `0086`): `SET ROLE
chai_migration_owner` dipakai untuk `ALTER TABLE` pada tabel yang dimiliki
role lain (superuser koneksi migrasi). Cara memverifikasi akar masalahnya:

```
Select-String -Path packages\database\migrations\<file-migrasi-baru>.sql -Pattern "SET ROLE|ALTER TABLE|CREATE TABLE"
```

Lalu cari siapa pemilik tabel yang di-`ALTER`:
```
Select-String -Path packages\database\migrations\*.sql -Pattern "CREATE TABLE.*<nama_tabel>"
```
Buka file hasilnya, cek baris pertamanya. Kalau file **pembuat** tabel itu
memakai `SET ROLE chai_migration_owner`, maka migrasi baru boleh pakai
`SET ROLE` juga. Kalau file pembuat **tidak** memakainya, migrasi baru
**tidak boleh** memakai `SET ROLE` untuk tabel itu.

Laporkan temuan ini dengan nama tabel dan kedua nomor migrasi (pembuat dan
pengubah) — itu informasi yang dibutuhkan untuk memperbaikinya.

## Langkah 6 — Periksa `@Inject()` pada constructor baru

```
git diff | Select-String -Pattern "^\+.*constructor\(" -Context 0,6
```

Untuk setiap constructor baru di kelas NestJS (controller/service/repository),
**setiap** parameter wajib punya `@Inject(Token)` eksplisit. Tanpa itu,
aplikasi resolve `undefined` di build produksi **tanpa error boot** — bug yang
sangat sulit dilacak dan sudah pernah terjadi di proyek ini.

## Langkah 7 — Jalankan 9 gerbang BAGIAN 1

Jalankan **satu per satu**, urut, dan simpan hasil literalnya (termasuk baris
ringkasan jumlah test dan exit code). Jangan gabungkan beberapa perintah dalam
satu baris — kalau satu gagal, Anda perlu tahu yang mana.

Untuk setiap perintah, tambahkan echo exit code:
```
pnpm run typecheck ; Write-Output "EXIT=$LASTEXITCODE"
```

## Langkah 8 — Verifikasi struktur spesifik fase

Buka BAGIAN 3, cari bagian fase yang dikerjakan pelaksana, jalankan perintah
verifikasi di sana. Ini yang membedakan "gerbang hijau" dari "fase benar-benar
selesai" — gerbang hijau bisa dicapai tanpa mengerjakan apa pun.

## Langkah 9 — Periksa dokumen sudah diperbarui

```
Select-String -Path docs\plans\2026-07-29-rencana-penyelesaian-lengkap.md -Pattern "^## FASE" | Select-Object -ExpandProperty Line
```

Fase yang dikerjakan harus bertanda `SELESAI` beserta tanggal. Kalau
gerbang hijau tapi dokumen belum ditandai, itu temuan ringan (pekerjaan
selesai tapi jejaknya hilang untuk sesi berikutnya).

## Langkah 10 — Bersihkan dan tulis laporan

```
Remove-Item -Recurse -Force test-results -ErrorAction SilentlyContinue
```

```
Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object Id, ProcessName
```
Kalau ada proses node menggantung dari test yang gagal, catat di laporan
(jangan otomatis kill kalau Anda tidak yakin itu milik test).

Lalu tulis laporan dengan template BAGIAN 6.

---

# BAGIAN 3 — STRUKTUR YANG SEHARUSNYA, PER FASE

## 3.0 Pola wajib yang berlaku di SEMUA fase

Setiap kali pelaksana membuat sesuatu, bandingkan dengan contoh yang sudah ada:

| Kalau pelaksana membuat | File contoh yang harus ditiru | Cara verifikasi |
|---|---|---|
| Repository baru | `apps/api/src/modules/payments/payments.repository.ts` | Wajib 3 bentuk: `abstract class X`, `InMemoryX`, `PostgresX` |
| Module NestJS baru | `apps/api/src/modules/payments/payments.module.ts` | Wajib `useFactory` yang memilih Postgres/in-memory berdasar `DATABASE` |
| Migrasi tabel tenant | `packages/database/migrations/0085_action_request.sql` | Wajib RLS `ENABLE`+`FORCE`+policy (lihat Langkah 5c) |
| Port lintas-modul | `apps/api/src/modules/shared/action-tool.port.ts` | Modul tidak boleh impor repository modul lain langsung |
| Adapter port | `apps/api/src/modules/order/order-payment.adapter.ts` | Adapter tinggal di modul **pemilik** data, bukan pemakai |
| Test integrasi Postgres | `apps/api/test/integration/actions.integration.test.ts` | Pakai testcontainers, bukan mock |
| Test e2e HTTP | `apps/api/test/actions.e2e.test.ts` | Wajib header `x-test-subject: local|client-owner` |

**Cara cek pelanggaran boundary lintas-modul** (paling sering dilanggar):
```
pnpm --filter @chai/api run lint
```
Aturan `no-restricted-imports` akan menolak impor repository lintas-modul.
Kalau lint hijau, boundary aman.

## 3.1 FASE 7 — on-PAID lengkap (REQ-17-019)

Ini fase yang paling mungkin Anda uji. Persyaratannya: saat pembayaran menjadi
`PAID`, dalam **satu transaksi** harus terjadi: status berubah, audit tercatat,
event `payment.paid` di-emit, reminder dibatalkan, proyeksi bisnis
(order/invoice) ter-update, notifikasi tercatat, atribusi tercatat.

> **Status per 2026-07-31 16:35**: agent pelaksana sudah mulai mengerjakan ini.
> Saat dokumen ini ditulis, sudah terlihat: migrasi `0088_follow_up_job_payment_id.sql`
> dan `0089_payment_idempotency_index.sql`, `PaymentNotificationPort` di
> `action-tool.port.ts`, `stopPaymentReminders` sudah memakai `payment_id` FK,
> dan efek on-PAID di kedua jalur. **Jangan anggap ini bukti selesai** —
> struktur ada bukan berarti benar dan teruji. Tetap jalankan seluruh
> verifikasi di bawah.

### Struktur yang harus ada

**(a) Migrasi baru: kolom `payment_id` di `follow_up_job`**
```
Select-String -Path packages\database\migrations\*.sql -Pattern "payment_id.*REFERENCES chai.payment|ADD COLUMN.*payment_id"
```
Harus ada hasil di file migrasi **baru** (nomor > 0087). Kalau nol hasil,
FASE 7 tidak mungkin selesai — reminder tidak punya cara tertaut ke payment.

**(b) `stopPaymentReminders` memakai join FK, bukan cocok-payload**
```
Select-String -Path packages\domain\src\payments\reminders.ts -Pattern "payment_id|paymentExternalId"
```
Yang **benar**: ada `payment_id` di query. Yang **salah**: masih hanya
`payload ->> 'paymentExternalId'` tanpa `payment_id` sama sekali.

**(c) Ada produsen reminder (bukan hanya pembatal)**
```
Get-ChildItem apps,packages,workers -Recurse -Include *.ts | Where-Object { $_.FullName -notmatch '\\node_modules\\' } | Select-String -Pattern "INSERT INTO chai.follow_up_job"
```
Harus ada hasil di jalur payment/checkout. Kalau hanya ada di modul automation
generik, produsen khusus payment belum dibuat — langkah (b) jadi jalur mati
(tidak ada apa pun untuk dibatalkan).

**(d) Efek on-PAID di KEDUA jalur**

Ada dua produsen status pembayaran, keduanya harus punya efek baru:
```
Select-String -Path apps\api\src\modules\payments\postgres-payments.repository.ts -Pattern "markInvoicePaid|NotificationPort|notify"
```
```
Select-String -Path workers\payment-worker\src\reconcile.ts -Pattern "chai.order|chai.invoice|chai.notification"
```
Keduanya harus ada hasil. **Kalau hanya satu**, pembayaran yang dikonfirmasi
lewat rekonsiliasi (bukan webhook) tidak akan meng-update order/invoice — itu
bug diam-diam yang hanya muncul di produksi.

Catatan penting: `workers/payment-worker` **tidak bisa** mengimpor dari
`apps/api` (package terpisah). Jadi jalur worker wajib pakai SQL langsung,
sementara jalur `apps/api` pakai port. Perbedaan ini **benar**, bukan
inkonsistensi. Verifikasi:
```
Select-String -Path workers\payment-worker\src\*.ts -Pattern "^import"
```
Kalau ada import dari `apps/api` atau `../../../apps`, itu pelanggaran
boundary — laporkan.

**(e) Port baru terdaftar dengan benar**
```
Select-String -Path apps\api\src\modules\shared\action-tool.port.ts -Pattern "abstract class"
```
Kalau pelaksana menambah port (mis. `PaymentNotificationPort`), harus ada:
- abstract class di file itu,
- adapter yang mengimplementasikannya di modul pemilik data,
- provider terdaftar di module pemilik,
- module pemilik diimpor oleh module pemakai.

Cara paling cepat memastikan semua tersambung: `pnpm run test` harus hijau.
DI yang tidak tersambung akan gagal saat aplikasi boot di test e2e.

### Output yang seharusnya

Test integrasi baru harus membuktikan, untuk **satu** webhook `PAID`:

| Yang diperiksa | Nilai benar |
|---|---|
| Status payment | `PAID` |
| Baris audit | bertambah tepat 1 |
| Event outbox | ada `payment.paid` |
| `chai.follow_up_job` tertaut | status berubah dari `PENDING`, **tepat sekali** |
| `chai.invoice.status` | `paid` |
| Baris notifikasi | bertambah tepat 1 |

Dan untuk webhook `PAID` **kedua dengan event id sama**: semua angka di atas
**tidak bertambah lagi**. Kalau test hanya menguji kasus pertama tanpa menguji
pengulangan, FASE 7 **belum** memenuhi definisi selesai — dedup adalah inti
persyaratannya.

Verifikasi test itu benar-benar ada:
```
Get-ChildItem apps\api\test -Recurse -Include *.ts | Select-String -Pattern "payment.paid|markInvoicePaid" | Select-Object -First 20
```

## 3.2 FASE 8 dan sesudahnya

Untuk fase lain, sumber persyaratan ada di:
- `docs/plans/2026-07-29-rencana-penyelesaian-lengkap.md` (FASE 1–14)
- `docs/plans/2026-07-31-rencana-fitur-kurang-fase-15-26.md` (FASE 15–26)
- `docs/plans/2026-07-31-rencana-fase-27-33.md` (FASE 27–33)

Cari bagian **"Definisi selesai"** pada fase yang diuji. Itu daftar periksa
Anda. Untuk setiap butir di sana, cari bukti berupa test yang benar-benar
menguji hal itu — bukan hanya kode yang "kelihatannya" melakukannya.

**Aturan umum**: kalau "Definisi selesai" menyebut sesuatu yang tidak bisa
Anda buktikan dengan menjalankan test, fase itu **belum** selesai. Kode yang
ada tanpa test yang menjalankannya adalah pola kegagalan paling sering di
proyek ini (beberapa modul lengkap ternyata nol pemanggil produksi).

---

# BAGIAN 4 — OUTPUT YANG SEHARUSNYA (contoh benar vs salah)

## 4.1 Typecheck

**Benar:**
```
 Tasks:    23 successful, 23 total
EXIT=0
```

**Salah — ada error tipe:**
```
src/modules/order/postgres-order.repository.ts(82,46): error TS1361: ...
Exit status 2
EXIT=2
```
→ TIDAK LULUS. Catat setiap baris error di laporan.

## 4.2 Lint

**Benar:**
```
 Tasks:    23 successful, 23 total
EXIT=0
```

**Salah — pelanggaran boundary:**
```
apps\api\src\modules\payments\payments.controller.ts
  23:1  error  '../order/order.repository' import is restricted ...  no-restricted-imports
EXIT=1
```
→ TIDAK LULUS. Ini pelanggaran arsitektur, bukan gaya penulisan.

## 4.3 Test

**Benar:**
```
 Test Files  37 passed (37)
      Tests  147 passed (147)
EXIT=0
```

**Salah — jumlah turun dari baseline:**
```
 Test Files  36 passed (36)
      Tests  143 passed (143)
EXIT=0
```
→ TIDAK LULUS **walaupun exit 0**. Baseline 37/147, ini 36/143. Ada test
hilang. Cari penyebabnya dengan Langkah 3.

**Salah — ada yang di-skip:**
```
 Test Files  37 passed (37)
      Tests  145 passed | 2 skipped (147)
EXIT=0
```
→ TIDAK LULUS. Skip dilarang.

## 4.4 Migrasi

**Benar** — migrasi jalan bersih dari database kosong:
```
EXIT=0
```

**Salah — kepemilikan role keliru:**
```
PostgresError: must be owner of table connector_secrets
EXIT=1
```
→ TIDAK LULUS. Ini bug nyata yang pernah terjadi di proyek ini: `SET ROLE
chai_migration_owner` dipakai untuk `ALTER TABLE` pada tabel yang dimiliki
role lain. Laporkan nama tabelnya.

## 4.5 Smoke

**Benar:**
```
  89 passed (34.6s)
EXIT=0
```

**Salah:**
```
  4 failed
    [chromium] › tests\e2e\payment-flow.spec.ts:10:7 › payment flow › create checkout session
  85 passed (32.2s)
EXIT=1
```
→ TIDAK LULUS. Catat nama setiap test yang gagal, bukan hanya jumlahnya.

---

# BAGIAN 5 — MEMBEDAKAN BUG KODE DARI MASALAH ENVIRONMENT

Ini penting: melaporkan masalah environment sebagai bug kode membuang waktu
manusia, dan sebaliknya menutupi bug nyata.

| Gejala | Kemungkinan | Cara memastikan | Tindakan |
|---|---|---|---|
| `Cannot find module` / `MODULE_NOT_FOUND` pada native binding (mis. `rolldown`) | Environment (cache build) | Jalankan ulang perintah yang sama | Kalau lolos di percobaan kedua, itu flakiness yang **sudah diketahui** — catat, bukan kegagalan |
| Testcontainers timeout / `connect ECONNREFUSED` | Environment (Docker) | `docker ps` | Nyalakan Docker, jalankan ulang |
| Port sudah dipakai (`EADDRINUSE`) | Environment (proses menggantung) | `Get-Process -Name node` | Catat; jangan kill sembarangan kalau tidak yakin |
| `must be owner of table` | **Bug kode** (migrasi) | Terjadi berulang dari database bersih | Laporkan sebagai bug |
| Test gagal dengan `expected 400 to be 201` | **Bug kode** | Terjadi berulang | Laporkan sebagai bug |
| `error TS...` dari typecheck | **Bug kode** | Deterministik, selalu sama | Laporkan sebagai bug |
| Lint `no-restricted-imports` | **Bug kode** (arsitektur) | Deterministik | Laporkan sebagai bug |
| Playwright gagal dengan screenshot berbeda tiap run | Bisa keduanya | Jalankan 2x | Kalau hasil beda tiap run, catat sebagai flaky, bukan bug pasti |

**Aturan praktis**: bug kode bersifat **deterministik** (gagal sama setiap
kali). Masalah environment biasanya **berubah** antar percobaan. Kalau ragu,
jalankan perintah yang sama 2 kali dan bandingkan.

**Jangan** menjalankan lebih dari 2 kali untuk "mencari" hasil hijau. Kalau
gagal 2 kali dengan pesan sama, itu bug — laporkan.

---

# BAGIAN 6 — TEMPLATE LAPORAN (isi bagian dalam kurung siku)

```markdown
# Laporan Pengujian — FASE [nomor]

Diuji: [tanggal, jam]
Penguji: agent penguji independen
Objek uji: klaim penyelesaian FASE [nomor] oleh agent pelaksana

## PUTUSAN: [LULUS / TIDAK LULUS]

[Satu paragraf: kalau TIDAK LULUS, sebutkan penyebab utamanya di sini,
jangan kubur di bawah.]

## 1. Hasil 9 gerbang

| # | Gerbang | Hasil nyata | Baseline wajib | Status |
|---|---|---|---|---|
| 1 | typecheck | [exit ?, ?/? paket] | exit 0, 23/23 | [OK/GAGAL] |
| 2 | lint | [...] | exit 0, 23/23 | [...] |
| 3 | build --force | [...] | exit 0, 23/23 | [...] |
| 4 | test | [...] | exit 0, 36/36, api ≥206 | [...] |
| 5 | test:integration api | [...] | exit 0, ≥37/≥147 | [...] |
| 6 | test:integration domain | [...] | exit 0, ≥8/≥51 | [...] |
| 7 | test:integration database | [...] | exit 0, ≥13/≥44 | [...] |
| 8 | verify:infra | [...] | exit 0, 8/8 | [...] |
| 9 | test:smoke | [...] | exit 0, ≥89, 0 gagal | [...] |

## 2. Keluaran literal gerbang yang GAGAL

[Tempelkan output apa adanya. Kalau semua lulus, tulis "Tidak ada."]

## 3. Pelanggaran aturan keras

| Aturan | Ditemukan? | Bukti |
|---|---|---|
| Test dihapus | [ya/tidak] | [baris diff] |
| Test di-skip | [ya/tidak] | [file:baris] |
| `eslint-disable` | [ya/tidak] | [...] |
| `any` | [ya/tidak] | [...] |
| Non-null `!` | [ya/tidak] | [...] |
| Dependency baru tanpa alasan/pin | [ya/tidak] | [...] |
| Migrasi lama disunting | [ya/tidak] | [...] |
| Tabel tenant tanpa RLS lengkap | [ya/tidak] | [...] |
| Constructor tanpa `@Inject()` | [ya/tidak] | [...] |
| Impor lintas-modul tanpa port | [ya/tidak] | [...] |

## 4. Verifikasi struktur fase (BAGIAN 3)

[Untuk setiap butir struktur yang diminta BAGIAN 3 pada fase ini: perintah
yang dijalankan, hasilnya, dan apakah memenuhi.]

## 5. Definisi selesai

[Ambil daftar "Definisi selesai" dari dokumen rencana fase itu. Untuk setiap
butir: TERBUKTI (sebut test mana yang membuktikannya) / TIDAK TERBUKTI.]

## 6. Selisih antara klaim dan kenyataan

[File yang berubah tapi tidak diklaim, atau diklaim tapi tidak berubah.
Angka yang diklaim pelaksana vs angka yang Anda dapat.]

## 7. Temuan tambahan

[Bug atau masalah yang Anda temukan yang tidak berkaitan langsung dengan
fase ini. Jangan perbaiki — hanya laporkan, dengan bukti perintah.]

## 8. Masalah environment (bukan bug kode)

[Kalau ada, sebutkan dan jelaskan kenapa Anda menyimpulkan itu environment
dan bukan bug — lihat BAGIAN 5.]

## 9. Yang TIDAK bisa saya verifikasi

[Jujurlah di sini. Contoh: "CI tidak bisa diuji karena `git remote` kosong."
Bagian ini lebih berguna daripada klaim palsu bahwa semuanya terverifikasi.]
```

---

# BAGIAN 7 — MASALAH UMUM DAN CARA MENANGANINYA

| Masalah | Sebab | Tindakan |
|---|---|---|
| `Get-ChildItem . -Recurse` mengeluarkan ratusan error path | Menelusuri symlink `node_modules/.pnpm` | Sebutkan folder eksplisit: `Get-ChildItem apps,packages,workers -Recurse` |
| Pencarian menghasilkan angka sangat besar (ribuan) | `node_modules` ikut terpindai (setiap paket pnpm punya sendiri) | Tambahkan `\| Where-Object { $_.FullName -notmatch '\\node_modules\\' }` |
| `Select-String \| Select-Object -First N` mengeluarkan baris kosong | Masalah format objek PowerShell | Pakai `\| Select-Object -ExpandProperty Line` |
| Test integrasi gagal semua sekaligus | Migrasi gagal → tidak ada skema | Baca error migrasi paling atas, itu akar masalahnya |
| `test:smoke` gagal karena server belum siap | Playwright menyalakan server sendiri, butuh waktu | Jalankan ulang sekali; kalau tetap, laporkan |
| Angka test tidak cocok dengan baseline padahal semua hijau | Baseline dokumen ini sudah basi (fase berikutnya menambah test) | Angka **lebih tinggi** itu benar. Hanya angka **lebih rendah** yang masalah |
| Tidak yakin apakah suatu temuan penting | — | Laporkan saja dengan bukti. Penguji yang melaporkan terlalu banyak lebih berguna daripada yang menutupi |

---

# BAGIAN 8 — YANG TIDAK BOLEH ANDA SIMPULKAN

Beberapa hal di proyek ini **memang** belum ada dan **bukan** kegagalan
pelaksana. Jangan laporkan sebagai bug:

| Kondisi | Status sebenarnya |
|---|---|
| CI tidak pernah berjalan | `git remote` kosong — terblokir pemilik repo, bukan pelaksana (FASE 13) |
| Tidak ada pipeline balasan AI otomatis | Belum dibangun, tercatat sebagai FASE 31 |
| `services/ai-gateway` nol pemanggil produksi | Temuan yang sudah diketahui dan didokumentasikan (T-01 di `docs/audit/2026-07-31/TEMUAN-AUDIT-LANJUTAN.md`) |
| `inbox-dispatcher` tidak memproses apa pun | Utang yang sudah didokumentasikan jujur di komentar kodenya |
| Tidak ada halaman pendaftaran mandiri | Memang tidak ada fitur itu |
| Banyak `@Body()` tanpa DTO di controller lain | Temuan T-04, dijadwalkan di FASE 27 — bukan tanggung jawab fase yang Anda uji |
| Nol fact table analytics | Temuan T-07, dijadwalkan FASE 32 |

Kalau Anda menemukan salah satu di atas, cukup sebut di bagian "Temuan
tambahan" sebagai konfirmasi bahwa kondisinya belum berubah — jangan jadikan
alasan TIDAK LULUS untuk fase yang sedang diuji.

---

# BAGIAN 9 — RINGKASAN SATU HALAMAN

Kalau Anda hanya punya waktu terbatas, kerjakan ini:

```
cd D:\Games\Agent\Chai
git status --short
git diff --stat
docker ps
pnpm run typecheck ; Write-Output "EXIT=$LASTEXITCODE"
pnpm run lint ; Write-Output "EXIT=$LASTEXITCODE"
pnpm run build --force ; Write-Output "EXIT=$LASTEXITCODE"
pnpm run test ; Write-Output "EXIT=$LASTEXITCODE"
pnpm --filter @chai/api run test:integration ; Write-Output "EXIT=$LASTEXITCODE"
pnpm --filter @chai/domain run test:integration ; Write-Output "EXIT=$LASTEXITCODE"
pnpm --filter @chai/database run test:integration ; Write-Output "EXIT=$LASTEXITCODE"
pnpm run verify:infra ; Write-Output "EXIT=$LASTEXITCODE"
pnpm run test:smoke ; Write-Output "EXIT=$LASTEXITCODE"
```

Lalu:
1. Semua exit 0? Kalau tidak, TIDAK LULUS — tempelkan output yang gagal.
2. Jumlah test tidak turun dari BAGIAN 1? Kalau turun, TIDAK LULUS.
3. Jalankan Langkah 3 dan 4 (test dihapus/di-skip, pelanggaran aturan keras).
4. Jalankan verifikasi struktur BAGIAN 3 untuk fase yang diuji.
5. Tulis laporan template BAGIAN 6.

**Jangan perbaiki apa pun. Laporkan.**
