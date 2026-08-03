# FASE 14 — Log Evaluasi & Keputusan Utang Teknis yang Diketahui (Known Debts)

- **Tanggal Evaluasi**: 2026-07-31
- **Dokumen Acuan**: `docs/plans/2026-07-29-rencana-penyelesaian-lengkap.md` §FASE 14
- **Status**: SELESAI / DITUNDA SECARA SADAR (CONSCIOUS TECHNICAL DEBT LOGGED)

---

## Ringkasan Evaluasi 8 Item Utang Teknis

| No | Item Utang Teknis | Keputusan | Alasan & Rencana Mitigasi |
|---|---|---|---|
| 1 | PITR memakai `pg_dump`, bukan `pg_basebackup` | **Ditunda secara sadar** | WAL archiving sudah aktif & terverifikasi. Pengalihan skrip backup dari `pg_dump` ke `pg_basebackup` dijadwalkan pada sesi hardening infra. |
| 2 | Healthcheck worker hanya liveness (`pgrep`) | **Ditunda secara sadar** | Liveness check `pgrep` mencukupi untuk MVP container orchestration stage 1; readiness check berbasis heartbeat queue depth disiapkan untuk prod monitoring. |
| 3 | Lima modul masih persist di skema `public` (bukan `chai`) | **Ditunda secara sadar** | Migrasi 0001–0090 secara bertahap memindahkan tabel ke skema `chai`. Seluruh tabel berkonteks tenant dilindungi RLS `FORCE`. |
| 4 | `AuditMiddleware` tidak ter-wire | **Dialihkan ke FASE 15** | Ditangani secara penuh pada FASE 15 (audit trail & wiring middleware). |
| 5 | Cakupan performa hanya 3 endpoint baca | **Ditunda secara sadar** | Baseline performa di `docs/testing/2026-07-28-baseline-performa.md` mencakup rute kritis; load test "1000 conversations" dijadwalkan pada FASE 26. |
| 6 | Paritas staging vs produksi (mount `postgres.conf`) | **Dipertahankan (Mitigasi Aktif)** | Dipertahankan dengan penjaminan otomatis `pnpm run verify:infra` pada CI runner. |
| 7 | Audit ulang katalog kolom `05_DATA_MODEL` §4–§13 | **Ditunda secara sadar** | Seluruh skema terpasang terbukti lulus typecheck/RLS; audit mendalam per kolom disiapkan untuk iterasi skema berikutnya. |
| 8 | 39 rujukan di dokumen audit dikutip sebagai nama berkas polos | **Dipertahankan** | Seluruh rujukan terverifikasi menunjuk berkas nyata di repositori (0% fabrikasi). |
