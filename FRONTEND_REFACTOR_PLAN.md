# Rencana Perbaikan Chai Platform — Frontend Wiring & Backend Integration

> **Tanggal**: 24 Juli 2026
> **Berdasarkan**: audit `feature_audit_report.md` (24 Jul 2026)
> **Constraint**: Sesuai Blueprint v1.2 (18 dokumen spec). Refactor frontend diperbolehkan selama tidak melanggar spec.
> **Prinsip ponytail**: solusi minimal yang menyelesaikan akar masalah, bukan tambahan abstraksi.

---

## 0. Diagnosis Akar Masalah (bukan gejala)

Backend (42 modul NestJS + 39 migrations + RLS + connector registry + 9 workers) **sudah production-ready**. Database layer paling matang. Infrastruktur integrasi frontend juga sudah lengkap:

- ✅ BFF proxy: `apps/*/src/app/api/[...path]/route.ts` — inject Bearer dari HttpOnly cookie
- ✅ `@chai/api-client/react` — TanStack Query v5, `useApiQuery`, `useApiMutation`, `useInboxStream` (SSE), `QueryProvider`
- ✅ `@chai/auth-client` — `SessionGuard`, `session-provider`, server-auth
- ✅ Middleware auth per-audience (`client-portal`, `owner-console`)

**Yang putus**: page-page `.tsx` tidak memakai infrastruktur di atas. Ada tiga lapis API access yang saling tidak konsisten:

| Lapis | Lokasi | Kualitas | Dipakai? |
|---|---|:---:|:---:|
| BFF proxy + `@chai/api-client/react` | `app/api/[...path]` + `packages/api-client/src/react/` | ✅ Enterprise (idempotency, retry, TanStack Query, SSE, auth via cookie) | ❌ Tidak (hanya `providers.tsx` setup) |
| Custom `ApiClient` naïve | `apps/client-portal/src/lib/api-client.ts` | 🔴 Bypass BFF, hardcode `tenantId='demo-tenant-id'`, tanpa auth token | ✅ Dipakai `useApi` hook → `customers/page.tsx` |
| Hardcoded `MOCK_*` di komponen root-level | `owner-overview.tsx`, `unified-inbox.tsx`, `tenants-overview.tsx`, `payments/page.tsx`, `analytics` | 🔴 100% mock | ✅ Mayoritas page |

**Tambahan**: komponen root-level (`src/*.tsx`) hidup paralel dengan App Router (`src/app/*/page.tsx` yang hanya re-export). Pola thin-wrapper ini menyembunyikan fakta bahwa page sebenarnya tidak server-rendered dengan data.

---

## 1. Tujuan Refactor

1. Setiap page memakai `useApiQuery`/`useApiMutation` dari `@chai/api-client/react` (via BFF proxy, auth via cookie).
2. Hapus custom `ApiClient` naïve + `useApi` hook (konsolidasi ke `@chai/api-client`).
3. Hapus `MOCK_*` hardcoded; ganti dengan data backend (atau loading/error state jika endpoint belum ada).
4. Konsolidasi struktur: pindahkan komponen root-level ke `components/` atau inline ke `app/` sebagai server/client component sesuai spec Next.js 15.
5. Tambah `loading.tsx`/`error.tsx` per async route (konvensi AGENTS.md).
6. Perbaiki tes stale (label EN → ID, atau ekstrak i18n).

---

## 2. Prasyarat Verifikasi (sebelum mulai)

Konfirmasi endpoint backend yang tersedia untuk dipanggil frontend. Jalankan:

```powershell
# Daftar route NestJS tersedia
rg "@Controller\(['``\"]" apps/api/src/modules --glob "*.controller.ts" -l
rg "@Get|@Post|@Put|@Patch|@Delete" apps/api/src/modules --glob "*.controller.ts" -o | Sort-Object | Get-Unique
```

Buat tabel mapping **frontend route → backend controller → endpoint path** (lihat §3.3). Ini menjadi kontrak integrasi.

---

## 3. Fase Eksekusi

### Fase 1 — Konsolidasi API Client (1 sesi, risiko rendah)

