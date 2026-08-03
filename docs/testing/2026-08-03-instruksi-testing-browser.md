# Instruksi Testing via Browser — untuk agent asisten (Gemini)

> Ditulis 2026-08-03 setelah sesi pengujian Playwright headed yang gagal karena
> race condition startup. Instruksi ini agar tes browser tidak mengulang
> kegagalan yang sama.

## Konteks singkat

Repo `Chai` punya 3 dev server yang harus hidup sebelum tes browser:

| Server | Port | Paket | Fungsi |
|---|---|---|---|
| API (NestJS/Fastify) | 3001 | `@chai/api` | Backend REST, webhook, auth |
| Owner console (Next.js) | 3000 | `@chai/owner-console` | UI admin/operator |
| Client portal (Next.js) | 3002 | `@chai/client-portal` | UI customer-facing |

Playwright config (`playwright.config.ts`) punya 3 `webServer` yang auto-start
ketiga server ini, dengan `reuseExistingServer: !CI`. **Masalah:** Playwright
menganggap server "siap" begitu port listen — padahal NestJS butuh ~15-30s
lagi untuk mapped semua route. Test pertama yang menembak endpoint belum-ready
akan dapat 500. Ini **bukan bug kode**, hanya timing.

Test yang sudah ada:
- `tests/e2e/*.spec.ts` — alur fungsional (conversation, payment, booking, dll)
- `tests/security/*.spec.ts` — tenant isolation, RBAC, input validation
- `tests/smoke/*.spec.ts` — boundary UI shell

## Aturan wajib sebelum tes browser

### 1. Pastikan Docker hidup

```powershell
docker ps
```

Harus muncul `compose-postgres-1` (healthy) dan `compose-redis-1` (healthy).
Kalau tidak, start dulu:

```powershell
docker compose -f infra\compose\docker-compose.yml up -d
```

Tunggu sampai `docker ps` menunjukkan `(healthy)` di kedua container.

### 2. Pastikan port 3000/3001/3002 bebas

```powershell
Get-NetTCPConnection -LocalPort 3000,3001,3002 -ErrorAction SilentlyContinue |
  Where-Object { $_.State -eq 'Listen' }
```

Kalau ada yang Listen, hentikan proses node yang punya PID itu:

```powershell
Get-Process node | Where-Object { $_.Path -notmatch 'Adobe' } | Stop-Process -Force
```

(Adobe Creative Cloud juga pakai node — jangan dihentikan, filter dengan `-notmatch 'Adobe'`.)

### 3. JANGAN langsung `pnpm run test:smoke -- --headed`

Ini penyebab kegagalan tadi. Playwright start server sendiri tapi mulai tes
terlalu cepat. **Pre-warm server dulu** (lihat langkah 4), baru jalankan tes
dengan `PLAYWRIGHT_REUSE_SERVER=1`.

## Langkah tes browser yang benar

### Opsi A — Headless (paling reliable, bukti utama)

```powershell
$env:CI="true"
pnpm run test:smoke
```

`CI=true` menyebabkan `reuseExistingServer: false` → Playwright start server
sendiri tapi dengan urutan yang lebih deterministic. Hasil yang diharapkan:
**89 passed, 0 failed**. Ini baseline dari panduan penguji 2026-07-31.

Kalau Opsi A lulus, tes browser otomatis sudah terverifikasi. Tidak perlu
lanjut ke Opsi B kecuali Anda ingin lihat browser secara visual.

### Opsi B — Headed dengan server pre-warmed (untuk inspeksi visual)

#### Langkah 1: Start 3 dev server manual di background

```powershell
Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c","pnpm --filter @chai/api dev > `"$env:TEMP\api-dev.log`" 2>&1" `
  -NoNewWindow -PassThru | Select-Object Id

Start-Sleep -Seconds 5

Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c","pnpm --filter @chai/owner-console dev > `"$env:TEMP\owner-dev.log`" 2>&1" `
  -NoNewWindow -PassThru | Select-Object Id

Start-Sleep -Seconds 3

Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c","pnpm --filter @chai/client-portal dev > `"$env:TEMP\client-dev.log`" 2>&1" `
  -NoNewWindow -PassThru | Select-Object Id
```

#### Langkah 2: Tunggu sampai KETIGA server fully ready

**Jangan cuma cek port listen.** Cek log masing-masing sampai muncul marker
"fully ready":

```powershell
# API ready marker: "Nest application successfully started"
Get-Content "$env:TEMP\api-dev.log" -Tail 5 |
  Select-String "Nest application successfully started"

# Owner console ready marker: Next.js "Ready" atau "started server on"
Get-Content "$env:TEMP\owner-dev.log" -Tail 10 |
  Select-String "Ready|started server on|Local:"

