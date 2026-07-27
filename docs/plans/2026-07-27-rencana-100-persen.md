# Rencana Penyelesaian 100% — Chai

> **Dokumen ini adalah kontrak kerja.** Dibuat 2026-07-27 setelah audit final independen
> pada commit `5569a3d`. Setiap angka dan klaim di bagian "Kondisi Terverifikasi" berasal
> dari perintah yang benar-benar dijalankan, bukan laporan agen sebelumnya.
>
> **Untuk agen yang mengerjakan:** baca dokumen ini SAMPAI HABIS sebelum menyentuh satu
> berkas pun. Kerjakan fase secara BERURUTAN. Jangan melompat. Jangan berimprovisasi di
> luar resep yang tertulis. Bila resep dan kenyataan kode berbeda, BERHENTI dan laporkan
> selisihnya, jangan menebak.

---

## 1. Tujuan akhir

Repo ini harus bisa di-deploy ke produksi dan berfungsi sebagaimana mestinya:

1. `pnpm run build` hijau, sehingga image Docker bisa dibangun.
2. Setiap endpoint yang terdaftar menyimpan datanya di PostgreSQL di bawah RLS —
   tidak ada endpoint yang menjawab `200` lalu kehilangan datanya saat restart.
3. Semua variabel environment yang wajib benar-benar tersedia di infra produksi.
4. Seluruh gerbang verifikasi hijau, termasuk `docker build`, `docker run ... id`
   (non-root), dan keberadaan `apps/api/dist/main.js` di dalam image.

---

## 2. Kondisi terverifikasi saat ini (baseline, jangan diragukan tanpa bukti baru)

Semua ini hasil eksekusi nyata pada 2026-07-27. Exit code harfiah:

| Perintah | Exit | Catatan |
|---|---|---|
| `pnpm install` | 0 | 24 project |
| `pnpm run lint` | 0 | 23/23 paket |
| `pnpm run typecheck` | 0 | 23/23 paket |
| `pnpm run build` | **1** | ❌ `@chai/api#build` GAGAL — satu-satunya gerbang merah |
| `pnpm run test` | 0 | 36/36 task; root 164 lulus / 9 skip; apps/api unit 176 |
| `pnpm --filter @chai/database run test:integration` | 0 | 42 tes |
| `pnpm --filter @chai/domain run test:integration` | 0 | 49 tes |
| `pnpm --filter @chai/api run test:integration` | 0 | 94 tes |
| `pnpm --filter @chai/api run test:e2e` | 0 | 143 tes |
| `pnpm --filter @chai/broker run test:integration` | 0 | 9 tes |
| worker integrasi (automation/inbox/outbox/logistics/payment) | 0 semua | automation-worker 6 tes |
| `docker build -f infra/Dockerfile -t chai-final:local .` | **1** | ❌ gagal di `RUN pnpm run build` |
| `docker compose ... production ... config --quiet` | 0 | |
| `docker compose ... staging ... config --quiet` | 0 | |

Yang sudah BENAR dan tidak boleh dirusak:

- 56 migrasi SQL apply dari nol, ledger `chai.schema_migration` terisi dengan checksum
  64-hex, dan re-run kedua menghasilkan `applied: []` (idempoten).
- Tes `rls-coverage` menanyai `pg_class` untuk SETIAP tabel bertenant_id di skema
  `public` + `chai` dan menuntut `ENABLE` + `FORCE ROW LEVEL SECURITY` + minimal satu
  policy. Hanya `chai.audit_log` dikecualikan. Empat role runtime `NOBYPASSRLS`.
- Nol `eslint-disable` baru, nol `: any`, nol `.skip(` / `.only(`, nol TODO/FIXME asli,
  nol controller yang meng-`new` repository.
- Secret MFA terenkripsi AES-256-GCM, kunci wajib, enrolment gagal keras tanpa kunci.

---

## 3. ATURAN KERAS — melanggar salah satu = pekerjaan ditolak

1. **Jangan** menambah `eslint-disable` dalam bentuk apa pun.
2. **Jangan** menambah tipe `any`. Gunakan tipe row eksplisit (lihat pola di §9).
3. **Jangan** memakai non-null assertion (`!`). Gunakan helper `requireRow` (§9).
4. **Jangan** menonaktifkan, men-`skip`, atau menghapus tes yang ada.
5. **Jangan** menambah dependensi. Semua yang dibutuhkan sudah ada
   (`@chai/database`, `node:crypto`).
6. **Jangan** melonggarkan guard atau invarian. RLS tetap `ENABLE` + `FORCE`, role
   runtime tetap `NOBYPASSRLS`, urutan guard tetap Audience → Authorization → Entitlement.
7. **JANGAN PERNAH mengedit berkas migrasi yang sudah ada.** Runner memvalidasi checksum;
   mengubah migrasi lama akan membuat runner menolak jalan. Migrasi baru selalu berkas
   baru dengan nomor berikutnya.
8. **Nomor migrasi baru dimulai dari `0062`.** Nomor tertinggi saat ini `0061`.
9. Uang selalu integer minor units. Tidak ada `float`, tidak ada `DECIMAL` untuk uang.
10. Repositori in-memory **tetap dipertahankan**, jangan dihapus. Suite e2e berjalan tanpa
    `DATABASE_URL` dan bergantung padanya.

