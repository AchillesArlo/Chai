# Plan Pengujian Website — Chai Platform

> Dibuat 2026-07-27 setelah commit `0220da4`. Ditujukan untuk AI agent yang mengakses
> website via browser (klik, isi form, baca DOM/screenshot) — bukan API langsung.
>
> **Status jujur sebelum Anda mulai:** login (client-portal dan owner-console) sudah
> terverifikasi bekerja end-to-end lewat HTTP sungguhan terhadap stack Docker Compose
> nyata, dari volume database yang benar-benar kosong. Semua yang **setelah** login
> — apakah inbox, payments, tenant management, dst. benar-benar berfungsi — **belum
> pernah diuji lewat browser sama sekali**. Anda adalah verifikasi pertama untuk itu.
>
> Ada dokumen `WEBSITE_TEST_PLAN.md` di root repo bertanggal 24 Juli. **Jangan
> pakai itu sebagai acuan kebenaran** — banyak temuannya (🔴 mock, tidak ada rate
> limit, dsb.) sudah diperbaiki oleh pekerjaan sesudahnya dan sekarang salah.
> Dokumen ini menggantikannya untuk keperluan pengujian browser.

---

## 0. Yang harus Anda ketahui sebelum mulai

### 0.1 Dua bug produksi yang baru ditemukan dan diperbaiki hari ini

1. **Aplikasi crash total saat boot** (commit `f013b2e`) — build lama tidak
   menghasilkan container yang bisa hidup sama sekali. Sudah diperbaiki dan
   dibuktikan dengan `Nest application successfully started` + `/api/v1/health`
   menjawab `200`.
2. **Login gagal 100% di deployment manapun dari volume baru** (commit `0220da4`)
   — role database `chai_api`/`chai_worker` tidak pernah diberi password oleh
   mekanisme otomatis apa pun, sehingga setiap query ke database gagal dengan
   `500` yang **tidak tercatat di log sama sekali** (`ApiErrorFilter` menelan
   exception tanpa logging — ini sendiri adalah temuan tersendiri, K-13,
   dicatat di §6). Sudah diperbaiki: service `migrate` sekarang menjalankan
   `provision-passwords` setelah migrasi.

Kedua bug ini berarti **setiap sesi pengujian sebelumnya (kalau ada) yang tidak
melewati langkah ini akan gagal login**. Jangan simpulkan "aplikasi rusak" dari
kegagalan login — pastikan dulu Fase 1 di bawah benar-benar dijalankan.

### 0.2 Tidak ada mekanisme registrasi mandiri

Tidak ada halaman signup publik. Akun HARUS dibuat lewat skrip seed di §1 sebelum
pengujian apa pun bisa dimulai. Ini bukan bug, tapi konsekuensinya: kalau Anda
diminta menguji "alur pendaftaran pengguna baru", jawabannya adalah **fitur itu
tidak ada** — laporkan sebagai temuan, jangan mencoba mengarangnya.

---

## 1. Fase 1 — Nyalakan stack dan siapkan akun (WAJIB, jangan dilewati)

Jalankan dari root repo (`D:\Games\Agent\Chai`), PowerShell.

```powershell
# 1. Bangun image dari kode terbaru
docker build -f infra/Dockerfile -t chai-final:local .

# 2. Nyalakan stack staging lengkap TERMASUK frontend
docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env.example `
  up -d --build postgres redis migrate api client-portal owner-console realtime-gateway nginx

# 3. Tunggu ~60 detik, lalu periksa semua service "healthy"
docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env.example ps

# 4. WAJIB: buat akun uji. Tanpa langkah ini tidak ada satu pun akun yang bisa login.
$env:DATABASE_URL = "postgres://chai_admin:change-me-staging-password@localhost:5432/chai"
pnpm --filter @chai/database exec tsx src/seed-website-test-accounts.ts
```

Keluaran langkah 4 akan mencetak JSON berisi kredensial. **Simpan persis** —
kredensial di bawah ini adalah nilai defaultnya (deterministik, sama setiap run).
Routing nginx dikonfirmasi langsung dari `infra/staging/nginx.conf`: owner-console
di path root, client-portal di bawah `/portal/` (di-rewrite ke root client-portal),
keduanya di port host 80.

| Aplikasi | URL | Email | Password |
|---|---|---|---|
| Owner Console | `http://localhost/login` | `founder@websitetest.chai.local` | `WebsiteTest#2026` |
| Client Portal | `http://localhost/portal/login` | `owner@websitetest.chai.local` | `WebsiteTest#2026` |

