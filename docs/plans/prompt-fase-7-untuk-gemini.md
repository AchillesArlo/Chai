# Prompt untuk Gemini — FASE 7: on-PAID lengkap (REQ-17-019)

Anda mengerjakan repo `Chai` di `D:\Games\Agent\Chai`. Ikuti dokumen ini
**berurutan, langkah per langkah**. Jangan lompat ke langkah berikutnya
sebelum langkah sekarang terverifikasi dengan perintah nyata.

## LANGKAH 0 — Baca dulu (wajib, sebelum menulis kode apa pun)

Baca berkas ini secara berurutan:

1. `AGENTS.md` (root repo)
2. `docs/plans/2026-07-31-panduan-eksekusi-agent-fase-5-26.md` — BAGIAN 0
   penuh, dan BAGIAN 1 Langkah 1 sampai 9. **Ikuti protokol 9 langkah itu**
   untuk sesi ini secara harfiah.
3. `docs/plans/2026-07-29-rencana-penyelesaian-lengkap.md` bagian
   `## FASE 7` (cari dengan `Select-String -Path
   docs\plans\2026-07-29-rencana-penyelesaian-lengkap.md -Pattern "^## FASE
   7"`) — itu sumber kebenaran detail teknis. Dokumen ini (prompt) hanya
   ringkasan dan keputusan yang sudah diambil.

Setelah membaca ketiganya, lanjut ke LANGKAH 1. **Jangan menulis kode di
langkah ini.**

## LANGKAH 1 — Cek kondisi nyata sebelum percaya dokumen apa pun

Jalankan tepat seperti ini, satu per satu:

```
cd D:\Games\Agent\Chai
```

```
Get-ChildItem packages\database\migrations\*.sql | Sort-Object Name | Select-Object -Last 3 -ExpandProperty Name
```

Catat nomor migrasi terakhir. Migrasi baru Anda = nomor itu + 1. **Jangan
memakai nomor migrasi yang disebut di bagian manapun dokumen ini atau
dokumen rencana — semuanya bisa basi karena sesi lain mungkin sudah
menambah migrasi baru.**

```
Select-String -Path docs\plans\2026-07-29-rencana-penyelesaian-lengkap.md -Pattern "^## FASE" | Select-Object -ExpandProperty Line
```

Pastikan baris `FASE 6` bertanda `SELESAI` dan baris `FASE 7` **tidak**
bertanda `SELESAI`. Kalau `FASE 7` sudah bertanda `SELESAI`, **berhenti di
sini** — laporkan bahwa fase ini sudah dikerjakan sesi lain, jangan lanjut.

```
git status --short
```

Kalau ada file yang baru diubah dalam beberapa jam terakhir dan berkaitan
dengan payment/order/invoice/follow_up_job, **berhenti dan laporkan** —
kemungkinan sesi lain sedang mengerjakan area yang sama.

```
docker ps
```

Pastikan ada output (Docker aktif). Anda akan membutuhkannya untuk test
integrasi Postgres nanti.

**Jangan lanjut ke LANGKAH 2 sebelum keempat perintah di atas dijalankan dan
hasilnya sesuai (FASE 6 selesai, FASE 7 belum, tidak ada konflik sesi lain,
Docker aktif).**

## LANGKAH 2 — Baca 4 file kode sebelum menulis apa pun

Baca isi lengkap 4 file ini (pakai pembaca file, bukan hanya grep):

1. `packages/domain/src/payments/reminders.ts`
2. `apps/api/src/modules/payments/payments.controller.ts`
3. `apps/api/src/modules/payments/postgres-payments.repository.ts`
4. `apps/api/src/modules/shared/action-tool.port.ts`

Setelah membaca, jalankan ini untuk menemukan tabel `follow_up_job`:

```
Select-String -Path packages\database\migrations\*.sql -Pattern "CREATE TABLE.*follow_up_job"
```

Buka file yang ditemukan, baca definisi tabelnya, dan cek apakah file itu
memakai `SET ROLE chai_migration_owner` di baris pertama. **Catat
jawabannya (ya/tidak)** — Anda akan memakainya di LANGKAH 4.

## Keputusan yang SUDAH diambil (jangan tanya ulang, jangan cari alternatif)

Dokumen rencana FASE 7 menyebut "4 keputusan manusia". Tiga sudah dijawab:

1. **Entitas bisnis yang dibayar** = `chai.order` + `chai.order_item` +
   `chai.invoice`. Tabel ini sudah ada (dibuat FASE 6). **Jangan buat model
   data baru untuk ini.**
2. **Bentuk referensi** = kolom nullable `order_id`/`invoice_id` di
   `chai.payment`. Kolom ini sudah ada. **Jangan buat tabel penghubung baru.**
3. **Atribusi** = kolom `channel_id`/`campaign_id`/`conversation_id`/
   `agent_id` di `chai.order`. Kolom ini sudah ada. **Jangan buat tabel
   penghubung baru untuk atribusi.**

Keputusan ke-4 (jalur notifikasi) sudah diberi default oleh manusia:

4. **Notifikasi = in-app ke pemilik tenant saja**, lewat
   `NotificationRepository.createNotification` yang sudah ada di
   `apps/api/src/modules/notification/notification.repository.ts`. **Jangan**
   mengirim ke `contact` lewat channel eksternal (WhatsApp/email) — itu di
   luar scope fase ini. Tulis komentar di kode:
   `// FASE 7: notifikasi in-app saja, channel ke contact di luar scope`.

## LANGKAH 3 — Migrasi baru: tambah kolom `payment_id` ke `follow_up_job`

Buat SATU file migrasi baru (nomor dari LANGKAH 1). Isinya HANYA:

```sql
ALTER TABLE chai.follow_up_job
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES chai.payment(id);
```

**Kalau jawaban LANGKAH 2 soal `SET ROLE` adalah "ya"** (tabel dimiliki
`chai_migration_owner`): bungkus dengan `SET ROLE chai_migration_owner;` di
awal file dan `RESET ROLE;` di akhir, tiru pola migrasi lain yang serupa.

**Kalau jawabannya "tidak"**: JANGAN pakai `SET ROLE` sama sekali di file
ini. Ini persis bug yang pernah terjadi: `ALTER TABLE` dengan `SET ROLE` ke
role yang bukan pemilik tabel gagal keras dengan pesan
`must be owner of table`.

Setelah menulis file, verifikasi migrasi ini bisa jalan:

```
pnpm --filter @chai/database run migrate
```

Perintah ini harus exit 0. **Jangan lanjut ke LANGKAH 4 kalau perintah ini
gagal.** Kalau gagal dengan pesan `must be owner of table`, itu berarti
jawaban Anda di LANGKAH 2 soal `SET ROLE` salah — balik cek lagi, jangan
menambah `SET ROLE` secara asal coba-coba.

## LANGKAH 4 — Ubah `stopPaymentReminders` jadi join FK sungguhan

Buka `packages/domain/src/payments/reminders.ts`. Baca komentar `ponytail:`
di file itu — komentar itu sudah menjelaskan jalur upgrade yang harus Anda
lakukan.

Ubah query di dalam fungsi `stopPaymentReminders` dari mencocokkan
`payload ->> 'paymentExternalId'` (string di JSON) menjadi
`WHERE payment_id = <parameter>` (kolom baru dari LANGKAH 3). Pertahankan
kondisi `status = 'PENDING'` yang sudah ada — jangan hapus itu.

**Jangan ubah signature fungsi publik ini kecuali benar-benar perlu.** Kalau
signature harus berubah (misalnya parameter `paymentExternalId` diganti jadi
`paymentId`), cari semua pemanggilnya dulu:

```
Get-ChildItem apps,packages,workers -Recurse -Include *.ts | Where-Object { $_.FullName -notmatch '\\node_modules\\' } | Select-String -Pattern "stopPaymentReminders"
```

Perbaiki SETIAP pemanggil yang ditemukan. Jangan biarkan satu pun yang masih
memanggil dengan parameter lama.

**Gerbang sebelum lanjut**:
```
pnpm --filter @chai/domain run typecheck
```
Harus exit 0.

## LANGKAH 5 — Buat reminder saat checkout dibuat

Buka `apps/api/src/modules/payments/payments.controller.ts`, method
`createCheckout`. Setelah sesi checkout berhasil dibuat, jadwalkan SATU baris
baru di `chai.follow_up_job` dengan `payment_id` diisi id payment yang baru
dibuat.

