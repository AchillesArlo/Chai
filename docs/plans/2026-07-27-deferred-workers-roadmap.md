# Media worker & Temporal — roadmap, bukan pekerjaan sekarang

**Status: DIHAPUS sebagai kode mati. Sengaja.** Dua paket worker dihapus pada pembersihan
27 Jul 2026 karena keduanya paket mati: nol pemanggil, tidak dideploy, dan (untuk temporal)
aktivitasnya masih stub. Dokumen ini mencatat keduanya sebagai celah roadmap yang diakui —
bukan fitur yang hilang diam-diam — beserta prasyarat yang membuatnya layak dibangun kembali.

Mengikuti gaya `docs/plans/2026-07-26-community-gateway-roadmap.md`.

---

## 1. Media processing worker (`@chai/worker-media-worker`)

### Kondisi nyata sebelum dihapus

Paket hanya berisi satu fungsi murni `classifyMediaJob(contentType)` yang memetakan MIME type
ke salah satu dari `'thumbnail' | 'transcribe' | 'scan'`. Tidak ada `main.ts`, tidak ada skrip
`start`, tidak ada `@chai/database` maupun dependensi runtime, dan satu-satunya pemanggil adalah
tesnya sendiri (`test/classify.test.ts`). Grep seluruh `apps/*`, `packages/*`, `services/*`, dan
`workers/*` menemukan **nol** importir `@chai/worker-media-worker` maupun `classifyMediaJob` di
luar paket itu. Tidak ada layanan media di compose staging maupun produksi.

### Mengapa tidak dikerjakan sekarang

Kapabilitas media nyata (virus-scan, thumbnail, transcode) membutuhkan **object storage** yang
belum ada di repo ini. Tanpa tempat menyimpan dan mengambil objek, worker media tidak punya
sumber pekerjaan: klasifier murni tanpa storage hanyalah tabel lookup yang berpura-pura menjadi
worker. Mempertahankannya sebagai paket berarti menambah permukaan build/test yang tidak
melindungi jalur produksi apa pun.

### Prasyarat sebelum boleh dibangun kembali

1. **Object storage** (S3-compatible) terpasang dan ber-tenant: bucket/prefix per tenant, URL
   bertanda tangan berumur pendek, tidak ada objek lintas tenant.
2. **Sumber pekerjaan nyata**: antrean media (mis. konsumen Redis Streams / outbox) yang memberi
   worker objek untuk diproses — bukan fungsi murni yang dipanggil dari tes.
3. **Pipeline pemindaian + turunan**: virus-scan sebelum objek boleh diakses, plus thumbnail /
   transcode; hasil ditulis kembali ke storage dan direferensikan lewat metadata ber-tenant.
4. **Kapabilitas terpisah, default mati**, dibaca `EntitlementService`; tenant tanpa kapabilitas
   menerima `FEATURE_NOT_ENABLED` (invarian "kapabilitas modul default mati").
5. **Idempotensi + rekonsiliasi**: pemrosesan ulang objek yang sama tidak menggandakan turunan;
   kegagalan dapat direkonsiliasi (invarian efek eksternal idempoten).
6. **Suite conformance** yang sama dengan connector: duplikat, timeout, hasil tak diketahui, dan
   isolasi tenant pada objek tersimpan.

Selama object storage belum ada, media tetap roadmap — dan itu keadaan yang benar.

---

## 2. Temporal durable workflows (`@chai/worker-temporal`)

### Kondisi nyata sebelum dihapus

Paket mengekspor tiga workflow (`follow-up`, `payment-reconcile`, `logistics-poll`) dengan
fungsi pemicu `startFollowUpWorkflow`, `startPaymentReconcileWorkflow`,
`startLogisticsPollWorkflow`. Ketiganya punya **nol pemanggil** di seluruh repo (grep
`apps/*`, `packages/*`, `services/*`, `workers/*`). Aktivitasnya adalah **stub**:
`pollPaymentSessionActivity` mengembalikan `{ status: 'PENDING' }` dengan komentar
"Mock response", `pollLogisticsStatusActivity` mengembalikan `{ status: 'IN_TRANSIT' }` yang
di-hardcode, dan aktivitas lain hanya `console.log` dengan `// TODO: Integrate with ...`. Tidak
ada layanan `temporal` di compose **produksi**; staging sempat punya `temporal` +
`temporal-ui` + `temporal-worker`, yang ikut dihapus.

Yang benar-benar mengerjakan rekonsiliasi adalah **`workers/payment-worker`** dan
**`workers/logistics-worker`** — worker nyata dengan `main.ts`, loop reconcile ber-`@chai/database`,
skrip `start`, tes integrasi, dan **terdeploy di `infra/production/docker-compose.yml`**. Jadi
temporal bukan hanya belum dipakai; fungsinya sudah dikerjakan komponen lain yang nyata.

### Mengapa tidak dikerjakan sekarang

Blueprint menempatkan Temporal pada fase **Growth**, untuk workflow yang benar-benar butuh
eksekusi durable panjang: timer berhari-hari, approval manusia, dan saga/kompensasi
(lihat `Omnichannel_AI_Platform_Engineering_Blueprint_v1.2/15_ADR_REGISTER.md` ADR-008 dan
`18_ENGINEERING_GAPS_AND_REMEDIATIONS.md` GAP-025). Kebutuhan itu belum ada: rekonsiliasi
payment/logistics saat ini bounded dan replayable, cocok untuk pola SKIP LOCKED / outbox yang
sudah dipakai worker nyata. Menjalankan cluster Temporal + worker stub hanya menambah
infrastruktur yang tidak menggerakkan pekerjaan bisnis apa pun.

### Prasyarat sebelum boleh dibangun kembali

1. **Kebutuhan durable yang nyata** yang melampaui worker sekarang: tunggu berhari-hari,
   approval, atau kompensasi multi-langkah — sesuatu yang pola claim-loop bounded tidak layani.
2. **Batas kepemilikan BullMQ vs Temporal** ditetapkan (GAP-025): tugas pendek/bounded tetap di
   worker/outbox; Temporal hanya untuk workflow dengan tunggu panjang, approval, kompensasi,
   atau hasil eksternal tak pasti.
3. **Cluster Temporal yang di-manage atau di-compose** dengan store-nya sendiri, plus namespace,
   retensi, dan observability — bukan placeholder.
4. **Aktivitas terhubung ke domain nyata**, bukan stub: setiap aktivitas memanggil fungsi domain
   / adapter connector sungguhan, deterministik, dan idempoten.
5. **Migrasi definisi ter-versi**: workflow lama tidak boleh rusak saat deploy (versioned
   definitions + deterministic migration), sesuai risiko yang dicatat blueprint.
6. **Tidak menduplikasi jalur yang sudah nyata**: bila payment/logistics-worker sudah
   merekonsiliasi, memindahkannya ke Temporal butuh keputusan eksplisit dan migrasi, bukan dua
   jalur paralel yang saling menimpa.

Selama keenam syarat ini belum ada, Temporal tetap keputusan arsitektur fase Growth — dan
menghapus worker stub-nya adalah keadaan yang benar, bukan fitur yang hilang.