**Tujuan**: hapus duplikasi, pakai satu sumber kebenaran.

**3.1** Hapus `apps/client-portal/src/lib/api-client.ts` dan `apps/client-portal/src/hooks/useApi.ts`.

**3.2** Update `apps/client-portal/src/app/customers/page.tsx` (satu-satunya pemakai `useApi`):
- Ganti `import { useApi } from '../../hooks/useApi'` → `import { useApiQuery } from '@chai/api-client/react'`
- Ganti `const { data } = useApi('/customers', DEFAULT_CUSTOMERS)` → `const { data } = useApiQuery({ queryKey: ['customers'], url: '/v1/customers' })`
- Hapus `DEFAULT_CUSTOMERS`; `loading.tsx`/`error.tsx` handle state.

**3.3** Verifikasi `@chai/api-client/react` export `useApiQuery` dengan signature yang cocok. Baca `packages/api-client/src/react/use-api-query.ts`. Jika signature beda, sesuaikan call site, bukan hook-nya.

**3.4** Cek `owner-console` — apakah punya `lib/api-client.ts`/`hooks/useApi.ts` serupa? Jika ya, hapus juga. (grep awal tidak menemukan, tapi verifikasi ulang.)

**Verifikasi Fase 1**: `pnpm --filter @chai/client-portal typecheck` exit 0. `customers/page.tsx` masih render (dengan loading state jika endpoint belum ada).

---

### Fase 2 — Wiring Page ke Backend (multi-sesi, risiko sedang)

Urutkan page berdasarkan **dampak × ketersediaan endpoint**. Mulai dari yang endpoint-nya sudah pasti ada.

#### 2a. Login & Session (sudah ✅, verifikasi saja)
`apps/client-portal/src/app/login/page.tsx` + `owner-console/src/app/login/page.tsx` sudah pakai `@chai/auth-client` `createLoginAction`. Tidak perlu diubah. Verifikasi: login → redirect → session cookie ter-set → `/inbox` load tanpa 401.

#### 2b. Owner Console — Tenants (prioritas tertinggi)
- File: `apps/owner-console/src/tenants-overview.tsx` (13000 bytes, `MOCK_TENANTS_DATA`)
- Endpoint target: `apps/api/src/modules/tenants` — verifikasi `tenants.controller.ts` ada `@Get()` list.
- Refactor:
  - Jadikan `app/tenants/page.tsx` server component yang fetch via BFF (gunakan `cookies()` + `@chai/auth-client` server helper), atau
  - Pertahankan client component tapi pakai `useApiQuery({ queryKey: ['tenants'], url: '/v1/tenants' })`.
  - Pilih sesuai spec Blueprint §03 (UX/UI) — jika halaman butuh interaktivitas real-time (filter/search), client component + TanStack Query lebih cocok.
- Hapus `tenants-overview.tsx` root-level setelah logic dipindah, ATAU jadikan pure presentational component di `components/tenants-overview.tsx` yang menerima `data` prop.

#### 2c. Client Portal — Unified Inbox (prioritas tinggi, ada SSE)
- File: `apps/client-portal/src/unified-inbox.tsx` (19292 bytes) + `app/inbox/page.tsx` (re-export)
- Endpoint: `apps/api/src/modules/channels/channels.controller.ts` → `listConversations(tenantId, principalId)` (line 86)
- Realtime: `apps/realtime-gateway` SSE + `@chai/api-client/react` `useInboxStream`
- Refactor:
  - `app/inbox/page.tsx` → server component fetch initial conversations via BFF
  - Komponen inbox (client) → `useInboxStream` untuk live update + `useApiMutation` untuk send message
  - Ini paling kompleks karena SSE; pastikan `apps/client-portal/src/app/api/realtime/conversations/route.ts` (sudah ada) terhubung ke realtime-gateway.

