# Chai

Platform omnichannel AI multi-tenant: satu inbox untuk percakapan pelanggan lintas kanal, dengan agent AI yang bekerja di belakang policy engine, plus modul pembayaran dan logistik yang opsional per tenant.

> Nama `Chai` di sini **bukan** pustaka assertion `chai` di npm. Repo ini tidak menerbitkan paket publik; seluruh paket bertanda `private: true`.

## Arsitektur

Monorepo pnpm + Turborepo, TypeScript strict, Node 24 (engine `>=24.12 <25`), pnpm 11.13.1.

| Bagian | Isi |
|---|---|
| `apps/api` | NestJS di atas Fastify. Seluruh otorisasi, idempotency, dan audit tinggal di sini. |
| `apps/client-portal` | Next.js untuk tenant (inbox, pelanggan, pengetahuan, pembayaran, pengiriman). |
| `apps/owner-console` | Next.js untuk pemilik platform (tenant, reliability, whitelabel, marketplace). |
| `apps/realtime-gateway` | Fastify + SSE. Stream ber-tenant dengan replay `Last-Event-ID`. |
| `services/ai-gateway` | Adapter model, guardrail, RAG, tool execution, dan budget cap. |
| `workers/*` | Dispatcher outbox dan inbox, plus worker channel, payment, logistics, analytics, automation, media, dan Temporal. |
| `packages/*` | `contracts` (skema Zod), `auth`, `database` (SQL mentah + RLS), `domain`, `connectors`, `connector-sdk`, `broker` (Redis Streams: publisher + consumer group untuk outbox), `ui`, `api-client`, `auth-client`, `testkit`. |

Basis data adalah **PostgreSQL** dengan **migrasi SQL mentah** (50 berkas di `packages/database/migrations`, dijalankan runner `@chai/database` lewat `pnpm migrate` dan dicatat di ledger `0048_schema_migration_ledger.sql`) dan **RLS default-deny** pada setiap tabel ber-tenant. Tidak ada Prisma, MongoDB, MySQL, maupun SQLite.

## Invarian yang tidak boleh dilanggar

Ini bukan preferensi gaya; melanggarnya adalah bug rilis.

- **Isolasi tenant**: RLS aktif dan `FORCE` pada setiap tabel ber-tenant; role runtime `NOBYPASSRLS`.
- **Urutan guard**: Audience → Authorization (per-permission) → Entitlement. Tidak ada route yang lolos tanpa keputusan eksplisit.
- **Policy engine adalah satu-satunya pemberi izin** efek samping tool AI. Tool tak dikenal ditolak, bukan dianggap aman.
- **Uang selalu integer minor units** plus kode mata uang. Tidak ada float, tidak ada `DECIMAL` untuk uang.
- **`PAID` tidak pernah mundur**; status terminal tetap terminal; kode provider tak dikenal menjadi `UNKNOWN`.
- **Kapabilitas modul default mati**; core harus tetap jalan dengan semua modul opsional dimatikan.
- **Efek eksternal wajib idempoten dan dapat direkonsiliasi**; mutasi bisnis, audit, dan event commit dalam satu transaksi.

## Menjalankan

```bash
pnpm install
pnpm run typecheck        # 25 paket
pnpm run lint             # termasuk guard boundary impor
pnpm run test             # unit + tes boundary
```

Suite yang butuh Docker (testcontainers menyalakan PostgreSQL sendiri):

```bash
pnpm --filter @chai/database run test:integration
pnpm --filter @chai/domain   run test:integration
cd apps/api && pnpm exec vitest run --config vitest.integration.config.ts
cd apps/api && pnpm exec vitest run --config vitest.e2e.config.ts
```

Telemetry aktif hanya bila `OTEL_EXPORTER_OTLP_ENDPOINT` diisi; tanpa itu SDK sengaja tidak dijalankan agar tidak ada telemetry palsu.

## Dokumentasi

- `Omnichannel_AI_Platform_Engineering_Blueprint_v1.2/` — sumber kebenaran spesifikasi.
- `docs/plans/2026-07-26-blueprint-gap-remediation.md` — audit celah terhadap blueprint beserta status remediasi per fase. **Mulai dari sini** untuk mengetahui apa yang sudah terverifikasi dan apa yang masih utang.
- `graphify-out/` — knowledge graph kode untuk navigasi.