⚠️ **Bug ketiga ditemukan sambil menyusun plan ini, belum diperbaiki**: nginx
`location /health` mem-proxy ke `http://api_backend/health`, tapi rute yang
benar-benar terdaftar di API adalah `/api/v1/health` (dikonfirmasi log Nest
saat boot, dan inilah yang dipakai Dockerfile HEALTHCHECK setelah commit
`f013b2e`). Jadi `curl http://localhost/health` lewat nginx akan gagal `404`
meski API-nya sendiri sehat. Ini TIDAK memblokir pengujian browser (nginx
`location /` dan `/portal/` tidak terpengaruh), tapi catat sebagai temuan K-15
di §6 — jangan simpulkan API mati hanya dari endpoint agregat nginx ini.

⚠️ **Risiko keempat, belum diverifikasi — verifikasi ini adalah bagian dari
tugas Anda**: `client-portal` tidak mendeklarasikan `basePath: '/portal'` di
konfigurasi Next.js-nya, sementara nginx me-rewrite `/portal/*` → `/*` sebelum
diteruskan. Akibatnya HTML yang disajikan mungkin mereferensikan aset
`/_next/...` tanpa prefix `/portal`, yang oleh nginx `location /` akan
diarahkan ke **owner-console**, bukan client-portal — potensi aset 404 atau
salah render. Uji ini secara eksplisit di CP-1: buka DevTools Network saat
memuat `/portal/login`, cari request `/_next/...` yang gagal atau yang
responsnya adalah HTML owner-console. Laporkan sebagai K-16 bila terkonfirmasi.

### 1.1 Verifikasi login berfungsi SEBELUM pengujian browser dimulai

Ini sengaja diulang dari commit `0220da4` sebagai gerbang wajib:

```powershell
docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env.example `
  exec -T api node -e "fetch('http://127.0.0.1:3000/api/client/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'owner@websitetest.chai.local',password:'WebsiteTest#2026'})}).then(r=>r.text()).then(console.log)"
```

Harus mengembalikan JSON berisi `accessToken`. Kalau tidak, **berhenti** — jangan
lanjut ke pengujian browser di atas backend yang login-nya sendiri belum bisa
dipercaya. Diagnosis: cek log `migrate` mencetak "Runtime role passwords
provisioned", cek `docker compose ps` semua `healthy`.

---

## 2. Prinsip pengujian — baca ini sebelum menulis temuan apa pun

1. **Bedakan "rusak" dari "belum ada".** Kalau sebuah fitur tidak ada tombolnya
   sama sekali, itu bukan bug — itu cakupan yang belum dibangun. Laporkan sebagai
   `TIDAK ADA`, bukan `RUSAK`.
2. **Screenshot atau kutip teks DOM untuk setiap temuan**, bukan sekadar
   "berhasil"/"gagal". Klaim tanpa bukti tidak berguna untuk tindak lanjut.
3. **Buka DevTools/Network setara** — untuk setiap aksi penting, catat kode
   status HTTP dari request yang terpicu. Kalau UI terlihat baik-baik saja tapi
   request-nya `500`, itu tetap bug.
4. **Uji isolasi tenant bila memungkinkan.** Kalau Anda punya dua akun tenant
   berbeda (lihat §5 untuk cara membuatnya), coba akses data tenant lain dan
   pastikan ditolak.
5. **Jangan menyimpulkan dari satu percobaan.** Kalau sebuah aksi gagal, ulangi
   sekali sebelum melaporkan — beberapa gagal sebelumnya di sesi ini adalah
   rate-limit sementara (lihat §6, K-14), bukan bug permanen.

---

## 3. Skenario uji — Client Portal

Login sebagai `owner@websitetest.chai.local` / `WebsiteTest#2026` di `http://localhost/portal/login`.