### Catatan lingkungan (PowerShell di Windows)

`&&` **tidak valid** sebagai pemisah perintah. Gunakan `;`:

```powershell
pnpm run lint; echo "EXIT=$LASTEXITCODE"
```

Selalu cetak `$LASTEXITCODE` dan laporkan angkanya. Jangan menyimpulkan "hijau" dari
teks di layar — hanya exit code yang dihitung.

Turbo punya cache. Bila ragu sebuah kegagalan nyata atau sisa cache, tambahkan `--force`:
`pnpm exec turbo run build --force`.

---

## 4. Definition of Done — checklist final

Pekerjaan dinyatakan 100% HANYA bila semua baris ini terbukti dengan exit code:

- [ ] `pnpm install` → 0
- [ ] `pnpm run lint` → 0
- [ ] `pnpm run typecheck` → 0
- [ ] `pnpm run build` → **0**
- [ ] `pnpm run test` → 0
- [ ] `pnpm --filter @chai/database run test:integration` → 0
- [ ] `pnpm --filter @chai/domain run test:integration` → 0
- [ ] `pnpm --filter @chai/api run test:integration` → 0 (jumlah tes ≥ 94 + tes baru)
- [ ] `pnpm --filter @chai/api run test:e2e` → 0 (≥ 143)
- [ ] `pnpm --filter @chai/broker run test:integration` → 0
- [ ] kelima worker `test:integration` → 0
- [ ] `docker build -f infra/Dockerfile -t chai-final:local .` → **0**
- [ ] `docker run --rm chai-final:local id` → menampilkan `uid=1000(node)`, BUKAN root
- [ ] `apps/api/dist/main.js` terbukti ada di dalam image
- [ ] `docker compose` config produksi dan staging → 0
- [ ] `grep` "useClass: InMemory" di `apps/api/src/modules/**` → **0 kemunculan tanpa gerbang DB**
- [ ] Semua env wajib tersedia di `infra/production/.env.example` dan compose

---

## 5. FASE 1 (P0) — Perbaiki build `@chai/api`

**Dampak: tanpa ini tidak ada image, jadi tidak ada deploy. Kerjakan paling pertama.**

### Akar masalah (sudah didiagnosis, jangan diagnosis ulang)

`apps/api/package.json` skrip `build` memakai:

```
--alias:@chai/auth=../../packages/auth/src/index.ts
```

esbuild menerapkan alias itu secara **prefix**, sehingga impor `@chai/auth/server`
dipetakan menjadi `../../packages/auth/src/index.ts/server` — path yang tidak ada.
`packages/auth/package.json` memang mengekspor `"./server": "./src/server.ts"`, tetapi
alias esbuild menimpa peta ekspor itu.

Tiga berkas pengimpor yang terdampak (jangan diubah, biarkan impornya apa adanya):
`apps/api/src/auth/auth-rate-limit.ts:7`, `apps/api/src/auth/login.controller.ts:18`,
`apps/api/src/auth/mfa.controller.ts:22`.

### Perbaikan

Di `apps/api/package.json`, pada skrip `build`, tambahkan **satu** alias untuk subpath,
dan letakkan **SEBELUM** alias bare `@chai/auth`:

```
--alias:@chai/auth/server=../../packages/auth/src/server.ts
```

Sehingga skrip menjadi (satu baris):

```
esbuild src/main.ts --bundle --platform=node --format=esm --packages=external --alias:@chai/auth/server=../../packages/auth/src/server.ts --alias:@chai/auth=../../packages/auth/src/index.ts --alias:@chai/contracts=../../packages/contracts/src/index.ts --sourcemap --outfile=dist/main.js
```

Urutan penting: alias yang lebih spesifik harus lebih dulu.

### Verifikasi Fase 1

```powershell
cd apps/api; pnpm run build; echo "BUILD_EXIT=$LASTEXITCODE"; cd ../..
pnpm run build; echo "ROOT_BUILD_EXIT=$LASTEXITCODE"
Test-Path apps/api/dist/main.js
```

Harus `0`, `0`, `True`. Perbaikan ini sudah dibuktikan berhasil saat audit (bundle
469.5 kb, tanpa galat lain). Bila muncul galat lain, laporkan penuh dan berhenti.

> Catatan: kegagalan ini **sudah ada sejak commit `5569a3d`** (impor dan alias identik di
> baseline). Jadi ini bukan regresi yang perlu dicari penyebabnya di pekerjaan terbaru.

---

## 6. FASE 2 (P1) — Sediakan environment wajib di produksi

Dua variabel dibaca kode tetapi **tidak ada** di `infra/production/.env.example` maupun
`infra/production/docker-compose.yml`. Terverifikasi kosong lewat pencarian per-berkas.

### 2a. `MFA_SECRET_KEY` — WAJIB, tanpa ini enrolment MFA gagal keras

`apps/api/src/auth/mfa-secret-crypto.ts` melempar bila variabel ini absen (ini desain
yang benar: menolak menyimpan secret plaintext). Akibatnya di produksi enrolment TOTP
akan `500` sampai variabel disediakan.

Format yang diterima: 64 karakter hex, atau base64 yang mendekode ke 32 byte.
Baca ulang `mfa-secret-crypto.ts` untuk memastikan sebelum menulis dokumentasi.