#### 2d. Owner Console — Overview Dashboard
- File: `apps/owner-console/src/owner-overview.tsx` (353 lines, `MOCK_TENANTS_DATA`, tombol "Ping Webhook"/"Hentikan AI Klien" palsu)
- Endpoint: agregasi dari `/v1/tenants` + `/v1/metrics` + `/v1/sla` — jika tidak ada endpoint agregasi, buat **BFF aggregation route** `app/api/overview/route.ts` yang fetch multiple endpoint server-side.
- Atau: jika Blueprint §03 spec overview = summary card per-section, buat 4 `useApiQuery` paralel di client component.

#### 2e. Sisa page (urutan)
Untuk setiap page di bawah, pola sama: baca komponen root-level → identifikasi endpoint → ganti mock → pindah ke `app/` atau `components/`.

| App | Page | Backend module | Prioritas |
|---|---|---|:---:|
| client-portal | analytics | `analytics` / `advanced-analytics` | sedang |
| client-portal | payments | `payments` (controller ada, 3088 bytes) | sedang |
| client-portal | bookings | `calendar` / `leads` | sedang |
| client-portal | commerce | `commerce` (verifikasi ada) | rendah |
| client-portal | knowledge | `knowledge` | sedang |
| client-portal | leads | `leads` | sedang |
| client-portal | shipments | `logistics` / `shipment-state-machine` | sedang |
| client-portal | team | `iam` | sedang |
| client-portal | settings | (verifikasi) | rendah |
| owner-console | ai-operations | `ai-agent` (controller 2721 bytes) | sedang |
| owner-console | automation | `automation` + `automation-builder` | sedang |
| owner-console | audit | `audit` / `audit-immutability` | rendah |
| owner-console | logistics | `logistics` / `advanced-logistics` | sedang |
| owner-console | marketplace + webhooks | `marketplace` + `connector-config` | sedang |
| owner-console | reliability | `sla` / `quarantine` / `retention` / `dlq` | rendah |
| owner-console | settings | (verifikasi) | rendah |
| owner-console | whitelabel | `whitelabel` | rendah |

**Verifikasi per page**: `pnpm --filter @chai/<app> typecheck && pnpm --filter @chai/<app> test`. Manual: login → buka page → cek Network tab → request ke `/api/v1/...` → 200 OK dengan data real.

---

### Fase 5.6 Backend tenants endpoint (prioritas tinggi — blocker untuk Fase 2b wiring)
- **Verifikasi 24 Jul**: `tenants.controller.ts` **TIDAK ADA**. Tidak ada endpoint list tenants / provision / suspend di backend. Owner console `tenants-overview.tsx` tidak punya endpoint untuk dipanggil.
- Schema tenant sudah ada di `0001_foundation.sql` (tabel `chai.tenant`). Yang hilang: controller + repository + module wiring.
- Buat `apps/api/src/modules/tenants/`: `tenants.controller.ts` (`@Controller('api/owner/v1/tenants')`, `@RequireAudience('owner-console')`, handlers list/provision/suspend/delete), `tenants.repository.ts` (postgres, ikuti pattern iam), `tenants.module.ts`, daftar di `app.module.ts`.
- Setelah ini selesai, Fase 2b (wiring tenants-overview) bisa dieksekusi.

### Fase 5.7 Backend mock controllers (prioritas medium — data integrity)
- **Verifikasi 24 Jul**: `analytics.controller.ts:32-78` return data **hardcode** (`'68%'`, `'42'`, `'Rp 48.500.000'`) meski punya prefix benar + `RequireAudience`. Frontend yang wiring ke endpoint ini akan terima mock dari backend, bukan data real.
- Backend mock lebih menipu daripada frontend mock karena infrastruktur terlihat benar. Audit controller lain untuk pattern serupa.
- Fix: ganti return hardcoded dengan query ke `postgres-analytics.repository.ts` (sudah ada).

---

### Fase 3 — Struktur Frontend (risiko rendah, setelah Fase 2)

Setelah page pakai data real, rapikan struktur:

**3.1** Untuk setiap komponen root-level `src/*.tsx` yang masih ada:
- Jika pure presentational (menerima props) → pindah ke `src/components/<name>.tsx`
- Jika page-level (punya `MOCK_*` + layout) → inline ke `src/app/<route>/page.tsx`, hapus root-level

