# Rencana Audit Blueprint Menyeluruh — Menuju Daftar Celah Definitif

> Dibuat 2026-07-27, setelah commit `feb0e20`. Tujuan dokumen ini adalah menghasilkan
> **satu daftar celah definitif** terhadap `Omnichannel_AI_Platform_Engineering_Blueprint_v1.2/`
> sehingga pemilik repo bisa berkata: "kalau daftar ini habis, tidak ada lagi yang kurang."
>
> Dokumen ini adalah rencana **audit**, bukan rencana implementasi. Keluarannya adalah
> temuan berbukti, bukan perubahan kode.

---

## 1. Mengapa audit ini perlu

Gerbang teknis repo ini sudah hijau seluruhnya dan image produksinya sudah terbukti jalan
(commit `feb0e20`). Tetapi hijau bukan berarti lengkap: kode yang **belum ditulis** tidak
akan pernah menyalakan lint, typecheck, atau tes menjadi merah.

`docs/plans/2026-07-26-blueprint-gap-remediation.md` mencantumkan estimasi keselarasan
berikut. Angka ini **warisan agen sebelumnya dan belum diverifikasi ulang**; memverifikasi
atau membantahnya adalah salah satu keluaran audit ini.

| Lapisan | Klaim selaras blueprint |
|---|---|
| Skema DB & kontrak | 85–90% |
| Backend runtime | 55–65% |
| Payment & logistics | ~50% |
| Observability | ~40% |
| AI safety & policy | ~35% |
| Frontend | 25–30% |

Ke-24 temuan `R-01`–`R-24` di dokumen itu berstatus VERIFIED (tertutup). Audit ini
**tidak boleh memercayai status itu**; setiap butir yang relevan diperiksa ulang terhadap
kode hari ini.

---

## 2. Aturan audit — mengikat

1. **Bukti, bukan bacaan dokumen.** Setiap klasifikasi wajib disertai bukti: path berkas
   + nomor baris, atau perintah beserta exit code/keluaran. Dokumen internal (termasuk
   dokumen remediasi dan README) **bukan bukti** — keduanya pernah salah sebelumnya.
2. **Jangan mengubah kode.** Audit ini read-only. Bila Anda menemukan perbaikan satu baris
   yang menggoda, catat sebagai temuan, jangan kerjakan. Auditor yang menyunting artefak
   yang dinilainya merusak nilai auditnya sendiri.
3. **Jangan menjalankan perintah destruktif.** Membaca, mencari, `typecheck`, dan tes
   dibolehkan. Jangan menghapus, jangan `git reset`, jangan mengubah skema database nyata.
4. **Satu persyaratan satu baris temuan.** Jangan menggabungkan lima kekurangan menjadi
   satu butir "frontend belum selesai" — butir seperti itu tidak bisa ditutup.
5. **Kutip persyaratannya.** Sertakan kutipan pendek dari blueprint plus nomor bagiannya,
   agar pembaca bisa menilai tanpa membuka spesifikasi.
6. **Nyatakan ketidaktahuan.** Bila sebuah persyaratan tidak bisa diverifikasi secara
   statis (mis. perilaku di bawah beban), klasifikasikan `TIDAK-TERVERIFIKASI` dan sebutkan
   apa yang dibutuhkan untuk memverifikasinya. Jangan menebak.

---

## 3. Metode: dari spesifikasi ke temuan

Untuk setiap dokumen blueprint dalam cakupan Anda:

**Langkah 1 — ekstraksi persyaratan normatif.** Ambil hanya pernyataan normatif: yang
memakai "MUST", "WAJIB", "harus", "tidak boleh", plus setiap kriteria penerimaan (AC),
ADR, dan DEC. Abaikan prosa penjelas dan latar belakang. Beri ID:

    REQ-<nomor-dokumen>-<urut>    contoh: REQ-10-014 (dokumen 10_SECURITY, persyaratan 14)