| # | Skenario | Langkah | Yang diperiksa |
|---|---|---|---|
| CP-1 | Login | Buka halaman login, isi kredensial, submit | Redirect ke halaman utama; sesi tersimpan (reload tidak logout) |
| CP-2 | Logout | Klik logout | Redirect ke login; mengakses halaman terproteksi setelah logout kembali ke login |
| CP-3 | Inbox / percakapan | Buka menu inbox/conversations | Daftar percakapan tampil (boleh kosong — tenant baru tidak punya data), tidak ada error di konsol |
| CP-4 | Pelanggan/kontak | Buka menu customers/contacts | Daftar tampil, cek Network: request ke endpoint yang benar (bukan 404/500) |
| CP-5 | Leads | Buka menu leads, coba buat lead baru | Form submit menghasilkan status sukses/gagal yang jelas, bukan diam saja |
| CP-6 | Payments | Buka menu payments | Daftar payment tampil (kosong untuk tenant baru); coba buat payment link bila ada tombolnya |
| CP-7 | Knowledge base | Buka menu knowledge | Daftar artikel/dokumen tampil |
| CP-8 | Shipments/logistics | Buka menu shipments | Daftar tampil |
| CP-9 | Team management | Buka menu team, lihat anggota | `owner@websitetest.chai.local` muncul sebagai CLIENT_OWNER |
| CP-10 | Settings | Buka menu settings | Halaman tampil tanpa crash |
| CP-11 | Analytics | Buka menu analytics/dashboard | Metrik tampil (boleh nol/kosong) |
| CP-12 | Navigasi lengkap | Klik setiap item menu satu per satu | Catat setiap halaman yang menghasilkan blank page, infinite spinner, atau pesan error mentah (stack trace di UI) |

---

## 4. Skenario uji — Owner Console

Login sebagai `founder@websitetest.chai.local` / `WebsiteTest#2026` di `http://localhost/login`.

**Catatan penting**: `mfaState` untuk akun ini adalah `REQUIRED` (lihat token hasil
login di §1.1). Sesuai desain, sebagian aksi ber-guard mungkin meminta step-up MFA.
Ini bukan bug — itu invarian keamanan (`10_SECURITY`). Kalau UI meminta enrolment
TOTP dan Anda tidak punya aplikasi authenticator, catat sebagai batas pengujian,
bukan sebagai kegagalan.

| # | Skenario | Langkah | Yang diperiksa |
|---|---|---|---|
| OC-1 | Login | Login dengan kredensial founder | Masuk ke overview; audience `owner-console` |
| OC-2 | Isolasi audience | Coba pakai token/sesi client-portal untuk akses owner-console (buka di tab lain / cek cookie) | Ditolak — dua audience tidak boleh saling menembus |
| OC-3 | Overview/dashboard | Buka halaman utama | Card metrik tampil, bukan data mock hardcoded (`Nusantara Dental` dkk yang disebut test plan lama) |
| OC-4 | Tenant management | Buka daftar tenant | `Website Test Tenant` (dari seed) muncul di daftar |
| OC-5 | Detail tenant | Klik tenant tersebut | Detail tampil: member, status, dll. |
| OC-6 | AI Operations | Buka menu AI agent/operations | Daftar agent profile tampil (kosong untuk tenant baru) |
| OC-7 | Automation | Buka menu automation | Daftar flow tampil |
| OC-8 | Marketplace/connectors | Buka menu marketplace | Daftar connector (WhatsApp, Midtrans, JNE, dst.) tampil dengan status |
| OC-9 | Reliability/SLA | Buka menu reliability | Halaman tampil |
| OC-10 | Audit log | Buka menu audit | Log audit tampil — coba cari entri login yang baru saja terjadi |
| OC-11 | Whitelabel | Buka menu whitelabel | Halaman tampil |
| OC-12 | Navigasi lengkap | Klik setiap item menu | Sama seperti CP-12: catat blank page/spinner tak berhenti/stack trace mentah |

---

## 5. Skenario uji — Isolasi lintas tenant (penting, prioritas tinggi)