**3.2** Tambah `loading.tsx` dan `error.tsx` per route segment (konvensi AGENTS.md):
```tsx
// app/inbox/loading.tsx
export default function Loading() { return <PageSkeleton /> }
// app/inbox/error.tsx
'use client';
export default function Error({ error, reset }: { error: Error; reset: () => void }) { ... }
```

**3.3** Konsistenkan AppShell usage. `packages/ui/src/app-shell.tsx` (24829 bytes) sudah ada — pastikan setiap page pakai `<AppShell navigation={...}>` dari config bersama, bukan hardcode nav per-page.

**3.4** Hapus file `.test.tsx` root-level yang mendampingi komponen yang dipindah — tulis ulang tes di lokasi baru (`components/__tests__/` atau co-located).

---

### Fase 4 — Perbaikan Tes & Dokumentasi (risiko rendah)

**4.1** Perbaiki tes stale owner-console:
- `tenants-overview.test.tsx:10-13` mengharapkan `'Tenant directory'`/`'Risk flags'` (EN) tapi komponen render ID.
- Opsi A (ponytail): update tes ke label ID aktual.
- Opsi B (jika akan ada i18n): ekstrak label ke `packages/ui` dictionary atau `messages.json` Next-intl, tes jadi locale-agnostic.
- Rekomendasi: Opsi A sekarang, Opsi B jika ada rencana multi-bahasa.

**4.2** Perbaiki `AGENTS.md` root (D:\Games\Agent\AGENTS.md) — klaim "DB: MongoDB, MySQL, PostgreSQL, Prisma, Redis, SQLite" menyesatkan. Aktual: PostgreSQL + Drizzle + raw SQL. Hapus yang tidak ada.

**4.3** Update `feature_audit_report.md` jika ada perubahan status setelah refactor.

---

### Fase 5 — Backend Gaps & Security (risiko sedang, paralel dengan Fase 2)

Item-item ini ditemukan di verifikasi lanjutan dan sebelumnya tidak ada di rencana. Sebagian independen dari frontend, bisa dikerjakan paralel.

**5.1 ai-agent persistence** (prioritas tinggi jika AI feature masuk MVP)
- `apps/api/src/modules/ai-agent/ai-agent.module.ts:10-13` hardcode `useClass: InMemoryAIAgentRepository`.
- Buat `postgres-ai-agent.repository.ts` mengikuti pattern modul lain (mis. `iam/postgres-iam.repository.ts`). Cek apakah migration untuk `ai_agent_profile`/`ai_agent_session` sudah ada di `packages/database/migrations/` — jika belum, buat.
- Ganti binding di module: `useClass` → `useFactory` yang switch berdasarkan env (pattern: in-memory untuk test, postgres untuk prod).
- Tambah DTO validation di controller (`@Body() body: any` → `@Body() body: CreateAgentProfileDto`).

**5.2 Rate limiting** (prioritas tinggi — security)
- Tambah `@fastify/rate-limit` ke `apps/api/package.json`.
- Register di `bootstrap.ts`: global default (mis. 100 req/menit per IP), override per-route untuk webhook (1000/menit) dan public endpoint.
- Spesifik: webhook WhatsApp Meta (`channels.controller.ts`) butuh allowance tinggi tapi tetap bounded untuk anti-abuse.

**5.2b Temporal server di compose** (prioritas tinggi jika automation/AI workflow masuk MVP)
- `workers/temporal/src/worker.ts` connect ke `TEMPORAL_ADDRESS` tapi `infra/compose/docker-compose.yml` + `docker-compose.prod.yml` tidak ada service Temporal.
- Tambah service `temporal` (image `temporalio/auto-setup`) + `temporal-ui` di compose staging.
- Atau: dokumentasikan `TEMPORAL_ADDRESS` wajib point ke external cluster (mis. Temporal Cloud) di `.env.example` dan runbook.
- Verifikasi: tanpa ini, `automation-worker` + `temporal` worker fail saat startup.

