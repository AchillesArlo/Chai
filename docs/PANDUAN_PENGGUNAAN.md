# Panduan Penggunaan — Chai Platform

> Ditulis 2026-07-27 pada commit `b9a5810`, setelah environment dinyalakan dari
> nol total (image dibangun ulang tanpa cache, volume database benar-benar
> kosong) dan setiap langkah di bawah diverifikasi sendiri lewat perintah
> nyata — bukan disalin dari dokumentasi lama.

## Apa ini

Chai adalah platform AI omnichannel multi-tenant: satu inbox untuk percakapan
pelanggan lintas kanal, agen AI di belakang policy engine, plus modul
pembayaran dan logistik opsional per tenant. Ada dua aplikasi web:

- **Client Portal** — dipakai tenant (pemilik bisnis): inbox, pelanggan,
  leads, booking, pembayaran, pengetahuan, tim.
- **Owner Console** — dipakai pemilik platform: kelola tenant, AI operations,
  automation, marketplace connector, audit, reliability.

## Prasyarat

- Docker Desktop terinstal dan berjalan.
- Node 24, pnpm 11.13.1 (untuk menjalankan skrip seed dari host).
- Repo di `D:\Games\Agent\Chai`, sudah `pnpm install`.

## 1. Menyalakan dari nol

Semua perintah dijalankan dari root repo, PowerShell.

```powershell
# Bangun image dari kode terbaru
docker build -f infra/Dockerfile -t chai-final:local .

# Nyalakan seluruh stack (database, API, kedua frontend, realtime, reverse proxy)
docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env.example `
  up -d postgres redis migrate api client-portal owner-console realtime-gateway nginx
```

Tunggu sekitar satu menit, lalu pastikan semua `healthy`:

```powershell
docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env.example ps
```

Keluaran yang benar — **setiap** baris `State` harus `running` dan `Health`
harus `healthy` (bukan `starting` atau `unhealthy`):

```
NAME                          STATE     HEALTH
staging-api-1/2/3             running   healthy
staging-client-portal-1/2     running   healthy
staging-owner-console-1/2     running   healthy
staging-realtime-gateway-1/2  running   healthy
staging-nginx-1               running   healthy
staging-postgres-1            running   healthy
staging-redis-1               running   healthy
```

Kalau `migrate` gagal atau ada service `unhealthy` setelah lebih dari 2 menit,
lihat bagian **Pemecahan Masalah** di bawah sebelum lanjut.

## 2. Membuat akun pertama

Tidak ada halaman pendaftaran mandiri di aplikasi ini — akun pertama dibuat
lewat skrip seed dari host:

```powershell
$env:DATABASE_URL = "postgres://chai_admin:change-me-staging-password@localhost:5432/chai"
pnpm --filter @chai/database exec tsx src/seed-website-test-accounts.ts
```

Keluaran mencetak kredensial siap pakai (nilai tetap, sama setiap kali skrip
ini dijalankan terhadap database baru):

```json
{
  "ok": true,
  "tenantId": "01936b40-0000-7000-8000-000000000001",
  "clientPortal": { "email": "owner@websitetest.chai.local", "password": "WebsiteTest#2026" },
  "ownerConsole": { "email": "founder@websitetest.chai.local", "password": "WebsiteTest#2026" }
}
```

Aman dijalankan berulang kali (idempoten) — kalau kamu butuh kredensial ini
lagi nanti, jalankan ulang saja.

## 3. Masuk ke aplikasi

| Aplikasi | URL | Email | Password |
|---|---|---|---|
| Client Portal | `http://localhost/portal/login` | `owner@websitetest.chai.local` | `WebsiteTest#2026` |
| Owner Console | `http://localhost/login` | `founder@websitetest.chai.local` | `WebsiteTest#2026` |