Ini menguji invarian paling kritis di repo ini. Untuk mengujinya penuh Anda butuh
tenant KEDUA. Jalankan seed sekali lagi dengan mengubah beberapa nilai
(pendekatan tercepat: minta operator manusia membuat variasi skrip dengan UUID
dan email berbeda; skrip persis di `packages/database/src/seed-website-test-accounts.ts`).
Bila itu tidak memungkinkan dalam sesi Anda, lewati bagian ini dan catat sebagai
`TIDAK-TERUJI` dengan alasan "butuh tenant kedua yang tidak disediakan skrip
seed default".

| # | Skenario | Yang diperiksa |
|---|---|---|
| ISO-1 | Login tenant A, coba ubah ID di URL (bila ada ID di path/query) ke ID milik tenant B | Ditolak (403/404), bukan data tenant B yang tampil |
| ISO-2 | Bandingkan daftar percakapan/customer antara tenant A dan B | Tidak ada tumpang tindih data |

---

## 6. Temuan yang sudah diketahui — jangan ditemukan ulang, tapi verifikasi statusnya

| ID | Temuan | Dampak bagi pengujian Anda |
|---|---|---|
| K-13 (baru) | `ApiErrorFilter` tidak pernah mencatat exception mentah ke log. Setiap `500` di server akan terlihat di browser sebagai "an unexpected server error occurred" tanpa detail, dan operator tidak akan melihat apa pun di `docker logs`. | Kalau Anda menemukan `500`, laporkan endpoint dan langkah reproduksinya persis — itu satu-satunya cara masalahnya bisa dilacak, karena log server tidak akan membantu. |
| K-14 | Login/MFA punya rate limit ketat: `AUTH_RATE_LIMIT_MAX` default 10 request/menit, dan counter tersebut **per-replika API** (bukan bersama, lihat komentar `ponytail` di `auth-rate-limit.ts`). Kalau Anda menguji berulang kali dalam waktu singkat lewat replika yang sama, Anda bisa terkena limit. | Kalau login tiba-tiba menolak setelah beberapa kali percobaan valid, tunggu 60 detik sebelum menyimpulkan bug. |
| K-03 | Teks pesan pelanggan masuk Redis dalam bentuk terbaca (`postgres-conversation.repository.ts:270`). | Tidak terlihat dari browser, tapi relevan kalau Anda mengirim data sensitif saat menguji fitur chat/inbox. |
| K-01/K-02 | CI belum pernah dieksekusi runner; sebelum hari ini stack belum pernah benar-benar dinyalakan. | Anda literally sesi pertama yang menguji ini lewat browser — ekspektasikan menemukan hal yang belum pernah ditemukan siapa pun. |
| K-15 (baru) | nginx `location /health` mem-proxy ke `http://api_backend/health`, padahal rute nyata adalah `/api/v1/health`. `curl http://localhost/health` akan 404 meski API sehat. | Jangan pakai endpoint ini untuk mengecek API hidup; pakai langkah 1.1 di atas. |
| — | `WEBSITE_TEST_PLAN.md` (24 Juli) usang. Referensi `MOCK_CONVERSATIONS`, `demo-tenant-id` — keduanya sudah dihapus (dikonfirmasi lewat pencarian kode, nol kecocokan). | Jangan gunakan dokumen itu sebagai acuan status fitur. |

---

## 7. Format laporan temuan

Untuk setiap temuan, gunakan format ini agar bisa langsung ditindaklanjuti:

```
[SEVERITY] Judul singkat
Halaman/URL: ...
Langkah reproduksi: 1. ... 2. ... 3. ...
Yang terjadi: ...
Yang diharapkan: ...
Bukti: (screenshot / kutipan teks DOM / status HTTP dari Network)
Kelas: RUSAK | TIDAK ADA | TIDAK-TERUJI
```

Severity: `BLOCKER` (tidak bisa login/menggunakan sama sekali), `HIGH` (fitur
utama gagal), `MEDIUM` (fitur sekunder gagal atau UX membingungkan), `LOW`
(kosmetik).

---

## 8. Setelah pengujian selesai

Konsolidasikan seluruh temuan ke satu berkas `docs/testing/2026-07-27-hasil-uji-website.md`
dengan struktur: ringkasan (berapa BLOCKER/HIGH/MEDIUM/LOW), lalu daftar temuan
lengkap per bagian (Client Portal, Owner Console, Isolasi Tenant). Jangan
mengubah kode apa pun selama pengujian — ini sesi pengujian, bukan perbaikan.