Tambahkan ke `infra/production/.env.example` (dan padanan staging), dengan komentar
yang menjelaskan cara membuatnya:

```
# Kunci enkripsi secret TOTP (AES-256-GCM). WAJIB: tanpa ini enrolment MFA gagal keras
# dan sengaja tidak punya nilai default agar secret tidak pernah tersimpan plaintext.
# Buat dengan: openssl rand -hex 32
MFA_SECRET_KEY=
```

Lalu teruskan ke service `api` di `infra/production/docker-compose.yml` pada blok
`environment:` milik service `api`, mengikuti gaya variabel lain di berkas itu:

```yaml
      MFA_SECRET_KEY: ${MFA_SECRET_KEY:?MFA_SECRET_KEY is required}
```

Gunakan bentuk `:?` (wajib, gagal saat render bila kosong), **bukan** default kosong.
Setelah itu `docker compose ... config --quiet` dengan `.env.example` akan GAGAL selama
nilainya kosong — itu perilaku yang benar dan diinginkan. Untuk tetap bisa memvalidasi
compose, isi `.env.example` dengan nilai dummy yang jelas-jelas contoh, misalnya 64 nol,
dan beri komentar bahwa nilai nyata wajib diganti saat deploy.

### 2b. `TRUSTED_PROXY_CIDRS` — perbaiki throttling massal

`apps/api/src/auth/auth-rate-limit.ts` memakai `request.ip` sebagai kunci rate limit
(baris 64 untuk limit global). `bootstrap.ts` menyetel
`trustProxy: parseTrustedProxy(process.env.TRUSTED_PROXY_CIDRS)`; bila variabel absen
hasilnya `false`. Karena nginx berada di depan API, seluruh permintaan akan terlihat
berasal dari satu IP nginx, sehingga semua tenant berbagi satu bucket 10.000/menit.

Ini **bukan** celah keamanan — arahnya fail-closed, XFF palsu diabaikan. Tetapi berisiko
insiden ketersediaan. Sediakan nilainya:

```
# Daftar CIDR/IP proxy yang dipercaya, dipisah koma. Kosong = tidak memercayai proxy
# mana pun (request.ip = peer socket). Di produksi API berada di belakang nginx pada
# jaringan backend compose, jadi isi dengan subnet jaringan itu.
TRUSTED_PROXY_CIDRS=
```

Dan teruskan ke service `api`:

```yaml
      TRUSTED_PROXY_CIDRS: ${TRUSTED_PROXY_CIDRS:-}
```

Sebelum menetapkan nilai default, **baca** `parseTrustedProxy` di
`apps/api/src/bootstrap.ts` agar format yang didokumentasikan benar-benar sesuai yang
di-parse. Jangan mengarang format.

### Verifikasi Fase 2

```powershell
docker compose -f infra/production/docker-compose.yml --env-file infra/production/.env.example config --quiet; echo "PROD=$LASTEXITCODE"
docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env.example config --quiet; echo "STAGING=$LASTEXITCODE"
Select-String -Path infra/production/docker-compose.yml -Pattern 'MFA_SECRET_KEY|TRUSTED_PROXY_CIDRS'
```

Kedua compose harus `0` dan kedua variabel harus muncul.

---

## 7. FASE 3 (P3) — `trustProxy` di realtime-gateway

`apps/realtime-gateway/src/main.ts:46` masih `Fastify({ logger: false, trustProxy: true })`.

Dampak nyata saat ini **rendah**: paket itu tidak pernah membaca `request.ip` (sudah
diperiksa, nol kemunculan) dan logger mati, jadi tidak ada rate limit atau keputusan auth
yang bisa dibelokkan. Ini kerapian agar tidak menjadi bug saat nanti ada kode yang
membaca `request.ip`.

Perbaikan: samakan polanya dengan API. Impor tidak boleh melanggar batas paket — periksa
dulu apakah `apps/realtime-gateway` boleh mengimpor dari `apps/api` (kemungkinan besar
TIDAK; tes `tests/import-boundary.test.ts` akan menangkapnya). Bila tidak boleh, tulis
fungsi kecil setara di dalam `apps/realtime-gateway/src/` — jangan memaksa impor lintas app.

```ts
trustProxy: parseTrustedProxy(process.env.TRUSTED_PROXY_CIDRS),
```

Sertakan satu tes kecil yang gagal bila logikanya rusak (lihat §10 soal kewajiban tes).

### Verifikasi Fase 3

```powershell
pnpm --filter @chai/realtime-gateway run typecheck; echo "TSC=$LASTEXITCODE"
pnpm --filter @chai/realtime-gateway run test; echo "TEST=$LASTEXITCODE"
pnpm exec vitest run tests/import-boundary.test.ts; echo "BOUNDARY=$LASTEXITCODE"
```

---

## 8. FASE 4 & 5 (P1) — Persistensi 11 modul yang masih in-memory

### Keputusan yang sudah diambil — jangan diperdebatkan lagi

Sebelas modul masih mengikat `useClass: InMemory` tanpa gerbang database. Semuanya
terdaftar di `app.module.ts`, tanpa entitlement gating, total **130 endpoint**. Karena
`infra/production/docker-compose.yml` menjalankan `api replicas: 5`, tulisan yang dilayani
satu replika tidak terlihat oleh empat lainnya dan hilang saat restart.

