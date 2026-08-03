# Runbook — Degradasi Basis Data

**Severity:** page bila jalur tulis terdampak; ticket bila hanya latensi naik
**Owner:** on-call platform + DBA
**Alert terkait:** `DatabaseUnavailable` (`infra/monitoring/alerts.yml`)
**Blueprint:** 13 §21

Basis data adalah satu-satunya sumber kebenaran (outbox, inbox, audit, mutasi
bisnis commit dalam satu transaksi). Degradasi — bukan cuma mati total — berarti
latensi query naik, koneksi jenuh, replikasi tertinggal, atau role runtime salah.

## Gejala

- Alert `DatabaseUnavailable` menyala (`up{service="api"} == 0`).
- Latensi p95 endpoint naik tajam; timeout pada jalur tulis.
- Pool koneksi habis: error `remaining connection slots are reserved` / `too many clients`.
- Lag replikasi membesar; pembaca replika menyajikan data basi.
- Worker (outbox/inbox dispatcher) menumpuk lease karena transaksi lambat.

## Cara memastikan

1. Cek ketersediaan jalur API→DB: `up{service="api"}` dan latensi `pg_stat`.
2. Koneksi aktif vs batas:
   `SELECT count(*), state FROM pg_stat_activity GROUP BY state;`
   bandingkan dengan `SHOW max_connections;`.
3. Query lambat / lock:
   `SELECT pid, now()-query_start AS age, state, left(query,120)
    FROM pg_stat_activity WHERE state <> 'idle' ORDER BY age DESC LIMIT 20;`
   dan `SELECT * FROM pg_locks WHERE NOT granted;`.
4. Lag replikasi: `SELECT client_addr, replay_lag FROM pg_stat_replication;`.
5. Pastikan role runtime benar dan **tetap** `NOBYPASSRLS` (invarian isolasi):
   `SELECT rolname, rolbypassrls FROM pg_roles
    WHERE rolname LIKE 'chai\_%';` — nilai `rolbypassrls` harus `f`.

## Langkah mitigasi

1. Bila koneksi jenuh: turunkan sumber beban (skala API sementara, naikkan
   `pool` hanya bila DB punya headroom), lalu terminasi query nakal yang jelas
   lepas kendali: `SELECT pg_cancel_backend(pid);` (lembut) atau
   `pg_terminate_backend(pid)` (paksa) untuk pid tertua yang menahan lock.
2. Bila primary sekarat dan ada replika sehat: lakukan failover terkontrol ke
   replika (promosikan), arahkan `DATABASE_URL` ke endpoint baru. Jangan
   failover bila lag replikasi besar tanpa menerima potensi kehilangan data.
3. Bila degradasi karena beban baca: alihkan pembacaan analitik ke jalur
   fact/replika, jangan ke tabel operasional (prinsip FASE 32).
4. Aktifkan kill switch global read-only bila integritas tulis terancam
   (`docs/runbooks/kill-switch.md`); outbox/inbox tetap sumber kebenaran, jangan
   buang event.
5. Jangan ubah role menjadi `BYPASSRLS` sebagai "perbaikan cepat" — itu
   melanggar isolasi tenant dan menjadi insiden yang lebih besar.

## Cara verifikasi pulih

- `up{service="api"} == 1` stabil ≥ 5 menit; latensi p95 kembali ke baseline.
- Koneksi aktif jauh di bawah `max_connections`; tidak ada lock menggantung.
- Lag replikasi mendekati nol.
- Suite isolasi hijau: `pnpm --filter @chai/database test:integration`.
- Backlog worker mengering (lihat `InboxQueueLag` reda).

## Kapan eskalasi

- Ada risiko atau bukti kehilangan data → page DBA senior + platform lead segera.
- Perlu failover yang mungkin kehilangan transaksi → butuh keputusan pemilik data.
- Degradasi berulang setelah mitigasi → buka postmortem 48 jam, jadikan blocker
  rilis sampai akar masalah ditemukan.