**Langkah 2 — verifikasi terhadap kode.** Untuk setiap REQ, cari implementasinya. Gunakan
alat yang paling murah lebih dulu: `graphify query "<pertanyaan>"` bila
`graphify-out/graph.json` ada, lalu pencarian teks, lalu pembacaan berkas.

**Langkah 3 — klasifikasi.** Tepat satu dari lima:

| Kelas | Arti | Bukti yang wajib disertakan |
|---|---|---|
| `TERPENUHI` | Terimplementasi dan terbukti | path:baris, dan bila ada, nama tes yang menegakkannya |
| `SEBAGIAN` | Ada tetapi tidak memenuhi seluruh persyaratan | path:baris + bagian mana yang kurang |
| `HILANG` | Tidak ada jejak implementasi | perintah pencarian yang menghasilkan nol |
| `BERTENTANGAN` | Kode melakukan hal yang dilarang spesifikasi | path:baris yang melanggar |
| `TIDAK-TERVERIFIKASI` | Butuh runtime/beban/manusia | apa yang dibutuhkan agar bisa diputuskan |

**Langkah 4 — severity.** Ikuti taksonomi `18_ENGINEERING_GAPS_AND_REMEDIATIONS.md §2`.
Satu aturan mengalahkan taksonomi itu: **setiap cacat isolasi tenant bersifat
release-blocking terlepas dari severity generiknya.** Cacat yang menyentuh uang, `PAID`
yang mundur, atau izin efek samping tool AI diperlakukan minimal CRITICAL.

**Langkah 5 — tulis temuan** memakai format di §6.

---

## 4. Enam jalur audit — bisa diparalelkan

Setiap jalur berdiri sendiri dan boleh dikerjakan agen berbeda secara serentak, karena
keluarannya berkas terpisah. Total spesifikasi 11.496 baris di 21 dokumen.

| Jalur | Nama | Dokumen blueprint (baris) | Fokus verifikasi |
|---|---|---|---|
| A | Keamanan, privasi, RBAC, tenancy | `10_SECURITY_PRIVACY_AND_RBAC` (386), `05_DATA_MODEL_AND_TENANCY` (927) | RLS + FORCE, urutan guard, permission per route, audience, MFA/recent-auth, retensi & PII, hak akses role |
| B | Kontrak API & realtime, event/otomasi | `06_API_AND_REALTIME_CONTRACT` (482), `07_EVENTS_AUTOMATIONS_AND_JOBS` (545) | Bentuk envelope, idempotency, operation-state 5 status, inbox/outbox transaksional, SSE replay, DLQ |
| C | Payment & logistics | `17_PAYMENT_AND_LOGISTICS_SPEC` (683) | Uang integer minor units, `PAID` tak mundur, kode tak dikenal → `UNKNOWN`, rekonsiliasi, refund berizin, dedup tracking |
| D | AI agent, knowledge, connector | `08_AI_AGENT_AND_KNOWLEDGE` (433), `09_CHANNEL_AND_CONNECTOR_SPEC` (450) | Policy engine satu-satunya pemberi izin, risk tier, injection guard, RAG/retrieval, budget cap, conformance adapter, kill switch |
| E | Frontend, UX, design system | `03_UX_UI_SPECIFICATION` (878), `04_DESIGN_SYSTEM` (399) | Inventaris halaman & state (loading/empty/error), aksesibilitas, komponen wajib, uang minor-unit-safe di UI |
| F | Observability, QA, DevOps/SRE, arsitektur | `02_SYSTEM_ARCHITECTURE` (437), `11_ANALYTICS_AND_KPI_DICTIONARY` (453), `12_QA_AND_TEST_STRATEGY` (456), `13_DEVOPS_SRE_AND_RUNBOOKS` (428) | SLO & burn rate, kamus KPI, strategi tes vs kenyataan, CI, runbook, backup/RPO, healthcheck |