Terverifikasi: **tidak satu pun** dari 130 endpoint ini dipanggil frontend (pencarian di
`apps/client-portal`, `apps/owner-console`, `packages/api-client` = nol; kecocokan kata
"enterprise" hanya nama paket `'ENTERPRISE'` di `owner-overview.tsx`, bukan panggilan API).

**Keputusan: PERSISTENKAN semuanya, jangan hapus.** Alasan: pemilik repo menghendaki
aplikasi berfungsi utuh, tabel dan RLS-nya sudah ada, dan polanya sudah terbukti pada 8
modul. Mencabut 130 endpoint adalah amputasi produk yang tidak diminta.

Tiga modul yang menghadap tenant (`widget`, `attachment`, `advanced-analytics`) sudah
menyalurkan dan memfilter `tenantId` di kode in-memory-nya, jadi ini cacat **durabilitas
dan konsistensi**, bukan kebocoran lintas tenant. Jangan melaporkannya sebagai kebocoran.

### Peta modul → tabel (hasil pembacaan migrasi, akurat)

**Kelompok A — tabel sudah di skema `chai`, antarmuka relatif bersih.**
Kerjakan kelompok ini dulu; ini pengulangan mekanis dari pola yang sudah ada.

| Modul | Migrasi | Tabel |
|---|---|---|
| `observability` | 0018 | `chai.service_level_indicator`, `chai.error_budget`, `chai.incident`, `chai.runbook`, `chai.runbook_execution` |
| `enterprise` | 0019 | `chai.sso_configuration`, `chai.scim_configuration`, `chai.custom_role`, `chai.role_assignment`, `chai.audit_export_config`, `chai.audit_export_history` |
| `advanced-analytics` | 0020 | `chai.analytics_dashboard`, `chai.analytics_report`, `chai.analytics_report_execution`, `chai.predictive_model`, `chai.prediction_result`, `chai.cohort_definition` |
| `multi-region` | 0021 | `chai.tenant_region`, `chai.region_routing_rule`, `chai.region_replication_status`, `chai.data_residency_audit` |
| `partner-ecosystem` | 0022 | `chai.partner`, `chai.api_key`, `chai.api_version`, `chai.sdk_release`, `chai.rate_limit_usage` |
| `attachment` | 0026 | `chai.attachment` |

**Kelompok B — tabel ada di skema `public`, dan antarmukanya belum menyalurkan `tenantId`
pada metode entitas anak.** Ini lebih sulit; kerjakan setelah Kelompok A selesai dan hijau.

| Modul | Migrasi | Tabel (skema `public`) |
|---|---|---|
| `quarantine` | 0029 | `public.quarantine_entries`, `public.quarantine_access_log` |
| `retention` | 0030 | `public.retention_policies`, `public.retention_jobs` |
| `connector-config` | 0031 | `public.connector_configs`, `public.connector_secrets` |
| `impersonation` | 0032 | `public.impersonation_sessions`, `public.impersonation_audit_log` |
| `widget` | 0033 | `public.widgets`, `public.widget_sessions` |

Tabel `public.*` ini **sudah** diberi `ENABLE` + `FORCE ROW LEVEL SECURITY` + policy oleh
migrasi `0040_public_table_rls.sql`, dan tes `rls-coverage` membuktikannya. Jadi
**persistenkan terhadap tabel yang sudah ada ini**; JANGAN membuat tabel `chai.*` baru dan
JANGAN memindahkan skema. Ketidakseragaman skema dicatat sebagai utang teknis, bukan
pemblokir. Ini pilihan paling sedikit risikonya.

### Resep per modul (ikuti persis, satu modul sampai hijau baru lanjut modul berikutnya)

**Langkah 1 — baca dulu.** Buka `apps/api/src/modules/<modul>/<modul>.repository.ts` dan
catat setiap metode abstrak beserta tanda tangannya. Buka juga berkas migrasinya untuk
melihat nama kolom sebenarnya. Jangan menebak nama kolom.

**Langkah 2 — periksa grant.** Bila kontrak punya metode `delete*`, tabelnya butuh
`GRANT DELETE`. Periksa dengan:

```powershell
Select-String -Path packages/database/migrations/*.sql -Pattern 'GRANT[^;]*ON <nama_tabel>'
```

Bila `DELETE` belum ada, buat migrasi baru (mulai `0062`) mengikuti persis gaya
`0053_persistent_module_deletes.sql` atau `0058_contact_segment_delete_grant.sql`. Jangan
mengedit migrasi lama.

**Langkah 3 — tulis repositori Postgres.** Buat
`apps/api/src/modules/<modul>/postgres-<modul>.repository.ts` mengikuti pola kanonik §9.
Contoh acuan terbaik yang sudah ada di repo: `apps/api/src/modules/sla/postgres-sla.repository.ts`.

**Langkah 4 — pasang gerbang database di module.** Ubah `<modul>.module.ts` dari
`useClass: InMemoryX` menjadi `useFactory` dengan gerbang `DATABASE`. Bentuk persisnya:

```ts
import { Module } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from '../../database/database.module';
import { XController } from './x.controller';
import { XRepository, InMemoryXRepository } from './x.repository';
import { PostgresXRepository } from './postgres-x.repository';

@Module({
  controllers: [XController],
  providers: [
    {
      inject: [DATABASE],
      provide: XRepository,
      useFactory: (database: DatabaseHandle): XRepository =>
        database
          ? new PostgresXRepository(database)
          : // ponytail: e2e tanpa DATABASE_URL tetap in-memory.
            new InMemoryXRepository(),
    },
  ],
  exports: [XRepository],
})
export class XModule {}
```

