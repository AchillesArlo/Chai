# Keputusan Ditunda Sadar — FASE 26

Dokumen ini mendaftar item audit `SEBAGIAN`/`HILANG` yang **secara sadar ditunda** dengan alasan jelas, bukan karena terlewat. Setiap item punya kriteria kapan boleh dibuka kembali.

Dibuat: 2026-08-01  
Dibuat oleh: Agen (FASE 26)

---

## REQ-10-015 — OIDC workload identity (HILANG, MEDIUM)

**Deskripsi**: Mengganti API key statis jangka panjang dengan OIDC workload identity (misalnya Google Workload Identity Federation atau AWS IRSA).

**Alasan ditunda**:
- Menyentuh autentikasi seluruh service-to-service — risiko outage tinggi.
- Butuh keputusan penyedia cloud (GCP vs AWS vs on-prem).
- Butuh koordinasi tim infrastruktur untuk rotasi kredensial.
- Saat ini token service berjangka 5 menit (`SESSION_POLICIES.serviceAccessTokenLifetimeSeconds = 300`) — sudah lebih aman dari key statis tanpa expire.

**Yang sudah ada**: ADR-029 mencatat workload token 5 menit. `loadTokenConfig()` sudah menolak secret pendek (`< 32 char`) di production.

**Kriteria buka kembali**:
- Ada keputusan tertulis dari pemilik proyek tentang penyedia cloud.
- Ada infrastruktur untuk minting/validasi workload token (misalnya SA impersonation atau IRSA).
- Tersedia di lingkungan staging untuk diuji.

---

## REQ-10-003 / REQ-10-004 — Idle session enforcement (SEBAGIAN, MEDIUM)

**Deskripsi**:
- Owner: idle 30 menit harus terminate session.
- Client: idle 60 menit harus terminate session.

**Alasan ditunda**:
- Enforcement idle membutuhkan Redis `lastSeen` tracking per session dengan TTL rolling.
- Saat ini `SESSION_POLICIES` sudah mendefinisikan `idleTimeoutSeconds` (1800 untuk owner, 3600 untuk client), tetapi **hanya access token TTL** (10m/15m) yang ditegakkan.
- Menambah `lastSeen` tracking memerlukan middleware baru + Redis key per session → scope kerja signifikan.
- Short access token TTL (10m/15m) sudah memberikan perlindungan de facto — user harus refresh token secara aktif.

**Yang sudah ada**: `SESSION_POLICIES.owner.idleTimeoutSeconds = 1800`, `SESSION_POLICIES.client.idleTimeoutSeconds = 3600`.

**Kriteria buka kembali**:
- Redis sudah dipakai untuk session (saat ini hanya broker/cache).
- Ada keputusan untuk menambah `lastSeen` middleware.

---

## REQ-08-032 — Release floor + canary deployment (SEBAGIAN, LOW)

**Deskripsi**: Canary deployment dengan traffic splitting + release floor (versi minimum yang boleh jalan).

**Alasan ditunda**:
- Butuh infrastruktur orchestration (Kubernetes ingress / Istio / Argo Rollouts).
- Tidak bisa diimplementasi di level kode aplikasi.
- Belum ada lingkungan production/staging dengan orchestrator tersebut.

**Kriteria buka kembali**:
- Ada keputusan platform deployment (Kubernetes + ingress controller yang mendukung traffic splitting).
- Ada tim yang bertanggung jawab atas rollout strategy.

---

## REQ-08-044 — Rollback model otomatis (SEBAGIAN, LOW)

**Deskripsi**: Rollback otomatis ke versi model AI sebelumnya saat error rate melebihi threshold.

**Alasan ditunda**:
- Bergantung pada infrastruktur deployment canary (REQ-08-032).
- Butuh metric collection yang terhubung ke orchestrator (Prometheus + alert manager + rollback hook).

**Kriteria buka kembali**:
- REQ-08-032 selesai.
- Ada alert pipeline dari observability ke deployment orchestrator.

---

## REQ-07-010 — Temporal untuk workflow durable multi-hari (ADR-008) (HILANG, MEDIUM)

**Deskripsi**: Workflow durable lintas hari menggunakan Temporal.io (ADR-008).

**Alasan ditunda**:
- Sudah didokumentasikan di GAP-025 dan ditandai sebagai *Growth Architecture*.
- Butuh keputusan eksplisit dari pemilik proyek.
- Infrastruktur Temporal (server, namespace, worker) belum ada.
- Saat ini workflow berjangka pendek menggunakan BullMQ yang sudah memadai.

**Kriteria buka kembali**:
- Pemilik proyek menyetujui penambahan Temporal sebagai dependency.
- Ada anggaran infrastruktur untuk Temporal server.
- Ada tim yang siap operasikan Temporal.

---

## REQ-17-071 — Multi-shipment / partial fulfillment (HILANG, MEDIUM)

**Deskripsi**: Satu order bisa punya beberapa shipment; partial fulfillment saat sebagian item siap.

**Alasan ditunda**:
- Model domain saat ini sudah punya `Package` dan `Item` entity, tetapi belum ada `split` operation.
- Butuh perubahan skema database yang signifikan (tabel `order_fulfillment_group`).
- Scope kerja > 2 sprint, perlu product spec yang lebih detail.

**Kriteria buka kembali**:
- Ada product spec dari pemilik yang mendefinisikan UX split shipment.
- Ada keputusan untuk sprint yang mengerjakan fitur ini.

---

## Catatan: Item SEBAGIAN yang butuh verifikasi lebih lanjut

Item-item berikut masih `SEBAGIAN` di audit karena implementasinya ada tapi belum ada test e2e yang membuktikan end-to-end:

- `REQ-17-023` (Verifikasi signature webhook payment) — kode ada di `verifyProviderWebhook` tapi masih pakai global key, belum per-tenant.
- `REQ-07-008` (Retry backoff/jitter) — ada di broker `@chai/broker` tapi circuit breaker belum terhubung ke DLQ.
- `REQ-07-009` (15 queue berprioritas) — BullMQ sudah ada queue terpisah tapi belum 15 queue dengan prioritas eksplisit.

Semua item di atas **memerlukan sprint kerja tersendiri** dan sudah ada dalam backlog. Tidak dikerjakan di FASE 26 karena berada di luar scope "pembersihan dan dokumentasi".
