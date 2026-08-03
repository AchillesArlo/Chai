# ADR-0031: Migrasi ke OIDC Workload Identity, Mengganti API Key Statis Jangka Panjang (REQ-10-015)

- **Status**: PROPOSED / USULAN — **belum diterima, belum diimplementasi**. Menyentuh
  autentikasi produksi; wajib review manusia langsung sebelum satu baris kode ditulis.
- **Tanggal**: 2026-08-01
- **Pemilik**: Platform Security & Architecture Team
- **Persyaratan Terkait**: REQ-10-015 (`10_SECURITY.md` §6 — "OIDC workload identity, tanpa API key statis jangka panjang")
- **Sesi**: FASE 26 (audit ulang + tutup sisa LOW). Dokumen ini adalah **rencana**, sesuai
  arahan dokumen sumber "laporkan rencana dulu sebelum mengubah apa pun".

---

## 1. Konteks & Permasalahan

REQ-10-015 menuntut identitas workload berbasis **OIDC** (token berumur pendek, difederasi dari
Identity Provider) untuk menggantikan **API key statis jangka panjang**. Audit menandai ini `HILANG`
karena tidak ada federasi OIDC di mana pun; seluruh autentikasi mesin-ke-mesin memakai kredensial
statis. Sebelum memutuskan migrasi, keadaan nyata dipetakan dulu (verifikasi kode, bukan taksiran).

### 1.1 Inventaris kredensial statis saat ini (hasil `grep` kode, 2026-08-01)

| # | Permukaan | Lokasi kode | Bentuk sekarang | Arah |
|---|---|---|---|---|
| 1 | **API key partner/SDK** (inbound) | `apps/api/src/modules/partner-ecosystem/` — `chai.api_key`, `createApiKey`/`listApiKeys`/`revokeApiKey` | Key acak panjang, di-hash saat rekam (`key_hash` NOT NULL), `keyRaw` hanya dikembalikan sekali. Tak ada masa berlaku wajib. | Pihak ketiga → platform |
| 2 | **Kredensial provider AI** (outbound) | `packages/connectors/src/factory.ts` → `env.OPENAI_API_KEY`, `env.ANTHROPIC_API_KEY`; adapter `openai`/`anthropic` | API key statis dari env; fallback echo deterministik saat absen (dev/CI). | Platform → SaaS |
| 3 | **Kredensial provider logistik** (outbound) | `factory.ts` → `env.JNE_API_KEY`; adapter `jne` mengirim `API_KEY` header | API key statis dari env. | Platform → SaaS |
| 4 | **Kredensial provider payment** (outbound) | adapter `midtrans` — `MIDTRANS_SERVER_KEY`/`MIDTRANS_CLIENT_KEY` | Server key statis; verifikasi webhook pakai key global (lihat REQ-17-058 SEBAGIAN). | Platform ↔ SaaS |
| 5 | **Secret per-tenant** | `SecretService` (AES-256-GCM at-rest, migrasi 0086, FASE 5); `EnvSecretBackend` | Nilai secret dienkripsi at-rest, kolom DB hanya `secret_ref`; rotasi teraudit via AuditPort. Tetap **kredensial statis** secara sifat, hanya tersimpan aman. | Penyimpanan |

**Catatan penting**: identitas antar-service internal Chai **tidak** memakai API key — service
berbagi PostgreSQL dan diautentikasi lewat **role** database (`chai_app_runtime`,
`chai_worker_runtime`, `NOBYPASSRLS`). Jadi celah "API key statis" ada di **tepi** (partner inbound +
provider outbound), bukan di jalur service-to-service internal. Ini mempersempit lingkup migrasi.

### 1.2 Mengapa ini belum dikerjakan di sesi ini

Mengubah cara sebuah sistem membuktikan identitasnya adalah perubahan autentikasi paling berisiko:
salah konfigurasi audience/issuer/clock-skew membuat **seluruh** panggilan gagal (outage) atau,
lebih buruk, menerima token yang seharusnya ditolak (bypass). Aturan keras sesi FASE 26: **jangan
sentuh kode autentikasi produksi tanpa review manusia**. Karena itu dokumen ini berhenti di rencana.

---

## 2. Keputusan yang Diusulkan (belum diterima)

Migrasi **bertahap, per-permukaan**, bukan "big bang". Prinsip: hapus kredensial berumur panjang di
tempat yang IdP/vendor mendukung OIDC; di tempat yang vendor **hanya** menyediakan API key statis
(mis. OpenAI, Anthropic saat ini), turunkan risiko dengan rotasi + umur pendek + least-scope, bukan
memaksakan OIDC yang tak didukung.

### 2.1 Prasyarat infrastruktur (blokir keras)
- Sebuah **Identity Provider OIDC** (mis. penyedia cloud workload identity federation, atau IdP
  internal) harus tersedia dan disepakati. Tanpa issuer OIDC, tidak ada yang bisa menerbitkan token
  workload — jadi ini prasyarat, bukan detail implementasi.