⚠️ **Perhatian token provider.** Sebagian modul memakai token string
(`provide: 'QuarantineRepository'`) dan bukan kelas abstrak. Bila demikian, **pertahankan
token string yang sama** supaya `@Inject('QuarantineRepository')` di controller tetap
cocok. Jangan mengubah token, atau DI akan pecah saat runtime tanpa tertangkap typecheck.

**Langkah 5 — tulis tes integrasi.** Buat
`apps/api/test/integration/<modul>.integration.test.ts` dengan MINIMAL dua tes:

1. **Round-trip persistensi**: tulis lewat satu instance repositori, baca lewat instance
   repositori yang BARU (membuktikan data ada di database, bukan di memori proses).
2. **Isolasi lintas tenant**: tenant B tidak boleh melihat baris tenant A.

Contoh acuan: `apps/api/test/integration/sla.integration.test.ts` dan
`apps/api/test/integration/contact-segment.integration.test.ts`. Ikuti cara keduanya
memperoleh handle database dan menyiapkan tenant.

**Langkah 6 — verifikasi modul itu sebelum lanjut.**

```powershell
cd apps/api
pnpm exec tsc --project tsconfig.json --noEmit; echo "TSC=$LASTEXITCODE"
pnpm exec eslint src/modules/<modul> test/integration/<modul>.integration.test.ts; echo "LINT=$LASTEXITCODE"
pnpm exec vitest run --config vitest.integration.config.ts test/integration/<modul>.integration.test.ts; echo "IT=$LASTEXITCODE"
cd ../..
```

Keempatnya harus `0`. Kalau merah, perbaiki dulu. **Jangan** menumpuk beberapa modul
dalam keadaan merah.

---

## 9. Pola kode kanonik (salin ini)

### Kerangka repositori Postgres

```ts
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { DATABASE, SERVICE_PRINCIPAL_ID } from '../../database/database.module';
import { XRepository, type XThing } from './x.repository';

/** Bentuk baris database — eksplisit, tanpa `any`. */
interface XThingRow {
  created_at: Date;
  id: string;
  name: string;
  tenant_id: string;
}

@Injectable()
export class PostgresXRepository extends XRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async list(tenantId: string): Promise<XThing[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<XThingRow[]>`
        SELECT * FROM chai.x_thing
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapThing(row));
    });
  }

  override async create(tenantId: string, input: { name: string }): Promise<XThing> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<XThingRow[]>`
        INSERT INTO chai.x_thing (id, tenant_id, name)
        VALUES (${id}, ${tenantId}, ${input.name})
        RETURNING *
      `;
      return mapThing(requireRow(rows));
    });
  }

  private tx<T>(
    tenantId: string,
    work: (tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    return withTenantTransaction(
      this.database,
      { principalId: SERVICE_PRINCIPAL_ID, tenantId },
      work,
    );
  }
}

function mapThing(row: XThingRow): XThing {
  return {
    createdAt: row.created_at.toISOString(),
    id: row.id,
    name: row.name,
    tenantId: row.tenant_id,
  };
}

