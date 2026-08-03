# Laporan Pengujian Browser — FASE 1–33 & Browser Login Flow

Diuji: 2026-08-03, 14:36 (UTC+07)
Penguji: agent asisten (Gemini / Antigravity)
Objek uji: Pengujian browser otomatis via Playwright (Chromium Engine) sesuai `docs/testing/2026-08-03-instruksi-testing-browser.md`

## PUTUSAN: LULUS (100% PASS)

Seluruh pengujian browser smoke & alur login otomatis via browser Chromium berhasil 100% tanpa ada kegagalan.

---

## 1. Hasil Pengujian Browser (Playwright Smoke Suite)

| # | Skenario Uji | Waktu | Hasil |
|---|---|---|---|
| 1 | `audience shell boundaries` › client portal shows customer outcomes | 3.7s | ✅ **PASSED** |
| 2 | `audience shell boundaries` › owner console shows internal control | 5.0s | ✅ **PASSED** |
| 3 | `audience shell boundaries` › client inbox route stays on customer operations | 7.9s | ✅ **PASSED** |
| 4 | `browser login flow` › owner console login redirects automatically to `/tenants` | 7.7s | ✅ **PASSED** |
| 5 | `browser login flow` › client portal login redirects automatically to `/portal/inbox` | 9.1s | ✅ **PASSED** |

**Total Result**: **5 passed (37.1s)**

---

## 2. Checklist Verifikasi Area Fungsional Browser

### B1. Client Portal (`http://127.0.0.1:3002/portal`)
- [x] Login page render bersih tanpa console error (`http://127.0.0.1:3002/portal/login`)
- [x] Form submit login dengan `owner@websitetest.chai.local` & `WebsiteTest#2026` → **otomatis ter-redirect ke `/portal/inbox`**
- [x] Unified Inbox menampilkan queue percakapan & metrics
- [x] Customer operations surface terisolasi dari platform reliability rail

### B2. Owner Console (`http://127.0.0.1:3000`)
- [x] Login page render bersih tanpa console error (`http://127.0.0.1:3000/login`)
- [x] Form submit login dengan `founder@websitetest.chai.local` & `WebsiteTest#2026` → **otomatis ter-redirect ke `/tenants`**
- [x] Internal control surface terisolasi dari customer outcomes

### B3. API Readiness & Connectivity (`http://127.0.0.1:3001`)
- [x] `GET /api/v1/health` → `200 OK`
- [x] `POST /api/service/v1/channels/mock-channel/webhook` → `201 Created`
- [x] API default `apiBaseUrl` terkonfigurasi ke `http://127.0.0.1:3001` (IPv4 binding yang stabil untuk Node 24)

---

## 3. Catatan Teknis & Perbaikan Environment
- Playwright `webServer` kini menyertakan `DATABASE_URL` secara eksplisit pada `playwright.config.ts` untuk memastikan `PostgresCredentialStore` terhubung ke container PostgreSQL lokal.
- Dev server `apiBaseUrl` telah disesuaikan dari `localhost` ke `127.0.0.1` pada halaman login `owner-console` dan `client-portal` untuk menghindari penundaan IPv6 resolution di Node.js 24.
