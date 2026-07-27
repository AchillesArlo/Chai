# Instruksi Testing Website — Chai Platform

> Dibuat 2026-07-27 setelah commit `362b469`. Dokumen ini menggantikan
> `WEBSITE_TEST_PLAN.md` (24 Juli — usang, ditulis sebelum seluruh remediasi)
> sebagai acuan pengujian. Ditujukan untuk AI agent yang mengakses website via
> browser: klik, isi form, baca DOM, screenshot — bukan panggilan API langsung.
>
> **Status sebelum Anda mulai**: empat bug produksi ditemukan dan diperbaiki
> hari ini (login gagal total, crash ESM saat boot, aset 404 di client-portal,
> realtime-gateway tidak bisa start). Semuanya dibuktikan lewat nginx sungguhan
> dari volume database kosong. Yang **belum pernah** diuji: apakah setiap fitur
> di balik login benar-benar berfungsi lewat browser. Anda adalah verifikasi
> pertama untuk itu.

---

## 1. Menyalakan stack — wajib, urutan ini persis

Jalankan dari root repo (`D:\Games\Agent\Chai`), PowerShell.

```powershell
# 1. Bangun image dari kode terbaru
docker build -f infra/Dockerfile -t chai-final:local .

# 2. Nyalakan stack staging lengkap dari volume bersih
docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env.example down -v
docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env.example `
  up -d --build postgres redis migrate api client-portal owner-console realtime-gateway nginx

# 3. Tunggu ~60 detik, lalu pastikan SEMUA baris "healthy" (bukan "starting"/"unhealthy")
docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env.example ps

# 4. WAJIB: buat akun uji. Tidak ada halaman signup publik di aplikasi ini.
$env:DATABASE_URL = "postgres://chai_admin:change-me-staging-password@localhost:5432/chai"
pnpm --filter @chai/database exec tsx src/seed-website-test-accounts.ts
```

Langkah 4 mencetak JSON berisi kredensial. Nilainya deterministik (sama setiap
run karena skrip memakai UUID dan email tetap):

| Aplikasi | URL | Email | Password |
|---|---|---|---|
| Owner Console | `http://localhost/login` | `founder@websitetest.chai.local` | `WebsiteTest#2026` |
| Client Portal | `http://localhost/portal/login` | `owner@websitetest.chai.local` | `WebsiteTest#2026` |

Kedua path ini sudah diverifikasi lewat nginx sungguhan (bukan asumsi): masing-
masing menyajikan HTML aplikasi yang benar dengan aset yang benar, dan
`http://localhost/health` mengembalikan `{"data":{"service":"api","status":"ok"}}`.

### 1.1 Gerbang wajib sebelum lanjut

```powershell
docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env.example `
  exec -T api node -e "fetch('http://127.0.0.1:3000/api/client/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'owner@websitetest.chai.local',password:'WebsiteTest#2026'})}).then(r=>r.text()).then(console.log)"
