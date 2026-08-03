# Runbook — Pelacakan Pengiriman Basi (Shipment Stale)

**Severity:** ticket; page bila menyentuh SLA pelanggan atau massal
**Owner:** on-call platform + pemilik modul logistik
**Alert terkait:** `ShipmentTrackingStale` (`infra/monitoring/alerts.yml`)
**Blueprint:** 13 §24

Modul logistik bersifat opsional per tenant, tetapi saat aktif, status
pengiriman harus terus diperbarui dari provider. "Basi" berarti sebuah
pengiriman tidak menerima pembaruan pelacakan jauh melebihi kadensa normalnya —
biasanya polling provider berhenti, job logistik macet, atau webhook provider
hilang.

## Gejala

- Alert `ShipmentTrackingStale` menyala (umur pembaruan pelacakan > 24 jam).
- Pengiriman tersangkut `IN_TRANSIT`/status non-terminal tanpa event baru.
- Worker logistik tidak menghasilkan event pelacakan; backlog job logistik naik.
- Pelanggan melapor status tidak bergerak padahal barang jalan.

## Cara memastikan

1. Temukan pengiriman basi dan umurnya (per tenant, hormati RLS):
   `SELECT id, status, now()-updated_at AS age
    FROM chai.shipment
    WHERE status NOT IN ('DELIVERED','CANCELLED','RETURNED')
    ORDER BY age DESC LIMIT 20;`
2. Cek kesehatan worker logistik: apakah loop polling jalan, apakah ada error
   berulang, apakah lease job logistik macet (mirip pola inbox/outbox).
3. Cek sisi provider: status page, kredensial/kunci polling, rate limit, atau
   webhook yang berhenti terkirim.
4. Pastikan status terminal tidak pernah mundur (`DELIVERED` tetap terminal);
   kode provider tak dikenal harus menjadi `UNKNOWN`, bukan ditebak.

## Langkah mitigasi

1. Bila polling berhenti: picu ulang poll provider untuk pengiriman terdampak
   dengan konkurensi terbatas; jangan banjiri provider.
2. Bila job logistik macet: reklaim lease yang kedaluwarsa lebih dulu (pola sama
   dengan reclaim inbox), lalu biarkan worker memproses ulang secara idempoten.
3. Bila satu provider bermasalah: matikan hanya kunci provider itu (kill switch),
   pengiriman provider lain tetap jalan.
4. Rekonsiliasi status terhadap provider setelah pulih; efek eksternal wajib
   idempoten — verifikasi tidak ada event ganda (idempotency key + external id).
5. Jangan menandai `DELIVERED` secara manual tanpa konfirmasi provider; status
   terminal tidak boleh dibuat-buat.

## Cara verifikasi pulih

- Umur pembaruan pelacakan pengiriman terdampak kembali di bawah ambang.
- Worker logistik menghasilkan event lagi; backlog job logistik mengering.
- Tidak ada pengiriman non-terminal yang umurnya melewati kadensa normal.
- Rekonsiliasi provider selesai tanpa duplikasi efek.

## Kapan eskalasi

- SLA pelanggan terancam atau banyak tenant terdampak → page pemilik modul logistik.
- Provider mengalami outage berkepanjangan → koordinasi dengan provider, beri tahu
  tenant terdampak dengan cakupan yang terkonfirmasi saja.
- Pola basi berulang setelah mitigasi → postmortem 48 jam, tambahkan regresi.
