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


---

## 10. Protokol eksekusi untuk agen — ikuti persis

Bagian ini mengubah rencana di atas menjadi perintah kerja yang bisa dijalankan tanpa
menafsirkan. Bila bagian sebelumnya dan bagian ini seolah berbeda, **bagian ini yang
dipakai** untuk cara bekerja; bagian sebelumnya tetap dipakai untuk metode klasifikasi.

### 10.1 Satuan kerja adalah SATU DOKUMEN, bukan satu jalur

Jangan mencoba menyelesaikan satu jalur dalam satu tarikan napas. Kerjakan **satu dokumen
blueprint sampai tuntas, tulis hasilnya ke berkas, baru ambil dokumen berikutnya.**

Alasannya praktis: bila konteks Anda terpotong di tengah jalan, pekerjaan yang sudah
tertulis di berkas tetap selamat. Pekerjaan yang hanya ada di kepala Anda hilang.

### 10.2 Daftar perintah kerja

Semua path relatif ke `Omnichannel_AI_Platform_Engineering_Blueprint_v1.2/`.

| # | Dokumen | Baris | Jalur | Berkas keluaran |
|---|---|---|---|---|
| 1 | `10_SECURITY_PRIVACY_AND_RBAC.md` | 386 | A | `docs/audit/2026-07-27/jalur-a-keamanan-tenancy.md` |
| 2 | `05_DATA_MODEL_AND_TENANCY.md` | 927 | A | (tambahkan ke berkas jalur A) |
| 3 | `17_PAYMENT_AND_LOGISTICS_SPEC.md` | 683 | C | `docs/audit/2026-07-27/jalur-c-payment-logistics.md` |
| 4 | `06_API_AND_REALTIME_CONTRACT.md` | 482 | B | `docs/audit/2026-07-27/jalur-b-kontrak-event.md` |
| 5 | `07_EVENTS_AUTOMATIONS_AND_JOBS.md` | 545 | B | (tambahkan ke berkas jalur B) |
| 6 | `08_AI_AGENT_AND_KNOWLEDGE.md` | 433 | D | `docs/audit/2026-07-27/jalur-d-ai-connector.md` |
| 7 | `09_CHANNEL_AND_CONNECTOR_SPEC.md` | 450 | D | (tambahkan ke berkas jalur D) |
| 8 | `02_SYSTEM_ARCHITECTURE.md` | 437 | F | `docs/audit/2026-07-27/jalur-f-operasional.md` |
| 9 | `11_ANALYTICS_AND_KPI_DICTIONARY.md` | 453 | F | (tambahkan ke berkas jalur F) |
| 10 | `12_QA_AND_TEST_STRATEGY.md` | 456 | F | (tambahkan ke berkas jalur F) |
| 11 | `13_DEVOPS_SRE_AND_RUNBOOKS.md` | 428 | F | (tambahkan ke berkas jalur F) |
| 12 | `03_UX_UI_SPECIFICATION.md` | 878 | E | `docs/audit/2026-07-27/jalur-e-frontend.md` |
| 13 | `04_DESIGN_SYSTEM.md` | 399 | E | (tambahkan ke berkas jalur E) |

`15_ADR_REGISTER.md` (392 baris) dibaca saat mengerjakan dokumen mana pun yang menyebut
ADR/DEC tertentu; setiap ADR dan DEC wajib dinilai oleh jalur yang paling relevan.

### 10.3 Prosedur untuk satu dokumen — tujuh langkah

**Langkah 1.** Baca dokumen itu seluruhnya. Untuk dokumen di atas 500 baris, baca dalam
potongan 200 baris berurutan sampai habis. Jangan menyampel, jangan melompat ke bagian
yang terdengar penting saja.

**Langkah 2.** Kumpulkan pernyataan normatif saja: yang memuat "MUST", "WAJIB", "harus",
"tidak boleh", "dilarang", plus setiap kriteria penerimaan (AC), ADR, dan DEC. Prosa
penjelas, latar belakang, dan contoh **bukan** persyaratan.

**Langkah 3.** Beri nomor `REQ-<nomor-dokumen>-<urut tiga digit>`. Contoh: persyaratan
keempat belas di `10_SECURITY` menjadi `REQ-10-014`. Nomor urut mengikuti urutan
kemunculan di dokumen.

**Langkah 4.** Untuk setiap REQ, cari implementasinya di kode. Pakai alat termurah dulu:

```powershell
# 1) bila graf pengetahuan tersedia, ini paling murah
graphify query "<pertanyaan tentang persyaratan ini>"

# 2) pencarian teks
Select-String -Path apps/api/src/**/*.ts -Pattern '<pola>' | ForEach-Object { "$($_.Filename):$($_.LineNumber): $($_.Line.Trim())" }

# 3) baru setelah itu, baca berkas yang relevan
```

Catat perintah yang Anda jalankan. Perintah itu bagian dari bukti.

**Langkah 5.** Klasifikasikan ke tepat satu dari lima kelas di §3 Langkah 3, dan beri
severity mengikuti §3 Langkah 4.

**Langkah 6.** Tulis blok temuan memakai template di §10.5, lalu **append ke berkas
keluaran**. Jangan menunggu dokumen berikutnya. Jangan menyimpan di kepala.

**Langkah 7.** Jalankan self-check §10.7. Baru lanjut ke dokumen berikutnya.

### 10.4 Aturan bukti — ini yang paling sering dilanggar

Kelas `TERPENUHI` **hanya** boleh Anda tulis bila Anda sudah membuka berkasnya dan melihat
kodenya. Menemukan nama yang mirip lewat pencarian teks **tidak cukup** — banyak hal di
repo ini terdefinisi tetapi tidak pernah dipakai (`AuditMiddleware` adalah contohnya:
kelasnya ada, call site-nya nol, jadi persyaratannya **tidak** terpenuhi).