**Jangan pakai endpoint automation generik** (`apps/api/src/modules/automation/`)
untuk ini — itu menerima payload bebas, dan tujuan LANGKAH 4 adalah supaya
reminder terhubung lewat kolom asli, bukan payload tebak-tebakan.

Kalau Anda butuh melihat contoh cara menulis baris ke `chai.follow_up_job`
dari kode TypeScript, cari dulu siapa yang sudah melakukannya:

```
Get-ChildItem apps,packages,workers -Recurse -Include *.ts | Where-Object { $_.FullName -notmatch '\\node_modules\\' } | Select-String -Pattern "INSERT INTO chai.follow_up_job"
```

Tiru pola SQL-nya (nama kolom, cara generate `id`, cara isi `due_at`).

**Gerbang sebelum lanjut**:
```
pnpm --filter @chai/api run typecheck
pnpm --filter @chai/api run lint
```
Keduanya harus exit 0.

## LANGKAH 6 — Efek on-PAID

**Jangan kerjakan langkah ini sebelum LANGKAH 3, 4, 5 masing-masing
terverifikasi hijau.**

**Koreksi penting**: dokumen rencana FASE 7 menyebut "kedua produsen status
memanggil satu helper bersama". Setelah membaca kode nyata di LANGKAH 0,
klaim itu tidak sepenuhnya akurat — `commitBusinessMutation` dipanggil
**langsung inline** di dua tempat berbeda, bukan lewat satu helper terpisah:

1. `apps/api/src/modules/payments/postgres-payments.repository.ts`, di dalam
   method `applyWebhook`, pada blok yang memanggil `commitBusinessMutation(tx, {...})`.
2. `workers/payment-worker/src/reconcile.ts`, pada blok yang serupa.

**Jangan mencari "helper bersama" — tidak ada.** Ada kendala arsitektur yang
harus Anda perhatikan sebelum menulis kode: `workers/payment-worker` adalah
package terpisah yang **hanya** boleh mengimpor dari `@chai/database` dan
`@chai/domain` — ia **tidak bisa** mengimpor apa pun dari `apps/api`
(termasuk port di `action-tool.port.ts`). Verifikasi ini sendiri:

```
Select-String -Path workers\payment-worker\src\*.ts -Pattern "^import"
```

Konsekuensinya, efek 6a-6c harus diimplementasikan **dua kali dengan cara
berbeda**:

- **Di `apps/api/src/modules/payments/postgres-payments.repository.ts`**:
  boleh memanggil port (`PaymentOrderPort`, `PaymentNotificationPort` — lihat
  6a/6b di bawah), karena file ini bagian dari `apps/api`.
- **Di `workers/payment-worker/src/reconcile.ts`**: tulis SQL langsung di
  dalam transaksi yang sudah ada (`UPDATE chai.order`/`chai.invoice`, `INSERT
  INTO chai.follow_up_job` untuk membatalkan reminder, `INSERT INTO` tabel
  notification). Cari nama tabel notification yang benar dengan:
  ```
  Select-String -Path packages\database\migrations\*.sql -Pattern "CREATE TABLE.*notification"
  ```
  Tiru gaya SQL yang sudah ada di `reconcile.ts` sendiri (baca isinya dulu di
  LANGKAH 0 sebelum menulis).

Ini bukan duplikasi yang salah — ini konsekuensi dari boundary package yang
sudah ada di proyek. **Jangan mencoba membuat `workers/payment-worker`
mengimpor dari `apps/api`** untuk "menghindari duplikasi" — itu akan
melanggar batas package dan kemungkinan besar gagal build.

Tiga efek yang ditambahkan, semua di dalam transaksi `commitBusinessMutation`
yang sudah ada di masing-masing tempat (jangan buat transaksi baru).
**Sub-bagian 6a dan 6b di bawah menjelaskan jalur `apps/api` (lewat port).
Untuk `workers/payment-worker/src/reconcile.ts`, jangan pakai port apa
pun — tulis SQL langsung seperti dijelaskan di atas.**

### 6a. Update status order/invoice jadi `paid` (jalur `apps/api`)

Method `markInvoicePaid` sudah ada di
`apps/api/src/modules/order/order.repository.ts`. **Jangan** impor
`OrderRepository` langsung dari modul payments — itu dilarang aturan boundary
proyek (`no-restricted-imports`).

Buka `apps/api/src/modules/shared/action-tool.port.ts`. Cari class
`PaymentOrderPort`. Tambahkan SATU method baru ke port ini:

```typescript
abstract markInvoicePaid(tenantId: string, invoiceId: string): Promise<void>;
```

Buka `apps/api/src/modules/order/order-payment.adapter.ts`. Implementasikan
method baru itu, delegasikan ke `this.repository.markInvoicePaid(...)`.

Di fungsi `on-paid-effects.ts` yang Anda tulis untuk jalur `apps/api`, panggil
`this.orders.markInvoicePaid(tenantId, invoiceId)` **hanya kalau**
`payment.invoice_id` tidak null.

### 6b. Kirim notifikasi in-app (jalur `apps/api`)

`NotificationRepository` ada di
`apps/api/src/modules/notification/notification.repository.ts`. Modul
payments sekarang butuh port baru untuk memanggilnya (sama seperti 6a).

Tambahkan interface dan abstract class baru di `action-tool.port.ts`
(jangan taruh di file lain):

```typescript
export interface PaymentNotificationInput {
  message: string;
  title: string;
}

export abstract class PaymentNotificationPort {
  abstract notify(tenantId: string, input: PaymentNotificationInput): Promise<void>;
}
```

Buat file baru `apps/api/src/modules/notification/notification-payment.adapter.ts`
yang mengimplementasikan port ini, delegasi ke
`NotificationRepository.createNotification`. Tiru struktur adapter yang
sudah ada seperti `apps/api/src/modules/order/order-payment.adapter.ts`
(baca file itu sebagai contoh sebelum menulis yang baru).

Daftarkan provider baru ini di `NotificationModule`
(`apps/api/src/modules/notification/notification.module.ts`) dan pastikan
`PaymentsModule` mengimpor `NotificationModule` (tiru cara `PaymentsModule`
sudah mengimpor `OrderModule` — baca `payments.module.ts` untuk contohnya).

Di fungsi `on-paid-effects.ts` (jalur `apps/api`), panggil port ini dengan pesan sederhana, contoh:
`title: 'Pembayaran diterima', message: <ringkasan amount+externalId>`.

### 6c. Atribusi

Jalankan ini untuk cek apakah atribusi sudah terisi saat order dibuat:

```
Get-ChildItem apps\api\src\modules\order -Recurse -Include *.ts | Select-String -Pattern "channel_id|channelId"
```

Kalau hasilnya menunjukkan `createOrder`/`PostgresOrderRepository` sudah
mengisi kolom itu dari input, **Anda tidak perlu menulis kode baru** untuk
atribusi — cukup pastikan kolom itu ikut terbaca di response/event on-PAID.
Kalau kolom itu ternyata TIDAK pernah diisi di mana pun, laporkan temuan ini
sebelum menambah logika baru — itu di luar scope minimal fase ini.

**Gerbang sebelum lanjut**:
```
pnpm --filter @chai/api run typecheck
pnpm --filter @chai/api run lint
```
Keduanya harus exit 0. **Perbaiki dulu semua error sebelum ke LANGKAH 7.**

## LANGKAH 7 — Cegah dobel efek pada webhook yang diulang

`chai.payment_webhook_event` (dari FASE 3) sudah mendedup webhook berdasarkan
`provider_event_id`. Verifikasi jalur baru Anda di LANGKAH 6 juga hanya
berjalan sekali dengan cara ini:

```
Select-String -Path packages\connectors\src\webhook-verification.ts -Pattern "export"
```

Baca fungsi yang ditemukan. Pastikan efek on-PAID Anda di LANGKAH 6 (baik
fungsi `on-paid-effects.ts` di jalur `apps/api`, maupun SQL langsung di jalur
`reconcile.ts`) **dipanggil dari dalam** blok yang sudah lolos dedup ini,
bukan di luar/sebelum itu. Kalau strukturnya sudah begitu (efek dipanggil
setelah dedup lolos), Anda tidak perlu menambah apa pun di sini — cukup
konfirmasi.

## LANGKAH 8 — Referensi bisnis dalam idempotency key (REQ-17-024)

```
Select-String -Path packages\database\migrations\*.sql -Pattern "idempotency_key" -Context 0,2 | Select-String -Pattern "payment"
```

