# Community / WAHA WhatsApp gateway — roadmap, bukan pekerjaan sekarang

**Status: TIDAK DIIMPLEMENTASIKAN. Sengaja.** Menutup R-23 sebagai celah roadmap yang diakui,
bukan sebagai fitur yang tertunda diam-diam.

## Kondisi nyata hari ini

`COMMUNITY` hanya ada sebagai satu literal pada `RiskClass` di
`packages/connector-sdk/src/index.ts`. Tidak ada connector, tidak ada worker, tidak ada
kapabilitas, dan tidak ada satu pun jejak `WAHA` di kode. Dua belas connector yang ada
(`whatsapp-meta`, `whatsapp-meta-sandbox`, `jne`, `midtrans`, `openai`, `anthropic`,
`google-calendar`, ditambah lima mock) semuanya `OFFICIAL`, `META_DIRECT`, atau `SYNTHETIC`.

Jalur WhatsApp yang didukung saat ini adalah **Cloud API resmi Meta**.

## Mengapa tidak dikerjakan sekarang

Blueprint sendiri menandai jalur community sebagai opsional dan best-effort, non-blocking untuk
MVP. Alasan tekniknya lebih tajam daripada urutan prioritas:

- Gateway community berjalan dengan **sesi WhatsApp tidak resmi**. Nomor bisa diblokir kapan
  saja oleh pihak yang tidak kita kendalikan, jadi kanal ini **tidak bisa diberi SLA**.
- Konsekuensinya, ia tidak boleh berbagi jalur pengiriman dengan kanal `OFFICIAL`. Menyatukan
  keduanya berarti satu kanal tanpa jaminan bisa merusak metrik dan alert kanal yang punya
  jaminan.
- Menambahkan adapter sekarang berarti menambah permukaan operasional yang tidak ada yang minta
  dan tidak ada yang menjaga.

## Prasyarat sebelum boleh dibangun

Bukan daftar keinginan; ini syarat yang membuat kanal berisiko tetap aman ditawarkan.

1. **Kapabilitas terpisah, default mati.** Kanal ini masuk sebagai kapabilitas tersendiri
   (mis. `community_channel`) yang dibaca `EntitlementService`, **bukan** bagian dari
   kapabilitas WhatsApp resmi. Tenant tanpa kapabilitas itu menerima `FEATURE_NOT_ENABLED`.
2. **Aktivasi owner-only dan tercatat.** Hanya `PLATFORM_OWNER` dengan konteks tenant eksplisit
   dan alasan yang tersimpan yang boleh menyalakannya, lewat jalur audit yang sama dengan
   pemberian akses lintas tenant lain.
3. **`riskClass: 'COMMUNITY'` dan `slaClass` non-produksi** wajib menempel pada setiap event
   yang dihasilkannya, sehingga dashboard dan burn-rate bisa memisahkannya dari kanal resmi.
4. **UI menyatakan risikonya** di titik pemakaian: tenant harus tahu nomor bisa diblokir dan
   tidak ada jaminan pengiriman. Tanpa ini kita menjual kanal rapuh sebagai kanal biasa.
5. **Kill switch per tenant** dan quarantine mandiri, terpisah dari kanal resmi.
6. **Suite conformance connector** yang sama dengan connector lain: duplikat, timeout setelah
   submit, rekonsiliasi, hasil tak diketahui, dan isolasi tenant.

Selama enam syarat ini belum ada, `COMMUNITY` tetap hanya nilai enum — dan itu keadaan yang
benar, bukan pekerjaan yang terlewat.
