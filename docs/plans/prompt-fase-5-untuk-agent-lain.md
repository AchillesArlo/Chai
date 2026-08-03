# Tugas: Kerjakan FASE 5 dari rencana penyelesaian lengkap proyek Chai

## Konteks proyek

Proyek "Chai" adalah platform AI omnichannel multi-tenant (monorepo pnpm +
Turborepo, TypeScript strict, NestJS di atas Fastify untuk `apps/api`,
PostgreSQL dengan migrasi SQL mentah dan RLS default-deny).

Baca dulu, dalam urutan ini, sebelum menulis kode apa pun:

1. `README.md` — arsitektur dan invarian inti yang tidak boleh dilanggar.
2. `AGENTS.md` — stack proyek ini (mengalahkan klaim stack apa pun di
   `AGENTS.md` induk di luar repo ini).
3. `docs/plans/2026-07-29-rencana-penyelesaian-lengkap.md` — rencana besar
   14 fase. **FASE 1, 1.5, 2, 3, 4 sudah SELESAI** (ditandai eksplisit di
   dokumen itu dengan bukti eksekusi). Tugasmu adalah **FASE 5 — Rahasia dan
   kredensial**, dimulai sekitar baris 528 dokumen tersebut.
4. `docs/audit/2026-07-29/DAFTAR-CELAH-MASTER.md` — status terkini setiap
   temuan (cari `REQ-10-022`, `REQ-05-003`, `REQ-17-011`, `REQ-17-049`,
   `REQ-17-058`, `REQ-09-029`, `REQ-04-010`).

## Tugas: FASE 5 — Rahasia dan kredensial

Tujuh temuan HIGH satu tema (secret konektor tersimpan plaintext, tidak
per-tenant, rotasi tidak teraudit, UI bisa reveal secret). Kerjakan sebagai
satu fase karena akarnya sama.

**PENTING — verifikasi ulang dulu, jangan percaya klaim audit begitu saja.**
Sesi-sesi sebelumnya (FASE 1–4) berulang kali menemukan bahwa kondisi nyata
kode berbeda dari asumsi dokumen rencana/audit — kadang lebih baik, kadang
jauh lebih buruk, kadang scope-nya jauh lebih besar dari perkiraan. Baca kode
sungguhan sebelum menyimpulkan apa pun.

### Kondisi yang diklaim dokumen rencana (verifikasi ulang, jangan asumsikan benar)

- Secret manager **diklaim sudah ada** di
  `packages/domain/src/secret-management/manager.ts` (+ `manager.test.ts`).
- `apps/api/src/modules/connector-config/postgres-connector-config.repository.ts`
  diklaim menyentuh `secretRef`.
- Dokumen menduga ini **kemungkinan besar pekerjaan menyambungkan dan
  menegakkan, bukan membangun dari nol** — tapi ini asumsi yang harus
  dibuktikan, bukan diterima begitu saja (lihat catatan FASE 4: dokumen
  rencana mengasumsikan "logikanya ada, sambungannya tidak" untuk policy
  engine, realitanya seluruh service AI gateway tidak tersambung ke apa pun
  sama sekali — jauh lebih besar dari perkiraan).

### Langkah kerja

1. **Verifikasi kondisi nyata dulu**, dengan bukti konkret (baca kode, jalankan
   query nyata di suite integrasi terhadap Postgres sungguhan, bukan tebakan):
   - Apa yang **benar-benar tersimpan** di kolom secret konektor hari ini
     (`apps/api/src/modules/connector-config/*.ts` dan migrasi terkait)? Apakah
     plaintext, base64 (bukan enkripsi), atau memang sudah terenkripsi dengan
     benar? Ini menentukan apakah `REQ-10-022` benar-benar "SEBAGIAN" atau
     lebih buruk.
   - Apakah `secret-management/manager.ts` **benar-benar dipanggil** dari
     `apps/api`, atau ini pola yang sama dengan `@chai/ai-gateway` di FASE 4
     (kode lengkap tapi 0 pemanggil produksi)? Grep pemanggil sungguhan,
     jangan asumsikan dari nama file.
   - Apakah secret webhook per-provider **sudah** per-tenant atau memang
     global (env var tunggal)? (Contoh konkret yang sudah ditemukan di FASE 3:
     `MIDTRANS_SERVER_KEY` yang disambungkan FASE 3 adalah **satu key global
     dari environment variable**, bukan per-tenant — ini kemungkinan besar
     relevan langsung dengan `REQ-17-058` di fase ini. Baca
     `apps/api/src/modules/payments/postgres-payments.repository.ts`
     constructor untuk konteks, dan pertimbangkan apakah menyambungkan secret
     manager ke sana termasuk scope FASE 5 ini.)
   - Cek juga rotasi: apakah ada jalur rotasi secret sama sekali, dan apakah
     menulis audit trail (`appendAuditEntry` dari `@chai/domain`)?