Dokumen lintas jalur, dibaca oleh **semua** jalur sebagai rujukan, bukan sumber temuan
tersendiri: `01_PRODUCT_SCOPE`, `14_ENGINEERING_BACKLOG`, `15_ADR_REGISTER`,
`16_TECH_STACK_AND_REPO_STANDARDS`, `18_ENGINEERING_GAPS_AND_REMEDIATIONS`, `GLOSSARY`,
`PRD_*`. ADR dan DEC di `15_ADR_REGISTER` **wajib** diperiksa oleh jalur yang relevan.

---

## 5. Temuan yang sudah diketahui — pra-isi, jangan ditemukan ulang dari nol

Ini hasil audit 27 Jul 2026 yang sudah berbukti. Masukkan ke daftar akhir; tugas jalur
terkait adalah **memverifikasi ulang statusnya** dan menambah konteks blueprint.

| ID | Temuan | Bukti | Jalur | Severity usulan |
|---|---|---|---|---|
| K-01 | CI belum pernah dieksekusi runner mana pun; `git remote -v` kosong, riwayat 7 commit | `.github/workflows/ci.yml` ada; `git remote -v` nol keluaran | F | HIGH |
| K-02 | Stack compose utuh belum pernah dinyalakan; aplikasi belum pernah boot end-to-end | tidak ada bukti run; e2e berjalan in-process, integrasi via testcontainers | F | HIGH |
| K-03 | Teks pesan pelanggan masuk payload Redis dalam bentuk terbaca | `apps/api/src/modules/channels/postgres-conversation.repository.ts:270` (`text: input.text`) | A | HIGH (privasi) |
| K-04 | RPO ≈ interval dump (default 1 jam); tanpa WAL archiving/PITR | layanan `postgres-backup` di `infra/production/docker-compose.yml:140` | F | MEDIUM |
| K-05 | Karakteristik performa belum terukur sama sekali | 9 tes digerbangi `RUN_PERF_TESTS`, butuh API hidup di `127.0.0.1:3001` | F | MEDIUM |
| K-06 | Healthcheck worker liveness-only (`pgrep -f`), tak mendeteksi worker menggantung | kedua compose | F | MEDIUM |
| K-07 | `AuditMiddleware` mencatat `body` mentah; tidak ter-wire, jadi ranjau tidur | `apps/api/src/middleware/audit.middleware.ts:52`, nol call site | A | MEDIUM |
| K-08 | Retrieval knowledge belum hybrid dengan pgvector | dicatat sebagai utang di dokumen remediasi §akhir | D | MEDIUM |
| K-09 | Lima modul persisten di skema `public`, bukan `chai` (aman, ber-RLS FORCE, tak seragam) | migrasi 0029–0033 + 0040 | A | LOW |
| K-10 | Enam generator ID memakai `Math.random` di jalur produksi | `dlq.repository.ts:31`, 3× `packages/domain/src/automation/library/*`, `retention-job/runner.ts:66`, `ai-gateway/src/cost-accounting.ts:40` | B | LOW |
| K-11 | Nomor migrasi berlubang (0054–0056, 0059–0060) | daftar `packages/database/migrations` | F | INFO |
| K-12 | Satu kegagalan flaky `@chai/domain` integrasi tak bisa direproduksi (1 gagal dari 5 run; paket tak tersentuh) | `git status -- packages/domain` kosong | F | LOW (perlu diamati) |

---

## 6. Format keluaran

Setiap jalur menulis **satu** berkas: `docs/audit/2026-07-27/jalur-<huruf>-<nama>.md`.

Isi berkas: tabel ringkasan di atas, lalu satu blok per temuan.