**5.2c Structured logger** (prioritas medium — observability)
- `bootstrap.ts` punya `correlationHook` tapi tidak ada logger backend.
- Tambah `nestjs-pino` + `pino` (paling idiomatic untuk NestJS). Register `LoggerModule.forRoot()` dengan correlation ID dari request hook.
- Wire ke otel-collector yang sudah ada di compose (infra/monitoring/otel-collector).
- Ganti `console.log`/`console.error` raw di workers (temporal worker.ts pakai `console.log('[TemporalWorker]...')`) ke structured logger.

**5.3 Widget SDK** (prioritas medium — hanya jika MVP butuh embeddable chat)
- Backend endpoint sudah ada (`widget.controller.ts`).
- Buat package `packages/widget-sdk` atau `apps/widget-sdk`: JS bundle yang bisa di-embed di website customer via `<script src="...">`.
- Spec: Blueprint §03 (UX/UI) — cek detail widget behavior.
- Jika tidak masuk MVP, tandai sebagai "backend ready, SDK deferred" di laporan.

**5.4 Controller prefix standardization** (prioritas TINGGI sekarang — chaos kontraktual)
- **Verifikasi final menemukan 5+ skema inkonsisten**: `api/client/v1/<r>` (mayoritas), tanpa prefix (`analytics`, `ai-agent`, `shipments`, `templates`, `tickets`, `widgets`, `sla`), `api` (advanced-payments), `api/v1/whitelabel`.
- Frontend hanya bisa menebak path per-endpoint. Ini blocker nyata untuk Fase 2 (frontend wiring) — tidak bisa sambungkan page tanpa path yang konsisten.
- **Urutan**:
  1. Inventarisasi semua prefix: `rg -o "@Controller\([^)]*\)" apps/api/src/modules --glob "*.controller.ts"`
  2. Standardisasi ke `api/<audience>/v1/<resource>` (`api/client/v1/...`, `api/owner/v1/...`, `api/public/v1/...`).
  3. Update semua controller.
  4. Update e2e test yang hardcode path lama.
  5. Setelah ini, Fase 2 frontend wiring aman dilanjutkan.
- **Rekomendasi**: kerjakan **sebelum/sebagai bagian Fase 1**, bukan setelah Fase 2. Tanpa kontrak path yang stabil, Fase 2 akan retret.

**5.5 Klarifikasi duplicate modules** (prioritas rendah, risiko rendah)
- Konfirmasi pasangan `analytics`/`advanced-analytics`, `payments`/`advanced-payments`/`payment-state-machine`, `logistics`/`advanced-logistics`, `audit`/`audit-immutability`, `automation`/`automation-builder` apakah:
  - (a) base + extension (stage phasing), atau
  - (b) duplikat yang harus di-konsolidasi.
- Baca `app.module.ts` import + komentar di tiap module. Jika (b), hapus yang mati.

---

### Fase 6 — Realtime Gateway Hardening (risiko sedang, opsional untuk MVP)

Hanya jika MVP butuh realtime inbox live (bukan poll):

**5.1** Ganti in-memory `EventStore` (`apps/realtime-gateway/src/main.ts:18`) dengan persistent store — pakai tabel `realtime_event` di Postgres (cek apakah migration ada) atau Redis stream.

**5.2** Ganti "synthetic header" auth (komentar `ponytail:` di `main.ts`) dengan validasi session token nyata via `@chai/auth`.

**5.3** Verifikasi SSE reconnect dari client (`@chai/api-client` `sse-client.ts` 4531 bytes — cek apakah ada auto-reconnect logic).

---

## 4. Urutan Eksekusi Rekomendasi (REVISI — chaos kontraktual mengubah prioritas)

```
Fase 5.4 (prefix standardization)           — 1 sesi, BLOCKER untuk Fase 2 (tanpa kontrak path stabil, wiring frontend retret)
  ↓
Fase 1 (konsolidasi API client)             — 1 sesi
  ↓
Fase 2b (tenants) + 2c (inbox)              — 2 sesi, dampak tertinggi
  ↓
Fase 2d (overview) + 2e sisa page           — 3-4 sesi
  ||  (paralel)
Fase 5.1 (ai-agent postgres repo)          — schema sudah ada, tinggal implementasi
Fase 5.2 (rate limiting)                    — security, independen
Fase 5.2b (Temporal server di compose)      — opsional, hanya jika automation MVP
Fase 5.2c (structured logger)               — observability
  ↓
Fase 3 (struktur) + Fase 4 (tes/docs)       — 1-2 sesi
  ↓
Fase 5.3 (widget SDK) + 5.5 (duplikat)      — opsional
  ↓
Fase 6 (realtime hardening)                 — opsional
```