# Client portal ready marker: sama
Get-Content "$env:TEMP\client-dev.log" -Tail 10 |
  Select-String "Ready|started server on|Local:"
```

Ulangi cek ini setiap 10 detik. **Waktu aman: 40-60 detik** setelah start.
Kalau marker belum muncul setelah 90 detik, baca log untuk error.

#### Langkah 3: Verifikasi dengan curl sebelum playwright

```powershell
# API health
Invoke-WebRequest "http://127.0.0.1:3001/health" -UseBasicParsing |
  Select-Object StatusCode

# Webhook endpoint (harus 201, bukan 500)
$payload = @{
  external_event_id = "test-evt-$(Get-Date -Format yyyyMMddHHmmss)"
  external_message_id = "test-msg-$(Get-Date -Format yyyyMMddHHmmss)"
  external_user_id = "+15551234567"
  text = "Hello"
} | ConvertTo-Json

Invoke-WebRequest "http://127.0.0.1:3001/api/service/v1/channels/mock-channel/webhook" `
  -Method POST -Body $payload -ContentType "application/json" -UseBasicParsing |
  Select-Object StatusCode
```

Kalau webhook return 201 → API fully ready. Kalau 500 → **jangan lanjut**,
API belum ready atau ada bug nyata.

#### Langkah 4: Jalankan Playwright headed dengan reuse server

```powershell
$env:CI="false"  # penting: supaya reuseExistingServer=true
$env:PLAYWRIGHT_REUSE_SERVER="1"
pnpm run test:smoke -- --headed
```

Browser chromium akan terbuka dan menjalankan 89 test. Hasil yang diharapkan:
**89 passed, 0 failed** dalam ~1-2 menit.

#### Langkah 5: Bersihkan setelah selesai

```powershell
Get-Process node,pnpm -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -notmatch 'Adobe' } |
  Stop-Process -Force -ErrorAction SilentlyContinue
```

### Opsi C — Playwright UI mode (interaktif, pilih test sendiri)

```powershell
pnpm exec playwright test --ui
```

Jendela Playwright UI terbuka. Anda pilih test file/skenario, klik run, lihat
browser step-by-step dengan trace. Cocok untuk debug test tertentu.

**Catatan:** UI mode juga butuh server. Kalau belum pre-warm, Playwright akan
start sendiri dengan race condition yang sama. Pre-warm dulu seperti Opsi B.

## Apa saja yang harus di-check (checklist)

### A. Gerbang utama (harus hijau)

1. **89 test lolos, 0 gagal** di `pnpm run test:smoke` (headless atau headed).
2. **Tidak ada test di-skip** di luar performance test (`tests/performance/*`
   yang di-skip via `RUN_PERF_TESTS` flag — itu sah, bukan pelanggaran).
3. **Tidak ada 500 dari endpoint yang seharusnya 2xx.** Kalau ada 500:
   - Cek apakah server fully ready (ulang curl test di Langkah 3 Opsi B)
   - Kalau 500 persisten setelah server ready → itu **bug nyata**, laporkan
     dengan body response + stack trace dari log API

### B. Area fungsional yang harus diverifikasi via browser

#### B1. Client portal (`http://127.0.0.1:3002`)

- [ ] Login page render tanpa error console
- [ ] Login dengan test subject header → redirect ke dashboard
- [ ] Unified Inbox menampilkan conversation queue
- [ ] Reply di conversation mengirim pesan
- [ ] Booking/appointment flow: create → list → cancel
- [ ] AI Flow panel render (kalau ada)
- [ ] Team management page render
- [ ] Settings page render

Test otomatis: `tests/e2e/conversation-flow.spec.ts`, `tests/e2e/lead-booking.spec.ts`

#### B2. Owner console (`http://127.0.0.1:3000`)

- [ ] Login page render
- [ ] Dashboard utama render dengan metrics
- [ ] Tenant selector (kalau multi-tenant) berfungsi
- [ ] User management CRUD
- [ ] Payment configuration page
- [ ] Audit log viewer menampilkan entry (kalau ada)
- [ ] Settings page

#### B3. API (`http://127.0.0.1:3001`)

- [ ] `GET /health` → 200
- [ ] `POST /api/service/v1/channels/mock-channel/webhook` → 201 (cek dengan curl di atas)
- [ ] `GET /api/client/v1/conversations` dengan header `x-test-subject: local|client-owner` → 200
- [ ] `POST /api/client/v1/payments/checkout` → 201 (lihat `tests/e2e/payment-flow.spec.ts` untuk payload)
- [ ] Tenant isolation: request dengan tenant A tidak boleh lihat data tenant B
  (lihat `tests/security/tenant-isolation.spec.ts`)

### C. Boundary keamanan (paling sering dilanggar)