Perintah di atas mencari baris yang menyebut `idempotency_key` lalu menyaring
yang berkaitan dengan tabel `payment`. Baca hasilnya — kemungkinan besar Anda
menemukan bentuk `CREATE UNIQUE INDEX ... ON chai.payment(tenant_id,
idempotency_key) WHERE idempotency_key IS NOT NULL`, bukan `UNIQUE(...)`
inline. Kalau index itu **tidak** menyertakan `order_id`/`invoice_id`,
tambahkan migrasi baru (nomor lanjutan dari LANGKAH 3) yang membuat index
unik baru menyertakan kolom itu, dan hapus index lama dengan `DROP INDEX`.
Kalau index sudah menyertakannya, tulis di laporan akhir bahwa langkah ini
sudah terpenuhi tanpa perubahan.

## LANGKAH 9 — Tulis test

Tiru pola test yang sudah ada:
- `apps/api/test/integration/payments.integration.test.ts` untuk pola test
  integrasi Postgres.
- `apps/api/test/payments.e2e.test.ts` untuk pola test e2e HTTP.

Tulis SATU test integrasi baru yang membuktikan, untuk satu webhook `PAID`:
1. `chai.order`/`chai.invoice` berubah jadi `paid`,
2. baris `chai.follow_up_job` yang tertaut `payment_id` berubah status
   (dibatalkan/selesai) **tepat sekali**,
3. ada baris notifikasi baru,
4. webhook `PAID` yang sama diulang (event id sama) TIDAK menghasilkan efek
   kedua pada ketiga hal di atas.

**Jangan hapus atau skip test lama.** Kalau test lama gagal karena bentuk
response berubah, perbaiki test itu agar tetap menguji maksud aslinya.

## LANGKAH 10 — Gerbang verifikasi akhir

Jalankan SATU PER SATU, tempelkan hasil (termasuk angka exit code) di laporan
akhir Anda:

```
pnpm run typecheck
```
```
pnpm run lint
```
```
pnpm run build --force
```
```
pnpm run test
```
```
pnpm --filter @chai/api run test:integration
```
```
pnpm --filter @chai/domain run test:integration
```
```
pnpm run test:smoke
```

**Semua harus exit 0.** Kalau salah satu gagal, perbaiki dulu sebelum
melanjutkan ke perintah berikutnya — jangan jalankan semuanya lalu
mengumpulkan daftar kegagalan di akhir.

## Aturan keras proyek (berlaku di semua langkah di atas)

- Tanpa `eslint-disable` dalam bentuk apa pun.
- Tanpa `any`.
- Tanpa `!` (non-null assertion) — pakai `requireRow` atau pengecekan
  eksplisit (`if (!x) throw ...`).
- Jangan skip atau hapus test. Jumlah test hanya boleh naik dari baseline.
- Jangan sunting migrasi yang sudah ada sebelum sesi ini. Migrasi baru Anda
  = nomor dari LANGKAH 1, ditambah 1 setiap file baru.
- Jangan hapus repository in-memory (`InMemory...Repository`). Setiap
  repository baru wajib 3 bentuk: abstract class, in-memory, Postgres.
- Tanpa dependency baru.
- Uang selalu integer minor units (kolom `_cents`) plus kode mata uang.
- `PAID` tidak pernah mundur ke status lain.
- Setiap parameter constructor NestJS wajib `@Inject(Token)` eksplisit —
  tanpa itu, aplikasi resolve `undefined` saat build produksi TANPA error.
- Modul tidak boleh impor repository modul lain secara langsung — wajib
  lewat port di `modules/shared/action-tool.port.ts`.

## Kalau menemukan sesuatu yang tidak cocok dengan dokumen ini

**Berhenti dan laporkan**, jangan menebak, kalau:
- FASE 7 di dokumen rencana sudah bertanda SELESAI (lihat LANGKAH 1).
- Kolom/tabel yang disebut dokumen ini ternyata tidak ada.
- Satu gerbang verifikasi gagal 2 kali dengan pendekatan berbeda dan Anda
  tidak tahu sebabnya.
- Ada keputusan produk baru yang belum tercakup di bagian "Keputusan yang
  SUDAH diambil" di atas.

Kalau semua langkah selesai dan semua gerbang exit 0, tulis laporan akhir
berisi: apa yang dibangun, file mana yang diubah/dibuat, hasil literal
LANGKAH 10, dan asumsi apa (kalau ada) yang Anda catat di komentar kode.
