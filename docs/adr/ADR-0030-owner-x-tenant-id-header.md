# ADR-0030: Kebijakan Otorisasi Header `x-tenant-id` pada Owner Console (REQ-05-002)

- **Status**: APPROVED / TERIMA
- **Tanggal**: 2026-07-31
- **Pemilik**: Platform Security & Architecture Team
- **Persyaratan Terkait**: REQ-05-002 (05_DATA_MODEL §3, 10_SECURITY §6)

---

## 1. Konteks & Permasalahan

Dalam arsitektur multi-tenant Chai, isolasi tenant ditegakkan pada tingkat database (PostgreSQL Row-Level Security / RLS) dan tingkat aplikasi (`TenantGuard` & `tenantContext`).

Operator platform pada **Owner Console** memerlukan kemampuan untuk meninjau status, metrik, audit log, dan mengelola konfigurasi tenant spesifik. Terdapat dua pilihan desain untuk menentukan konteks tenant saat owner mengakses endpoint terisolasi:
1. Menyuntikkan `tenantId` sebagai parameter URL/body pada setiap rute bisnis.
2. Menggunakan header HTTP khusus (`x-tenant-id`) untuk menetapkan lingkup (scope) tenant pada konteks eksekusi request.

Jika `x-tenant-id` diizinkan tanpa batasan peran, pengguna Client Portal biasa dapat memanipulasi header ini untuk melakukan akses lintas-tenant (cross-tenant data leakage). Oleh karena itu, diperlukan aturan eksplisit mengenai kapan header `x-tenant-id` boleh digunakan dan bagaimana penjagaannya.

---

## 2. Keputusan Tertulis (Decision)

Kami memutuskan aturan otorisasi header `x-tenant-id` sebagai berikut:

### 2.1 Otorisasi Eksklusif Peran Platform Owner
- Header `x-tenant-id` **HANYA diproses** jika request dikirim oleh prinsipal terautentikasi dengan peran `platform-owner` (audience `owner-console`).
- Untuk request dari Client Portal (audience `client-portal`) atau pengguna non-owner:
  - Header `x-tenant-id` **WAJIB DIABAIKAN / DITOLAK** jika mencoba memilih tenant yang bukan milik keanggotaannya.
  - Konteks tenant untuk Client Portal diselesaikan **hanya dari token sesi / keanggotaan terverifikasi** (`tenantContext.tenantId`).

### 2.2 Penjagaan & Validasi Lingkup Owner
- Saat `platform-owner` mengirimkan `x-tenant-id`:
  1. `TenantGuard` memvalidasi bahwa `tenantId` yang diminta ada di dalam direktori tenant aktif.
  2. Konteks transaksi RLS database di-set ke `tenantId` sasaran dengan peran audit `chai_owner_console`.
  3. Setiap tindakan mutasi atau pembacaan lintas-tenant oleh owner **wajib dicatat secara otomatis ke dalam `chai.audit_log`** dengan metadata `actor_id`, `action: 'owner.tenant_switch'`, dan `target_tenant_id`.

### 2.3 Perilaku Rejeksi (Fail-Closed)
- Penggunaan header `x-tenant-id` oleh prinsipal yang tidak berhak mengembalikan `403 Forbidden` (`CROSS_TENANT_HEADER_REJECTED`).
- Upaya mengakses `tenantId` yang tidak valid/tidak ada mengembalikan `404 Not Found`.

---

## 3. Konsekuensi

### Positif
- Menghilangkan celah kebocoran data lintas-tenant pada Client Portal API.
- Memberikan fleksibilitas operasional bagi tim support/owner tanpa mengorbankan isolasi RLS.
- Menyediakan jejak audit (audit trail) lengkap untuk setiap akses lintas-tenant yang dilakukan operator platform.

### Risiko & Mitigasi
- *Risiko*: Operator owner salah memilih tenant saat melakukan tindakan sensitif.
- *Mitigasi*: Tindakan destruktif (seperti menangguhkan tenant) tetap mewajibkan modal konfirmasi (REQ-03-035) dan recent-authentication (ADR-029).

---

## 4. Referensi
- `Omnichannel_AI_Platform_Engineering_Blueprint_v1.2/05_DATA_MODEL.md` §3
- `Omnichannel_AI_Platform_Engineering_Blueprint_v1.2/10_SECURITY.md` §6
- `apps/api/src/common/guards/tenant.guard.ts`
- `tests/security/tenant-isolation.spec.ts`