- Ini bergandengan dengan REQ-08-032/REQ-08-044 (canary/rollback) yang juga terblokir karena
  `git remote` kosong / CI belum aktif — lihat `docs/plans/2026-08-01-ditunda-sadar-fase26.md`.

### 2.2 Urutan migrasi yang diusulkan
1. **Workload → cloud/KMS (bila dipakai)**: ganti kredensial cloud statis apa pun dengan workload
   identity federation (token OIDC berumur pendek ditukar ke kredensial sementara). Ini permukaan
   paling matang dukungannya dan paling kecil blast-radius produk.
2. **Outbound provider yang mendukung OIDC**: bila provider payment/logistik menyediakan OAuth2
   client-credentials/OIDC, ganti API key statis dengan token berumur pendek yang di-cache dan
   di-refresh; simpan hanya `client_secret`/kunci penandatangan di `SecretService`.
3. **Outbound provider yang HANYA punya API key** (OpenAI/Anthropic hari ini): **tetap** API key,
   tetapi wajib (a) tersimpan lewat `SecretService` (bukan env polos di produksi), (b) rotasi
   terjadwal + teraudit, (c) least-scope per lingkungan. Tandai sebagai "statis dengan mitigasi",
   bukan target OIDC — jangan mengarang federasi yang tak didukung vendor.
4. **Inbound partner/SDK (`chai.api_key`)**: tawarkan jalur OIDC client-credentials/`token-exchange`
   (RFC 8693) berdampingan dengan API key lama; API key lama diberi **masa berlaku wajib** +
   deprecation window, lalu dinonaktifkan per-tenant setelah partner bermigrasi. Verifikasi tetap
   fail-closed dan per-tenant (jaga isolasi RLS).

### 2.3 Invarian yang tidak boleh dilanggar saat migrasi
- Verifikasi identitas tetap **fail-closed**: token tak valid/kedaluwarsa/issuer-salah → tolak.
- Validasi wajib: `iss`, `aud`, `exp`/`nbf` (dengan skew kecil), dan `sub`/claim workload.
- Tidak ada pelonggaran isolasi tenant: token workload tidak boleh menjadi jalan pintas lintas-tenant.
- Setiap penerbitan/penukaran/penolakan token teraudit (pola `AuditPort` yang sudah ada).

---

## 3. Konsekuensi

### Positif (bila diterima & diimplementasi)
- Menghapus kredensial berumur panjang yang bocor = akses permanen; token OIDC pendek membatasi
  jendela penyalahgunaan.
- Rotasi otomatis (token refresh) menggantikan rotasi manual yang mudah terlupa.
- Jejak identitas workload yang kriptografis dan dapat diaudit.

### Risiko & Mitigasi
- *Risiko*: outage total bila issuer/audience/clock-skew salah konfigurasi.
  *Mitigasi*: rollout per-permukaan di belakang flag, jalankan berdampingan dengan kredensial lama
  (dual-auth) selama deprecation window, uji di staging dengan IdP nyata sebelum produksi.
- *Risiko*: vendor SaaS tidak mendukung OIDC → memaksakan federasi menghasilkan kode mati.
  *Mitigasi*: klasifikasikan permukaan (§2.2) — hanya migrasikan yang didukung; sisanya "statis
  dengan mitigasi".
- *Risiko*: menyentuh autentikasi tanpa review = bug rilis kelas-1.
  *Mitigasi*: **status dokumen ini PROPOSED**; implementasi menunggu persetujuan manusia + prasyarat §2.1.

---

## 4. Status penutupan REQ-10-015

Tetap **HILANG** di `DAFTAR-CELAH-MASTER.md` (bukan "ditunda sadar penuh", karena berbeda dari
canary/rollback: sebagian mitigasi sudah ada lewat `SecretService`). ADR ini memenuhi bagian
"laporkan rencana dulu" dari persyaratan; TERPENUHI hanya setelah migrasi §2 diimplementasi dan
diuji dengan IdP nyata. Tidak ada kode autentikasi yang diubah di sesi FASE 26.

---

## 5. Referensi
- `Omnichannel_AI_Platform_Engineering_Blueprint_v1.2/10_SECURITY.md` §6
- `apps/api/src/modules/partner-ecosystem/partner-ecosystem.repository.ts` (`chai.api_key`)
- `packages/connectors/src/factory.ts` (env provider keys)
- `apps/api/src/modules/secret/` + migrasi `0086` (SecretService, FASE 5)
- `docs/plans/2026-08-01-ditunda-sadar-fase26.md` (prasyarat CI/IdP yang berkaitan)
- RFC 8693 (OAuth 2.0 Token Exchange), OpenID Connect Core 1.0