- [ ] **Tenant isolation**: data tenant A tidak bocor ke tenant B. Test
  otomatis: `tests/security/tenant-isolation.spec.ts` (89 test cases).
- [ ] **RBAC enforcement**: user biasa tidak bisa akses endpoint admin.
  Test: `tests/security/rbac-enforcement.spec.ts`.
- [ ] **Input validation**: payload malformed ditolak dengan 400, bukan 500.
  Test: `tests/security/input-validation.spec.ts`.
- [ ] **Error messages tidak bocorkan internal ID**. Test: `tests/security/tenant-isolation.spec.ts:242`.

### D. Struktur on-PAID (FASE 7, REQ-17-019)

Verifikasi alur pembayaran end-to-end via browser/API:

1. Create checkout session → dapat session ID
2. Simulate payment PAID (webhook provider atau endpoint test)
3. Verifikasi:
   - `chai.invoice.status` berubah jadi `paid`
   - `chai.notification` bertambah 1 baris
   - `chai.order` status berubah dari `PENDING` (kalau ada order)
   - `chai.follow_up_job` yang tertaut payment di-stop (kalau ada reminder)

Cek via SQL:
```sql
SELECT id, status, paid_at FROM chai.invoice WHERE id = '<invoice-id>';
SELECT count(*) FROM chai.notification WHERE resource_id = '<payment-id>';
SELECT id, status FROM chai.follow_up_job WHERE payment_id = '<payment-id>';
```

Test otomatis: `tests/integration/payment-on-paid-effects.integration.test.ts`.

## Cara membedakan bug kode vs masalah environment

Panduan lengkap di `docs/testing/2026-07-31-panduan-agent-penguji.md` BAGIAN 5.
Ringkas:

| Gejala | Kemungkinan | Cara verifikasi |
|---|---|---|
| 500 di test pertama, lulus di retry | server belum ready (timing) | curl manual endpoint → kalau 201, bukan bug |
| 500 konsisten di semua percobaan | bug kode | curl manual → tetap 500, baca stack trace |
| Test flaky (kadang lulus kadang gagal) | race condition atau data kotor | cek DB state antar run, jalankan 2x bandingkan |
| `column does not exist` di postgres log | migrasi hilang/kode vs skema mismatch | cek `information_schema.columns` vs kode INSERT |
| `must be owner of table` | role migrasi salah | cek `SET ROLE` di migrasi, bandingkan dengan `0086` bug |

**Aturan praktis:** bug kode deterministik (gagal sama setiap kali). Masalah
environment biasanya berubah antar percobaan. Kalau ragu, jalankan perintah
yang sama 2 kali dan bandingkan.

## Yang TIDAK boleh dilakukan

1. **Jangan langsung `pnpm run test:smoke -- --headed` tanpa pre-warm.** Ini
   penyebab 16 failure tadi. Selalu pre-warm server dulu (Opsi B Langkah 1-3).
2. **Jangan hentikan Adobe Creative Cloud node process.** Filter dengan
   `-notmatch 'Adobe'` saat cleanup.
3. **Jangan abaikan 500 sebagai "flaky" tanpa verifikasi.** Curl endpoint
   manual dulu untuk konfirmasi apakah bug nyata atau timing.
4. **Jangan modifikasi kode saat tes browser.** Anda penguji, bukan pelaksana.
   Laporkan saja (sesuai BAGIAN 0 panduan penguji).
5. **Jangan kill proses dengan `taskkill /F /IM node.exe`** tanpa filter —
   akan membunuh Adobe dan aplikasi lain yang pakai node.

## Output yang diharapkan dari sesi tes browser

Tulis laporan tambahan (template BAGIAN 6 di panduan penguji) dengan:

1. Mode tes yang dipakai (headless / headed pre-warmed / UI mode)
2. Waktu start server dan waktu tes mulai (untuk dokumentasi timing)
3. Hasil: `X passed (Ys), Z failed`
4. Kalau ada failure: body response + endpoint + apakah konsisten setelah retry
5. Verifikasi fungsional B1-B3 (centang yang berhasil, catat yang gagal)
6. Putusan: LULUS / TIDAK LULUS untuk tes browser

Simpan laporan di `docs/testing/2026-08-03-laporan-penguji-browser.md`.

## Referensi

- Panduan penguji utama: `docs/testing/2026-07-31-panduan-agent-penguji.md`
- Laporan pengujian gerbang: `docs/testing/2026-08-03-laporan-penguji.md`
- Config Playwright: `playwright.config.ts`
- Test files: `tests/e2e/`, `tests/security/`, `tests/smoke/`, `tests/performance/`
- Dev server script: `scripts/dev.mjs` (lihat untuk urutan startup yang benar)