/** Baris pertama hasil RETURNING, tanpa non-null assertion. */
function requireRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) {
    throw new Error('expected a returned row');
  }
  return row;
}
```

### Jebakan yang sudah diketahui — hemat waktu Anda

1. **Kolom `jsonb` dikembalikan sebagai string** oleh driver ini, bukan objek. Salin
   helper berikut **ke dalam berkas repositori Anda sendiri**, di bawah kelasnya:

   ```ts
   /** Driver ini mengembalikan jsonb sebagai string; objek dilewatkan apa adanya. */
   function parseJson<T>(value: unknown): T {
     return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
   }
   ```

   ⚠️ **Jangan mengimpornya dari modul lain.** Helper ini sengaja diduplikasi lokal di
   enam repositori Postgres yang sudah ada (`ai-agent`, `campaign`, `notification`,
   `template`, `contact-segment`, `audit-immutability`) karena aturan batas impor melarang
   satu modul mengambil berkas modul lain. Menyalinnya adalah pola yang benar di sini,
   bukan duplikasi yang perlu "dirapikan".
2. **`timestamptz`** perlu cast eksplisit saat insert: `${nilai}::timestamptz`.
3. **Filter opsional** ditulis `AND (${filter}::uuid IS NULL OR kolom = ${filter}::uuid)`
   dengan `const filter = arg ?? null;` — lihat `listBreaches` di `postgres-sla.repository.ts`.
4. **`withTenantTransaction` wajib** untuk setiap query. Inilah yang menyetel
   `app.tenant_id` sehingga policy RLS berlaku. Query di luar itu akan ditolak RLS.
5. Setiap `DELETE`/`UPDATE` tetap **harus** menyertakan `WHERE tenant_id = ${tenantId}`
   meski RLS sudah aktif. Ikat pengaman ganda, jangan bergantung pada satu lapis saja.

---

## 10. Kewajiban tes

Logika non-trivial wajib meninggalkan satu pemeriksaan yang bisa dijalankan — hal terkecil
yang gagal bila logikanya rusak. Untuk fase ini artinya:

- Setiap modul yang dipersistenkan: dua tes integrasi (round-trip + isolasi tenant).
- `parseTrustedProxy` di realtime-gateway: satu tes unit.
- Jangan menambah framework, fixture berat, atau mock elaboratif.

Jumlah tes hanya boleh **naik**. Bila ada yang turun, jelaskan sebabnya secara eksplisit
dengan rekonsiliasi angka (contoh rekonsiliasi yang benar: unit 202 → 176 karena −34 dari
5 berkas tes modul yang dihapus, +8 dari mfa-secret-crypto).

Jangan mengubah `expect(flattened.length).toBeGreaterThan(250)` di
`apps/api/test/route-permission-coverage.test.ts` kecuali jumlah route benar-benar berubah.
Karena fase ini tidak menambah/menghapus route, angka itu harus tetap.

---

## 11. FASE 6 — Gerbang akhir dan verifikasi image

Jalankan HANYA setelah Fase 1–5 hijau. Laporkan exit code harfiah setiap perintah.

```powershell
pnpm install;                                              echo "INSTALL=$LASTEXITCODE"
pnpm run lint;                                             echo "LINT=$LASTEXITCODE"
pnpm run typecheck;                                        echo "TYPECHECK=$LASTEXITCODE"
pnpm run build;                                            echo "BUILD=$LASTEXITCODE"
pnpm run test;                                             echo "TEST=$LASTEXITCODE"
pnpm --filter @chai/database run test:integration;          echo "DB=$LASTEXITCODE"
pnpm --filter @chai/domain run test:integration;            echo "DOMAIN=$LASTEXITCODE"
pnpm --filter @chai/api run test:integration;               echo "API_IT=$LASTEXITCODE"
pnpm --filter @chai/api run test:e2e;                       echo "API_E2E=$LASTEXITCODE"
pnpm --filter @chai/broker run test:integration;            echo "BROKER=$LASTEXITCODE"
```

Lalu image — ini yang belum pernah berhasil sekali pun, jadi buktikan ketiganya:

```powershell
docker build -f infra/Dockerfile -t chai-final:local .;    echo "DOCKER_BUILD=$LASTEXITCODE"
docker run --rm chai-final:local id;                       echo "DOCKER_ID=$LASTEXITCODE"
docker run --rm chai-final:local node -e "console.log(require('node:fs').existsSync('/app/apps/api/dist/main.js'))"
```

Hasil yang wajib: `DOCKER_BUILD=0`; `id` menampilkan `uid=1000(node)` (bukan `uid=0(root)`);
perintah ketiga mencetak `true`.

Terakhir, buktikan metrik utama sudah nol:

```powershell
Select-String -Path apps/api/src/modules/**/*.module.ts -Pattern 'useClass:\s*InMemory'
```

Harus tidak menghasilkan keluaran sama sekali.

---

## 12. Buku besar progres — perbarui tabel ini setiap fase selesai

Isi kolom bukti dengan exit code nyata, bukan kata "selesai".

| Fase | Pekerjaan | Status | Bukti (exit code) |
|---|---|---|---|
| 1 | Alias esbuild `@chai/auth/server` | BELUM | |
| 2a | `MFA_SECRET_KEY` di env + compose | BELUM | |
| 2b | `TRUSTED_PROXY_CIDRS` di env + compose | BELUM | |
| 3 | `trustProxy` realtime-gateway | BELUM | |
| 4.1 | Persist `observability` | BELUM | |
| 4.2 | Persist `enterprise` | BELUM | |
| 4.3 | Persist `advanced-analytics` | BELUM | |
| 4.4 | Persist `multi-region` | BELUM | |
| 4.5 | Persist `partner-ecosystem` | BELUM | |
| 4.6 | Persist `attachment` | BELUM | |
| 5.1 | Persist `quarantine` | BELUM | |
| 5.2 | Persist `retention` | BELUM | |
| 5.3 | Persist `connector-config` | BELUM | |
| 5.4 | Persist `impersonation` | BELUM | |
| 5.5 | Persist `widget` | BELUM | |
| 6 | Gerbang akhir + verifikasi image | BELUM | |

---

## 13. Bila macet

- **Sudah dua kali gagal dengan pendekatan sama?** Berhenti menambal. Cari akar
  masalahnya, sebutkan apa yang salah, lalu ganti pendekatan.
- **Resep dokumen ini tidak cocok dengan kode nyata?** Kode yang benar, dokumen yang
  salah. Laporkan selisihnya, jangan memaksakan resep.
- **Butuh melonggarkan guard, menambah `any`, atau men-skip tes agar hijau?** Itu tanda
  pendekatannya salah. Jangan lakukan. Laporkan hambatannya.
- **Tes integrasi butuh Docker.** Pastikan Docker Desktop berjalan. Testcontainers
  menyalakan PostgreSQL sendiri.
- **Kegagalan yang muncul lalu hilang** biasanya cache turbo atau kontensi sumber daya.
  Jalankan ulang suite yang bersangkutan secara terisolasi sebelum menyimpulkan.


---

## 14. Standar kode wajib — dipaksakan compiler dan linter, bukan selera

Bagian ini bukan saran gaya. Setiap butir di tabel berikut akan **menggagalkan**
`typecheck` atau `lint`. Kalau Anda mengabaikannya, Anda akan terjebak siklus
merah-perbaiki-merah. Baca sekali, patuhi selalu.

Sumber: `tsconfig.base.json` dan `eslint.config.mjs`.

| Aturan aktif | Artinya bagi kode Anda | Yang WAJIB Anda tulis |
|---|---|---|
| `noUncheckedIndexedAccess: true` | `rows[0]` bertipe `T \| undefined`, bukan `T` | Pakai helper `requireRow(rows)`. **JANGAN** `rows[0]!` (non-null assertion dilarang) dan jangan `rows[0]` langsung |
| `noImplicitOverride: true` | Setiap metode yang mengimplementasikan metode abstrak wajib ditandai | `override async list(...)`. Lupa `override` = galat compiler |
| `verbatimModuleSyntax: true` + `consistent-type-imports: error` | Impor tipe dan impor nilai harus dipisah eksplisit | `import type { Database } from '@chai/database';` untuk tipe; `import { withTenantTransaction } from '@chai/database';` untuk nilai. Boleh digabung dengan penanda `type` per-anggota: `import { withTenantTransaction, type Database } from '@chai/database';` |
| `noUnusedLocals` + `noUnusedParameters` | Impor atau variabel yang tidak dipakai = galat | Bersihkan sisa impor setiap kali Anda menyunting |
| `no-explicit-any: error` | `any` dilarang keras | Deklarasikan `interface XRow { ... }` eksplisit untuk setiap bentuk baris database |
| `@typescript-eslint/strict` | Termasuk larangan non-null assertion | Tidak ada `!` sebagai penegas non-null di mana pun |
| `strict: true`, `noImplicitAny` | Semua parameter bertipe | Tidak ada parameter implisit |
| `isolatedModules: true` | | Jangan re-export tipe tanpa `export type` |

### Batas impor (dipaksakan ESLint, akan menggagalkan lint dan tes boundary)

- **Jangan pernah** mengimpor repositori modul lain. Pola yang diblokir:
  `../*/*.repository`, `../*/postgres-*.repository`, `../*/in-memory-*.repository`.
  Kebutuhan lintas modul dilayani lewat port di `apps/api/src/modules/shared`.
- Modul `analytics` dan `advanced-analytics` punya larangan tambahan: tidak boleh
  mengimpor spesifier apa pun yang cocok `**/modules/*/*.repository` atau
  `**/modules/*/postgres-*.repository`. Impor relatif ke repositori **milik sendiri**
  (`./advanced-analytics.repository`, `./postgres-advanced-analytics.repository`) tetap
  boleh karena spesifiernya tidak mengandung `modules/`. Jangan mengubah bentuk impor itu
  menjadi path panjang.
- Frontend tidak boleh mengimpor `@chai/database`, `@chai/domain`, `postgres`, `pg`.
- Connector tidak boleh mengimpor database atau domain.

Tes `tests/import-boundary.test.ts` menegakkan ini di tingkat workspace. Kalau tes itu
merah, Anda melanggar arsitektur, bukan menemukan bug tes.

### Konvensi penamaan dan bentuk (tidak dipaksakan linter, tapi WAJIB diikuti agar diff seragam)

- Nama berkas: `postgres-<modul>.repository.ts`, persis pola yang sudah ada.
- Nama kelas: `Postgres<Modul>Repository`, meng-`extends` kontrak abstrak yang ada.
- Nama interface baris: `<Entitas>Row`, dengan kolom **snake_case** sesuai database.
- Fungsi pemeta: `map<Entitas>(row): <Entitas>` di luar kelas, bukan metode privat.
- Urutan properti di dalam interface dan di objek yang dikembalikan: **alfabetis**.
  Seluruh repo memakai konvensi ini; ikuti agar review mudah.
- Setiap penyederhanaan yang sengaja diberi komentar berawalan `ponytail:` yang menyebut
  batasnya dan jalur peningkatannya. Contoh yang sudah ada: gerbang in-memory untuk e2e.
- Komentar menjelaskan **mengapa**, bukan mengulang **apa** yang sudah jelas dari kode.

### Self-review wajib sebelum menyatakan satu modul selesai

Jawab tujuh pertanyaan ini, tertulis, untuk setiap modul. Kalau ada satu saja yang "tidak",
modul itu belum selesai:

1. Setiap metode abstrak di kontrak sudah diimplementasikan dan ditandai `override`?
2. Setiap query dibungkus `withTenantTransaction`?
3. Setiap `SELECT`/`UPDATE`/`DELETE` menyertakan `WHERE tenant_id = ${tenantId}`?
4. Tidak ada `any`, tidak ada `!`, tidak ada `eslint-disable`, tidak ada impor tak terpakai?
5. Kolom `jsonb` didekode lewat helper, bukan diasumsikan sudah objek?
6. Ada dua tes integrasi (round-trip lewat instance baru, dan isolasi lintas tenant)?
7. Token provider di `<modul>.module.ts` **sama persis** dengan yang di-`@Inject` controller?

---

## 15. Protokol berpikir — urutan yang wajib Anda tempuh

Tujuan bagian ini: mencegah Anda menulis kode sebelum memahami masalahnya. Diff kecil di
tempat yang salah bukan efisiensi, itu bug kedua.

### Sebelum menyentuh modul apa pun, jawab tertulis dulu

Untuk setiap modul di Fase 4 dan 5, tulis jawaban enam pertanyaan ini di respons Anda
**sebelum** menyunting berkas. Ini murah dan mencegah kerja ulang yang mahal:

1. Apa saja metode abstrak di `<modul>.repository.ts`, dan apa tanda tangan tepatnya?
2. Tabel dan kolom mana yang dipakai, menurut berkas migrasinya? (sebutkan nama kolom
   sebenarnya, jangan menebak dari nama properti TypeScript)
3. Apakah kontraknya punya metode `delete*`? Kalau ya, apakah `GRANT DELETE` sudah ada?
4. Apakah ada kolom `jsonb` yang perlu didekode?
5. Token provider modul ini: kelas abstrak atau string? Apa persisnya?
6. Apakah ada metode yang **tidak** menerima `tenantId`? Kalau ya, itu modul Kelompok B
   dan Anda perlu menambahkan parameter `tenantId` ke tanda tangan lalu memperbarui
   controller pemanggilnya di modul yang sama.

### Tangga keputusan sebelum menulis kode baru

Berhenti di tingkat pertama yang berlaku:

1. Apakah ini benar-benar perlu dibuat? Kalau dokumen tidak memintanya, jangan buat.
2. Apakah sudah ada di repo ini? Pakai ulang polanya. `requireRow`, `parseJson`, dan
   struktur `postgres-sla.repository.ts` sudah ada — salin bentuknya ke berkas Anda.
   Catatan: `requireRow` dan `parseJson` **disalin lokal per berkas**, tidak diimpor
   lintas modul (aturan batas impor melarangnya).
3. Apakah pustaka standar sudah menyediakannya? `node:crypto` `randomUUID` sudah dipakai.
4. Baru setelah itu: tulis kode seminimal mungkin yang bekerja.

Larangan tegas: **tidak ada abstraksi baru** yang tidak diminta dokumen ini. Tidak ada
kelas dasar generik, tidak ada "repository factory", tidak ada lapisan pemetaan baru.
Sebelas modul memakai pola yang sama secara berulang — pengulangan yang jelas lebih baik
daripada abstraksi cerdas yang tidak diminta.

### Perbaikan bug: akar, bukan gejala

Kalau sebuah tes gagal, cari sebabnya sampai akar sebelum menambal. Kalau fungsi yang Anda
sentuh punya beberapa pemanggil, perbaiki fungsi bersamanya satu kali, bukan menambal tiap
pemanggil.

### Batas cakupan Anda per fase

Sentuh **hanya** berkas yang disebut fase yang sedang Anda kerjakan:

- Fase 4/5 modul X: `apps/api/src/modules/X/**`, `apps/api/test/integration/X.integration.test.ts`,
  dan bila perlu satu migrasi grant baru bernomor ≥ 0062.
- **Jangan** menyentuh modul lain, `packages/**`, `workers/**`, atau `infra/**` saat
  mengerjakan sebuah modul.
- **Jangan** menyunting `app.module.ts` di Fase 4/5: semua sebelas modul sudah terdaftar
  di sana. Kalau Anda merasa perlu mengubahnya, Anda salah paham; berhenti dan laporkan.
- **Jangan** menyunting tes milik modul lain atau tes bersama seperti
  `route-permission-coverage.test.ts`.

### Kalau ragu, hierarki keputusannya

1. Kode nyata di repo mengalahkan dokumen ini.
2. Dokumen ini mengalahkan asumsi Anda.
3. Asumsi Anda bukan bukti. Kalau Anda belum menjalankan perintahnya, Anda belum tahu.

Jangan pernah menyatakan sesuatu hijau tanpa exit code. Jangan pernah menyatakan sebuah
berkas berisi sesuatu tanpa membacanya.

### Format laporan setelah setiap fase

Laporkan dengan bentuk ini, tanpa hiasan:

```
FASE <n> — <nama>
Berkas disentuh:
  - <path> (baru | diubah)
Verifikasi:
  tsc            EXIT=<angka>
  eslint         EXIT=<angka>
  tes terkait    EXIT=<angka>, <jumlah> lulus / <jumlah> gagal
Self-review 7 butir: <jawaban singkat, sebutkan bila ada yang "tidak">
Status: HIJAU | MERAH (<sebab>)
```

Kalau MERAH, jangan lanjut ke fase berikutnya. Perbaiki, atau laporkan hambatan yang
benar-benar tidak bisa dilewati beserta bukti perintahnya.

### Yang dilarang saat Anda tertekan untuk membuat gerbang hijau

Ini jalan pintas yang akan membuat pekerjaan ditolak seluruhnya:

- Menambah `eslint-disable` atau `any` agar lint/typecheck lolos.
- Men-`skip`, menghapus, atau melemahkan assertion sebuah tes.
- Menurunkan angka ambang di tes (`toBeGreaterThan`) tanpa perubahan route nyata.
- Mengedit berkas migrasi yang sudah ada agar tes migrator lolos.
- Mengubah `ENABLE`/`FORCE ROW LEVEL SECURITY` atau memberi `BYPASSRLS` ke role runtime.
- Menghapus repositori in-memory agar tidak perlu membuat gerbang database.

Kalau satu-satunya jalan menuju hijau terasa seperti salah satu di atas, pendekatan Anda
yang salah. Berhenti dan laporkan.