Karena itu, untuk setiap `TERPENUHI` jawab dua hal:

1. Di mana kodenya? (path:baris)
2. Apakah kode itu benar-benar terpanggil di jalur produksi? Buktikan call site-nya, atau
   sebutkan tes yang menegakkannya.

Bila jawaban nomor 2 tidak ada, kelasnya `SEBAGIAN`, bukan `TERPENUHI`.

Untuk `HILANG`, sertakan perintah pencarian yang menghasilkan nol keluaran. "Saya tidak
menemukannya" tanpa perintah bukan bukti.

### 10.5 Template blok temuan — salin bentuk ini

```markdown
### REQ-10-021 - Secret at rest terenkripsi - SEBAGIAN - HIGH

**Persyaratan** (`10_SECURITY §4.2`): "<kutipan pendek dari blueprint>"

**Kondisi nyata**: <apa yang benar-benar ada di kode>

**Bukti**:
- `apps/api/src/auth/mfa-secret-crypto.ts:41-60` - enkripsi AES-256-GCM ada
- `packages/database/migrations/0031_connector_config.sql:24` - kolom secret polos
- Perintah: `Select-String ... -Pattern 'rotate'` -> 0 hasil

**Yang kurang**: <spesifik, bisa ditutup sebagai satu pekerjaan>
```

Setiap temuan `SEBAGIAN`, `HILANG`, atau `BERTENTANGAN` wajib punya baris **Yang kurang**
yang cukup spesifik untuk dijadikan satu tiket pekerjaan. Kalau baris itu berbunyi
"frontend belum lengkap", itu gagal: pecah menjadi beberapa REQ.

### 10.6 Yang DILARANG

1. **Jangan mengubah kode apa pun.** Audit ini read-only. Satu-satunya berkas yang boleh
   Anda tulis adalah di `docs/audit/2026-07-27/`. Bila Anda melihat perbaikan satu baris
   yang menggoda, catat sebagai temuan dan lanjut.
2. **Jangan menjalankan perintah destruktif**: tanpa `git reset`, `git clean`,
   `git checkout`, tanpa `Remove-Item`, tanpa perubahan skema database.
3. **Jangan memercayai dokumen internal sebagai bukti.** `README.md`,
   `docs/plans/2026-07-26-blueprint-gap-remediation.md`, dan komentar kode adalah klaim,
   bukan bukti. Keduanya sudah pernah salah. Bukti hanya kode dan keluaran perintah.
4. **Jangan memakai kata ragu sebagai kesimpulan.** Dilarang menulis "sepertinya",
   "kemungkinan sudah", "mungkin terpenuhi", "tampaknya". Bila Anda tidak tahu, kelasnya
   `TIDAK-TERVERIFIKASI` dan sebutkan apa yang dibutuhkan untuk memutuskannya.
5. **Jangan menyampel dokumen** lalu menyimpulkan keseluruhan. Bila Anda melewatkan suatu
   bagian, tulis eksplisit bagian mana dan mengapa.
6. **Jangan menggabungkan beberapa kekurangan** menjadi satu temuan besar.

### 10.7 Self-check setelah setiap dokumen

Jawab tertulis, singkat:

1. Sudah membaca dokumen ini dari baris pertama sampai terakhir? Bila ada yang dilewati,
   bagian mana?
2. Berapa REQ yang dihasilkan, dan berapa yang `TERPENUHI` / `SEBAGIAN` / `HILANG` /
   `BERTENTANGAN` / `TIDAK-TERVERIFIKASI`?
3. Setiap `TERPENUHI` sudah punya path:baris **dan** bukti bahwa kodenya terpanggil?
4. Setiap `HILANG` sudah punya perintah pencarian yang menghasilkan nol?
5. Sudah di-append ke berkas keluaran? (bukan hanya ada di respons Anda)
6. `git status --porcelain` hanya menampilkan berkas di `docs/audit/`?

### 10.8 Format laporan ke pemilik repo setelah setiap dokumen

```
DOKUMEN <n>/13 - <nama dokumen> (<jumlah> baris)
REQ dihasilkan: <angka>
  TERPENUHI <n> | SEBAGIAN <n> | HILANG <n> | BERTENTANGAN <n> | TIDAK-TERVERIFIKASI <n>
Temuan severity tertinggi: <ID> - <ringkas satu baris>
Berkas keluaran: <path> (<jumlah baris sekarang>)
Self-check 6 butir: <ringkas, sebutkan bila ada yang "tidak">
```

### 10.9 Bila macet

- **Dokumen menyebut komponen yang tidak Anda temukan sama sekali.** Itu temuan `HILANG`,
  bukan kegagalan Anda. Catat perintah pencariannya dan lanjut.
- **Persyaratan terlalu kabur untuk diverifikasi.** Klasifikasikan
  `TIDAK-TERVERIFIKASI`, kutip bagian yang kabur, sebutkan apa yang perlu diklarifikasi.
- **Anda ragu antara `TERPENUHI` dan `SEBAGIAN`.** Pilih `SEBAGIAN`. Audit yang terlalu
  ketat menghasilkan pekerjaan tambahan; audit yang terlalu longgar menghasilkan rasa aman
  yang salah, dan itu jauh lebih mahal.
- **Konteks Anda mulai penuh.** Selesaikan dokumen yang sedang dikerjakan, tulis ke berkas,
  laporkan posisi Anda, lalu berhenti. Jangan memulai dokumen baru dengan konteks sisa.