```

Harus mengembalikan JSON berisi `accessToken`. Kalau tidak, **berhenti** —
jangan lanjut menguji lewat browser di atas backend yang login-nya sendiri
tidak bisa dipercaya. Diagnosis: `docker compose ... logs migrate` harus
memuat baris "Runtime role passwords provisioned"; `docker compose ... ps`
semua harus `healthy`.

### 1.2 Yang harus Anda ketahui sebelum menulis temuan apa pun

1. **Tidak ada halaman signup.** Kalau diminta menguji "pendaftaran pengguna
   baru", jawabannya fitur itu tidak ada — laporkan sebagai `TIDAK ADA`, jangan
   mengarang alur yang tidak ada tombolnya.
2. **`founder@websitetest.chai.local` punya `mfaState: REQUIRED`.** Sesuai
   desain keamanan (bukan bug): sebagian aksi ber-guard di owner-console akan
   meminta step-up MFA. Kalau Anda tidak punya aplikasi authenticator, catat
   sebagai batas pengujian, bukan kegagalan.
3. **Rate limit login: 10 request/menit, per-replika API** (bukan bersama
   lintas replika — ini keterbatasan yang sudah didokumentasikan di kode,
   bukan bug baru). Kalau login tiba-tiba ditolak setelah beberapa percobaan
   valid, tunggu 60 detik sebelum menyimpulkan ada bug.
4. **Setiap error `500` di server TIDAK tercatat di log sama sekali** — ini
   temuan tersendiri (`ApiErrorFilter` menelan exception tanpa logging). Kalau
   Anda menemukan `500`, laporan Anda (URL + langkah + waktu persis) adalah
   **satu-satunya** cara masalah itu bisa dilacak; jangan berharap log server
   membantu.
5. **Jangan pakai `WEBSITE_TEST_PLAN.md` (24 Juli) sebagai acuan status fitur.**
   Ditulis sebelum remediasi; sebagian besar temuan "mock"-nya sudah tidak
   berlaku (diverifikasi: nol kecocokan `MOCK_CONVERSATIONS`/`demo-tenant-id`
   di kode saat ini).

---

## 2. Prinsip pengujian

1. **Bedakan "rusak" dari "belum ada".** Tombol yang tidak ada bukan bug —
   itu cakupan yang belum dibangun. Laporkan sebagai `TIDAK ADA`.
2. **Bukti untuk setiap temuan**: screenshot atau kutipan teks DOM persis.
   "Berhasil"/"gagal" tanpa bukti tidak bisa ditindaklanjuti.
3. **Buka Network/DevTools untuk setiap aksi yang mengubah data** (submit
   form, klik tombol aksi). Catat kode status HTTP. UI yang terlihat baik-baik
   saja dengan request `500` di baliknya tetap bug.
4. **Ulangi sekali sebelum melaporkan kegagalan** — beberapa gagal awal bisa
   jadi rate limit sementara (§1.2 poin 3), bukan bug permanen.
5. **Uji isolasi tenant kalau memungkinkan** (§5). Ini invarian paling mahal
   di seluruh sistem — pelanggarannya adalah temuan `BLOCKER`, bukan `HIGH`.

---

## 3. Skenario uji lengkap — Client Portal

Login: `http://localhost/portal/login` dengan `owner@websitetest.chai.local` / `WebsiteTest#2026`.

Untuk SETIAP baris di bawah: buka halamannya, screenshot, catat status HTTP
dari Network untuk request data utamanya, lalu isi kolom "Output yang
diharapkan" — kalau tidak cocok, itu temuan.

| # | Fitur | Langkah | Output yang diharapkan |
|---|---|---|---|
| CP-1 | Login | Buka `/portal/login`, isi kredensial, submit | Redirect ke halaman utama (`/portal/inbox` atau serupa); reload halaman TIDAK logout; cookie sesi HttpOnly terlihat di DevTools Application/Cookies |
| CP-2 | Login gagal | Ulangi dengan password salah | Pesan error yang jelas ("kredensial tidak valid" atau serupa), tetap di halaman login, TIDAK ada stack trace mentah di UI |
| CP-3 | Logout | Klik tombol logout | Redirect ke `/portal/login`; mencoba akses halaman terproteksi setelahnya kembali ke login |
| CP-4 | Inbox | Buka menu inbox/conversations | Daftar percakapan tampil (boleh kosong — tenant baru tidak punya data riwayat); tidak ada error merah di console browser |
| CP-5 | Kirim balasan | Bila ada percakapan, coba kirim balasan | Request POST terkirim, status 200/201, pesan muncul di thread |
| CP-6 | Pelanggan/kontak | Buka menu customers | Daftar tampil; Network menunjukkan request ke endpoint yang benar (bukan 404) |
| CP-7 | Leads | Buka menu leads, coba buat lead baru | Form submit menghasilkan status sukses/gagal yang jelas |
| CP-8 | Booking/appointment | Buka menu bookings, coba buat booking | Sama seperti CP-7 |
| CP-9 | Payments — daftar | Buka menu payments | Daftar tampil (kosong untuk tenant baru) |
| CP-10 | Payments — buat link | Coba buat payment link bila ada tombolnya | Link ter-generate atau pesan error yang jelas |
| CP-11 | Knowledge base | Buka menu knowledge, coba buat artikel | Daftar tampil; create menghasilkan status jelas |
| CP-12 | Shipments/logistics | Buka menu shipments | Daftar tampil |
| CP-13 | Team management | Buka menu team | `owner@websitetest.chai.local` muncul sebagai CLIENT_OWNER |
| CP-14 | Undang anggota | Coba undang anggota baru bila ada fiturnya | Status jelas (sukses/gagal); TIDAK ADA bila fiturnya memang belum dibangun |
| CP-15 | Settings | Buka menu settings | Halaman tampil tanpa crash |
| CP-16 | Analytics | Buka menu analytics/dashboard | Metrik tampil (boleh nol) |
| CP-17 | Widget/campaign (bila ada) | Buka menu terkait | Daftar tampil |
| CP-18 | Navigasi menyeluruh | Klik SETIAP item menu satu per satu | Catat setiap: blank page, infinite spinner, stack trace mentah di UI, atau 404 pada navigasi internal |
| CP-19 | Responsif dasar | Perkecil lebar viewport (mobile) pada 2-3 halaman utama | Layout tidak pecah total (bukan uji pixel-perfect, hanya usable) |