**Perubahan kunci dari versi sebelumnya**: Fase 5.4 (prefix) **naik prioritas ke depan** karena verifikasi final menemukan chaos kontraktual 5+ skema inkonsisten. Tanpa path backend yang konsisten, Fase 2 (wiring frontend ke backend) tidak bisa dimulai — frontend tidak tahu path mana yang benar per-endpoint.

**Definition of Done per page**:
- [ ] Tidak ada `MOCK_*` / `DEFAULT_*` hardcoded
- [ ] Pakai `useApiQuery`/`useApiMutation` dari `@chai/api-client/react` (atau server component fetch via BFF)
- [ ] Ada `loading.tsx` + `error.tsx`
- [ ] `typecheck` + `test` exit 0
- [ ] Manual: data dari backend tampil, aksi (create/update/delete) persist

**Definition of Done keseluruhan**:
- [ ] `turbo run typecheck` exit 0
- [ ] `turbo run test` exit 0 (36/36)
- [ ] `turbo run lint` exit 0
- [ ] `pnpm test:e2e` exit 0 (84/84 tetap hijau setelah refactor)
- [ ] 0 file `MOCK_*` di `apps/*/src`
- [ ] 0 komponen root-level `src/*.tsx` (semua di `app/` atau `components/`)
- [ ] `AGENTS.md` root akurat soal stack
- [ ] ai-agent module pakai postgres repo (schema `0023_ai_agent.sql` sudah ada)
- [ ] Rate limiting aktif di API (`@fastify/rate-limit`)
- [ ] Controller prefix konsisten `api/<audience>/v1/<resource>` (0 skema inkonsisten)
- [ ] Temporal service ada di compose ATAU `TEMPORAL_ADDRESS` external didokumentasikan
- [ ] Structured logger (pino) ter-wiring ke otel-collector

---

## 5. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Endpoint backend belum ada untuk page tertentu | Prioritaskan page yang endpoint-nya sudah ada (§3 tabel). Untuk yang belum, buat endpoint minimal atau tampilkan "Coming soon" state (jangan mock). |
| Mismatch penamaan frontend vs backend (`customers` ↔ `contact-segment`/`iam`, `inbox` ↔ `channels`+`ticket`, `team` ↔ `iam`) | Buat mapping eksplisit di §2 prasyarat. Frontend pakai path konsep bisnis (`/v1/customers`), backend expose alias atau BFF route translate. |
| Refactor inbox (SSE) kompleks, bisa break | Kerjakan terakhir setelah Fase 1 & 2b stabil. Pertahankan fallback poll jika SSE gagal. |
| Tes frontend break saat struktur pindah | Update tes bersamaan dengan pemindahan komponen, jangan ditunda. |
| `@chai/api-client/react` signature hook belum diverifikasi | Baca `packages/api-client/src/react/use-api-query.ts` sebelum Fase 2 dimulai. Sesuaikan call site, bukan hook. |

---

## 6. Catatan: Yang TIDAK Perlu Diubah

- Backend (42 modul) — sudah production-ready.
- Database (39 migrations + RLS) — paling matang.
- Connector registry + WhatsApp Meta — nyata.
- Workers (9) — runner nyata.
- Auth layer — nyata.
- `@chai/api-client` + `@chai/auth-client` + BFF proxy — infrastruktur benar, tinggal dipakai.
- AI Gateway (6 file logic) — bukan skeleton.
- Tooling (Turbo/pnpm/vitest/playwright) — lengkap.

**Intinya**: jangan tambah abstraksi baru. Yang ada sudah cukup — yang hilang cuma **pemakaian** infrastruktur yang sudah dibangun.

---

*Rencana perbaikan · 24 Juli 2026 · Berbasis audit evidence-based*