2. Setelah kondisi nyata dipastikan, kerjakan sesuai temuan (sesuaikan dengan
   hasil verifikasi langkah 1, bukan asumsi buta dari poin di bawah):
   - Semua secret harus lewat secret manager; kolom DB hanya menyimpan
     **referensi + versi kunci**, tidak pernah plaintext.
   - Secret webhook per-provider harus **per-tenant**, bukan global
     (`REQ-17-058`). Ini juga menutup sebagian `REQ-17-011`.
   - Rotasi secret harus **teraudit**: setiap rotasi menulis baris audit lewat
     `appendAuditEntry`.
   - `REQ-04-010` (frontend, `apps/client-portal` dan/atau
     `apps/owner-console`): komponen `SecretInput` tidak boleh bisa me-reveal
     nilai secret setelah tersimpan. Ini perbaikan UI kecil dan berdiri
     sendiri — boleh dikerjakan/commit terpisah dari sisanya.

3. Jika migrasi database baru diperlukan: **migrasi terakhir yang sudah
   dipakai adalah `0085_action_request.sql`** (bukan `0082` seperti tertulis
   di dokumen rencana — itu sudah kedaluwarsa karena FASE 1–4 menambah
   `0083`, `0084`, `0085`). Migrasi barumu **mulai dari `0086`**. Cek ulang
   dengan `ls`/`glob` sendiri sebelum menetapkan nomor, jangan percaya angka
   ini kalau sudah ada sesi lain yang berjalan setelah instruksi ini ditulis.

### Definisi selesai

Tes integrasi (terhadap Postgres nyata, testcontainers — pola yang sudah ada
di `apps/api/test/integration/*.integration.test.ts`) membuktikan:
- Tidak ada plaintext secret di tabel konektor (query kolom secara langsung
  dan assert bukan plaintext/bukan base64-of-plaintext).
- Rotasi menghasilkan baris audit (`chai.audit_log`).
- Dua tenant tidak berbagi secret webhook yang sama.

## Aturan keras proyek ini (tidak boleh dilanggar)

1. Tanpa `eslint-disable` dalam bentuk apa pun.
2. Tanpa `any`.
3. Tanpa non-null assertion `!`. Pakai pengecekan eksplisit / helper yang
   sudah ada di proyek (misal pola `requireRow`).
4. Jangan pernah men-skip, mematikan, atau menghapus test. Jumlah test hanya
   boleh naik dari baseline saat ini (196 test unit `@chai/api`, 147 test
   integrasi `@chai/api`, 89 test Playwright smoke — jalankan dulu untuk
   konfirmasi angka literal sebelum mulai, karena sesi lain mungkin sudah
   menambah lagi).
5. Jangan menyunting migrasi yang sudah ada. Migrasi baru mulai `0086`
   (verifikasi ulang nomor sebelum menulis).