---

## 4. Skenario uji lengkap — Owner Console

Login: `http://localhost/login` dengan `founder@websitetest.chai.local` / `WebsiteTest#2026`.

| # | Fitur | Langkah | Output yang diharapkan |
|---|---|---|---|
| OC-1 | Login | Isi kredensial, submit | Masuk ke halaman utama; audience `owner-console` (cookie/token berbeda dari client-portal) |
| OC-2 | Isolasi audience | Coba pakai sesi client-portal untuk akses owner-console (buka `/login` di tab yang sudah login client-portal) atau sebaliknya | Ditolak — dua audience tidak boleh saling menembus |
| OC-3 | Overview/dashboard | Buka halaman utama | Card metrik tampil, DATA NYATA bukan hardcoded (nama tenant seperti "Nusantara Dental" yang muncul tanpa Anda membuatnya adalah tanda data mock — laporkan sebagai bug) |
| OC-4 | Tenant management | Buka daftar tenant | `Website Test Tenant` (dari seed) muncul di daftar |
| OC-5 | Detail tenant | Klik tenant tersebut | Detail tampil: member, status |
| OC-6 | Suspend tenant | Coba suspend tenant bila ada aksinya | Status berubah; TIDAK ADA bila belum dibangun |
| OC-7 | AI Operations | Buka menu AI agent | Daftar agent profile tampil (kosong untuk tenant baru); coba buat profil baru |
| OC-8 | Automation | Buka menu automation | Daftar flow tampil |
| OC-9 | Marketplace/connectors | Buka menu marketplace | Daftar connector (WhatsApp, Midtrans, JNE, dst.) dengan status masing-masing |
| OC-10 | Reliability/SLA | Buka menu reliability | Halaman tampil |
| OC-11 | Quarantine/Retention | Buka menu terkait bila ada | Halaman tampil |
| OC-12 | Audit log | Buka menu audit | Log tampil; coba cari entri login yang baru terjadi |
| OC-13 | Whitelabel | Buka menu whitelabel | Halaman tampil |
| OC-14 | Enterprise/SSO | Buka menu enterprise bila ada | Halaman tampil |
| OC-15 | Navigasi menyeluruh | Klik SETIAP item menu | Sama seperti CP-18 |
| OC-16 | MFA enrollment | Bila diminta step-up MFA di suatu aksi, coba alur enrollment | Catat sejauh mana bisa diuji tanpa aplikasi authenticator nyata; ini bukan kegagalan |

---

## 5. Isolasi lintas tenant — prioritas tinggi

Invarian paling kritis: satu tenant TIDAK PERNAH bisa melihat data tenant lain.