```markdown
## Ringkasan Jalur A

| ID | Persyaratan | Kelas | Severity |
|---|---|---|---|
| REQ-10-014 | Setiap route dipetakan ke typed permission | TERPENUHI | - |
| REQ-10-021 | Secret at rest terenkripsi | SEBAGIAN | HIGH |

---

### REQ-10-021 — Secret at rest terenkripsi · SEBAGIAN · HIGH

**Persyaratan** (`10_SECURITY §4.2`): "Setiap secret tenant WAJIB terenkripsi at rest
dengan kunci yang dirotasi."

**Kondisi nyata**: Secret TOTP terenkripsi AES-256-GCM
(`apps/api/src/auth/mfa-secret-crypto.ts:41-60`), tetapi `public.connector_secrets`
menyimpan nilai apa adanya (`packages/database/migrations/0031_connector_config.sql:24`).
Tidak ada mekanisme rotasi kunci di mana pun (`grep -r "rotate.*key"` = 0 hasil).

**Yang kurang**: enkripsi untuk connector secret, dan rotasi kunci untuk keduanya.

**Bukti**: path:baris di atas; perintah pencarian dan keluarannya.
```

Setelah keenam jalur selesai, konsolidasikan menjadi
`docs/audit/2026-07-27/DAFTAR-CELAH-MASTER.md`:

- satu tabel berisi **seluruh** temuan dari keenam jalur, diurutkan severity lalu jalur;
- rekapitulasi jumlah per kelas dan per severity;
- **verifikasi atau bantahan** terhadap tabel persentase kematangan di §1 dokumen ini,
  dengan angka baru berdasarkan rasio `TERPENUHI` terhadap total REQ per lapisan;
- daftar butir `TIDAK-TERVERIFIKASI` beserta apa yang dibutuhkan untuk menutupnya.

---

## 7. Urutan pengerjaan yang disarankan

Kerjakan A dan C lebih dulu bila jalur harus diserialkan: keduanya memuat invarian yang
pelanggarannya bersifat release-blocking (isolasi tenant, uang, status terminal).

1. Jalur A dan C — invarian yang paling mahal bila salah.
2. Jalur B dan D — kontrak runtime dan keamanan AI.
3. Jalur F — kematangan operasional.
4. Jalur E — permukaan terbesar dan paling banyak temuan yang diperkirakan, tetapi
   severity umumnya lebih rendah daripada A/C.
5. Konsolidasi ke `DAFTAR-CELAH-MASTER.md`.

Perkiraan volume: 11.496 baris spesifikasi, sekitar 400–700 persyaratan normatif.
Perkirakan 2–4 jam terfokus per jalur bila diparalelkan.

---

## 8. Definition of Done audit ini

- [ ] Enam berkas jalur ada, masing-masing memuat tabel ringkasan dan blok per temuan.
- [ ] Setiap temuan memiliki bukti berupa path:baris atau perintah + keluaran.
- [ ] Setiap dokumen blueprint dalam cakupan sudah ditelusuri seluruhnya, bukan disampel.
      Sebutkan eksplisit bila ada bagian yang dilewati beserta alasannya.
- [ ] Seluruh ADR dan DEC di `15_ADR_REGISTER` sudah dinilai oleh jalur yang relevan.
- [ ] Ke-12 temuan pra-isi di §5 sudah diverifikasi ulang dan masuk daftar akhir.
- [ ] `DAFTAR-CELAH-MASTER.md` ada, memuat rekap per severity dan angka kematangan baru
      yang menggantikan atau membenarkan tabel §1.
- [ ] Tidak ada satu baris kode produksi yang berubah selama audit
      (`git status --porcelain` hanya menampilkan berkas di `docs/audit/`).

---

## 9. Setelah audit

`DAFTAR-CELAH-MASTER.md` menjadi masukan bagi rencana implementasi tersendiri, disusun
seperti `docs/plans/2026-07-27-rencana-100-persen.md`: fase berurutan, resep konkret per
butir, gerbang verifikasi, dan buku besar progres. Jangan mencampur audit dengan
implementasi dalam satu sesi — pemisahan itulah yang membuat temuannya bisa dipercaya.