6. Jangan melonggarkan guard atau invarian RLS. Setiap tabel tenant-scoped
   baru: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`, policy
   `chai.current_tenant_id()` (pola yang konsisten dipakai migrasi
   0006/0010/0083/0084/0085 — baca salah satu sebagai referensi persis,
   jangan menebak sintaksnya).
7. Jangan menghapus repository in-memory (`InMemoryXRepository`). Suite e2e
   bergantung padanya — kalau menambah kolom/logic baru ke repository
   Postgres, terapkan hal yang sama secara konsisten ke versi in-memory
   (pelajaran dari FASE 4: lupa melakukan ini di FASE 3 menyebabkan bug
   konsistensi yang baru ditemukan di sesi berikutnya).
8. Tanpa dependency baru kecuali alasannya kuat dan versinya dipin exact
   (bukan range). Kalau memang perlu (misal library enkripsi), jelaskan
   alasannya secara eksplisit sebelum menambahkannya.
9. Uang selalu integer minor units + kode mata uang. Tidak relevan langsung
   di fase ini, tapi jangan dilanggar kalau kode yang disentuh menyinggungnya.
10. Verifikasi setiap klaim "selesai" dengan **keluaran perintah dan exit
    code literal** — jangan melaporkan sukses tanpa bukti eksekusi nyata
    (jalankan test, tunjukkan hasilnya, jangan cukup membaca kode dan
    berasumsi).

## Gerbang verifikasi wajib sebelum melaporkan fase selesai

Jalankan semua ini dan laporkan exit code literal untuk masing-masing:

```bash
pnpm run typecheck        # harus 23/23 (atau jumlah paket saat ini)
pnpm run lint             # harus semua paket lolos
pnpm run build --force    # harus semua paket lolos
pnpm run test             # jumlah test tidak boleh turun dari baseline
pnpm --filter @chai/domain run test:integration   # butuh Docker aktif
pnpm --filter @chai/api run test:integration       # butuh Docker aktif
pnpm run verify:infra
pnpm run test:smoke       # Playwright — pastikan tidak regresi dari 89 lolos
```

Sebelum menjalankan suite integrasi, pastikan Docker Desktop aktif
(`docker ps` harus berhasil). Bersihkan `test-results/` sebelum setiap run
`test:smoke`.

## Setelah selesai

1. Perbarui `docs/audit/2026-07-29/DAFTAR-CELAH-MASTER.md`: ubah status
   setiap REQ yang benar-benar tertutup (SEBAGIAN/HILANG → TERPENUHI), dengan
   catatan singkat alasan dan tanggal. Perbarui juga angka statistik ringkasan
   eksekutif di bagian atas dokumen itu (TERPENUHI/SEBAGIAN/HILANG/
   BERTENTANGAN/TIDAK-TERVERIFIKASI) — hitung ulang dari baseline sesi
   sebelumnya (85 TERPENUHI/164 SEBAGIAN/42 HILANG/1 BERTENTANGAN/17
   TIDAK-TERVERIFIKASI per akhir FASE 4), jangan menebak.
2. Perbarui `docs/plans/2026-07-29-rencana-penyelesaian-lengkap.md` bagian
   FASE 5: tambahkan `— SELESAI (tanggal)` di judul, dan tulis ulang bagian
   "Langkah"/"Definisi selesai" menjadi "Solusi diterapkan"/"Bukti penutupan"
   dengan detail konkret (mengikuti gaya penulisan FASE 1–4 di dokumen yang
   sama sebagai referensi format).
3. Jangan mengerjakan FASE 6 atau fase lain. Berhenti setelah FASE 5 selesai
   dan terverifikasi, laporkan ringkasannya.

## Catatan gaya kerja (dari pengalaman FASE 1–4)

- Investigasi dulu, jangan menulis kode berdasarkan asumsi. Baca file
  sungguhan, grep pemanggil sungguhan, jalankan query sungguhan.
- Kalau menemukan kondisi jauh berbeda dari dokumen (lebih baik, lebih buruk,
  atau scope-nya berbeda), **berhenti dan laporkan sebelum melangkah jauh**
  jika itu mengubah keputusan arsitektur besar — tapi kalau temuannya cukup
  jelas arah perbaikannya (misalnya bug konsistensi kecil), boleh langsung
  diperbaiki sambil dicatat.
- Pertahankan pola yang sudah ada di proyek (factory pattern
  `useFactory`+`inject:[DATABASE]` untuk switch in-memory/Postgres, port
  pattern di `modules/shared` untuk lintas-modul, `commitBusinessMutation`
  untuk mutasi+audit+event satu transaksi). Jangan menciptakan pola baru
  kalau pola yang sudah ada bisa dipakai.
- Setelah build/test manual dengan server dijalankan langsung (`node
  dist/main.js` atau `pnpm dev`), selalu matikan proses dan bersihkan file
  sementara sebelum melanjutkan.