Keduanya di belakang satu reverse proxy (nginx) pada port 80 — client portal
di path `/portal/`, owner console di path root. Kedua halaman login punya
tautan silang satu sama lain ("Owner console sign-in" / "Client portal
sign-in") kalau kamu salah masuk.

Catatan soal akun founder: statusnya `mfaState: REQUIRED` — sebagian aksi
sensitif di Owner Console akan meminta verifikasi dua langkah (TOTP) sesuai
kebijakan keamanan platform. Ini bukan gangguan, itu memang berlaku untuk
akun pemilik platform.

## 4. Memakai Client Portal

Setelah login, kamu diarahkan ke inbox. Menu utama yang tersedia:

- **Inbox** — percakapan pelanggan lintas kanal (WhatsApp, dsb.). Tenant baru
  akan kosong sampai ada pesan masuk lewat konektor kanal.
- **Customers** — daftar kontak pelanggan.
- **Leads** — pipeline calon pelanggan.
- **Bookings** — jadwal temu/appointment.
- **Payments** — daftar transaksi dan pembuatan link pembayaran.
- **Knowledge** — artikel basis pengetahuan (dipakai agen AI untuk menjawab).
- **Shipments** — pelacakan pengiriman.
- **Team** — anggota tim dan peran mereka di tenant ini.
- **Settings** — konfigurasi tenant.
- **Analytics** — metrik operasional.

## 5. Memakai Owner Console

Setelah login, kamu di halaman overview platform. Menu utama:

- **Tenants** — daftar seluruh tenant di platform, detail, dan status.
- **AI Operations** — kelola profil agen AI per tenant.
- **Automation** — flow otomasi (trigger → kondisi → aksi).
- **Marketplace** — katalog dan aktivasi connector (WhatsApp, Midtrans, JNE,
  Google Calendar, OpenAI, Anthropic, dst.) per tenant.
- **Reliability** — SLA, breach, metrik keandalan lintas tenant.
- **Audit** — log audit platform yang immutable (tidak bisa diedit/dihapus,
  ditegakkan di level database).
- **Whitelabel** — konfigurasi tema dan domain custom per tenant.

## 6. Mematikan

```powershell
docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env.example down
```

Tambahkan `-v` di akhir kalau kamu ingin menghapus juga data database dan
Redis (kembali ke kondisi benar-benar kosong untuk sesi berikutnya):

```powershell
docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env.example down -v
```

⚠️ `-v` menghapus **seluruh data** (tenant, percakapan, dsb.) di volume itu.
Tidak memengaruhi kode maupun git — hanya data runtime.

## Pemecahan masalah

**Service tidak pernah jadi `healthy`.** Lihat log spesifiknya:
```powershell
docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env.example logs <nama-service>
```

**Login gagal / error 500 tanpa keterangan.** Cek log `migrate` harus memuat
baris `Runtime role passwords provisioned: chai_api, chai_worker`. Kalau
tidak ada, database belum diprovisioning dengan benar — jalankan ulang dari
langkah 1 dengan volume bersih (`down -v` dulu).

**Server mengembalikan error 500 dan tidak ada apa pun yang berguna di log.**
Ini keterbatasan yang sudah diketahui: penangan error server tidak mencatat
detail exception. Catat langkah reproduksinya persis (URL, waktu, aksi) —
itu satu-satunya cara masalahnya bisa dilacak lebih lanjut.

**Login ditolak setelah beberapa kali percobaan cepat.** Ada rate limit
10 percobaan/menit untuk endpoint login. Tunggu satu menit dan coba lagi.

## Batas yang perlu diketahui

- Ini environment **staging**, bukan produksi — password database dan kunci
  di `.env.example` adalah nilai contoh (`change-me-...`), wajib diganti
  sebelum deploy produksi sungguhan.
- Belum ada CI yang berjalan otomatis di repo ini; hijau/merahnya gerbang
  saat ini hanya terverifikasi di mesin lokal.
- Sejumlah modul (AI operations, automation, beberapa sub-fitur marketplace)
  fungsional secara backend tapi belum diuji menyeluruh lewat browser untuk
  setiap alur kerja — lihat `docs/testing/2026-07-27-instruksi-testing-website.md`
  kalau kamu ingin melakukan pengujian sistematis.