Untuk menguji penuh Anda butuh tenant kedua. Skrip seed default hanya membuat
satu. Kalau operator manusia bisa menyediakan variasi skrip dengan email/ID
berbeda (lihat `packages/database/src/seed-website-test-accounts.ts` sebagai
acuan), gunakan itu. Kalau tidak tersedia dalam sesi Anda, tandai baris di
bawah sebagai `TIDAK-TERUJI` dengan alasan tersebut — jangan dilewati diam-diam.

| # | Skenario | Output yang diharapkan |
|---|---|---|
| ISO-1 | Login tenant A, ubah ID di URL (bila terlihat di path/query) ke ID yang diduga milik tenant lain | Ditolak (403/404); TIDAK menampilkan data tenant lain |
| ISO-2 | Bandingkan isi inbox/customers antara dua tenant | Nol tumpang tindih data |
| ISO-3 | Owner console: pilih tenant A vs tenant B di selector (bila ada) | Data yang tampil benar-benar berganti sesuai tenant yang dipilih |

---

## 6. Yang sudah diketahui — verifikasi statusnya, jangan ditemukan ulang dari nol

| ID | Temuan | Relevansi bagi Anda |
|---|---|---|
| K-13 | `ApiErrorFilter` tidak mencatat exception ke log sama sekali | Setiap `500` yang Anda temukan HARUS dilaporkan detail (URL, waktu, langkah) karena log server tidak akan membantu melacaknya |
| K-14 | Rate limit login 10/menit per-replika, bukan bersama | Jangan simpulkan bug dari penolakan setelah banyak percobaan cepat |
| K-03 | Teks pesan pelanggan masuk Redis tidak terenkripsi | Tidak terlihat dari browser; relevan bila Anda mengirim data sensitif saat menguji chat |
| — | 4 bug produksi diperbaiki hari ini: login gagal total (`0220da4`), crash ESM boot (`f013b2e`), aset 404 client-portal (`362b469`), realtime-gateway tidak start (`362b469`) | Semua sudah diverifikasi lewat nginx sungguhan; kalau Anda menemukan salah satu simptom ini lagi, itu regresi — laporkan sebagai `BLOCKER` |

---

## 7. Format laporan temuan

```
[SEVERITY] Judul singkat
Aplikasi: Client Portal | Owner Console
Halaman/URL: ...
Langkah reproduksi: 1. ... 2. ... 3. ...
Yang terjadi: ...
Yang diharapkan: ...
Bukti: (screenshot / kutipan DOM / status HTTP dari Network)
Kelas: RUSAK | TIDAK ADA | TIDAK-TERUJI
```

Severity: `BLOCKER` (tidak bisa login/dipakai sama sekali, atau kebocoran
lintas tenant), `HIGH` (fitur utama gagal), `MEDIUM` (fitur sekunder gagal
atau UX membingungkan), `LOW` (kosmetik).

---

## 8. Keluaran akhir yang wajib Anda hasilkan

Satu berkas: `docs/testing/2026-07-27-hasil-uji-website.md`, berisi:

1. **Ringkasan** — total temuan per severity (berapa BLOCKER/HIGH/MEDIUM/LOW),
   dan berapa skenario di §3-§5 yang lulus/gagal/tidak-teruji.
2. **Tabel hasil per skenario** — setiap baris di §3, §4, §5 dengan kolom
   Status (LULUS/GAGAL/TIDAK ADA/TIDAK-TERUJI) dan Catatan singkat.
3. **Detail temuan** — setiap temuan RUSAK ditulis lengkap memakai format §7.
4. **Verifikasi K-13–K-14** — apakah Anda menemukan `500` baru, dan apakah
   rate limit sempat menghalangi pengujian Anda.

**Jangan mengubah kode apa pun selama pengujian.** Ini sesi pengujian, bukan
perbaikan. Setelah selesai, jalankan dan sertakan hasilnya:

```powershell
git status --porcelain
```

Harus hanya menampilkan `docs/testing/2026-07-27-hasil-uji-website.md`. Kalau
ada berkas lain yang berubah, itu berarti pengujian Anda tidak sengaja
menyentuh kode — laporkan dan jangan commit sampai diperiksa.

Terakhir, matikan stack:

```powershell
docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env.example down -v
```
