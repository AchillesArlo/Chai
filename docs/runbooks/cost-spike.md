# Runbook — Lonjakan Biaya / Budget (Cost Spike)

**Severity:** ticket; page bila plafon tenant tembus dan biaya masih memanjat
**Owner:** on-call platform + pemilik biaya AI
**Alert terkait:** `CostBudgetSpike` (`infra/monitoring/alerts.yml`)
**Blueprint:** 13 §22

Biaya AI dibatasi per tenant (budget cap di `services/ai-gateway`), dan
`workers/analytics-worker/src/burn-rate-harvester.ts` sudah memanen laju
pembakaran (burn rate). Runbook ini menangani saat laju itu melonjak — entah
karena lonjakan trafik sah, loop, atau penyalahgunaan.

## Gejala

- Alert `CostBudgetSpike` menyala (rasio burn budget tenant mendekati/melewati 1).
- Biaya per tenant naik jauh di atas pola harian normalnya.
- Lonjakan panggilan model / token per sesi pada satu tenant.
- Plafon budget tenant tercapai; permintaan AI mulai ditolak oleh budget cap.

## Cara memastikan

1. Lihat metrik burn rate yang dipanen harvester: rasio pembakaran per tenant
   (`chai_ai_budget_burn_ratio`) dan tren biaya (`chai_ai_cost_cents_total`).
2. Identifikasi tenant penyebab: urutkan burn ratio menurun; cari satu tenant
   yang mendominasi versus lonjakan merata.
3. Bedakan sah vs anomali: apakah ada kampanye/trafik nyata, atau pola loop
   (balasan AI memicu event yang memicu balasan lagi), atau token per sesi
   melonjak tak wajar.
4. Cek apakah budget cap benar-benar menegakkan plafon di runtime (bukan hanya
   tercatat): permintaan setelah plafon harus ditolak, bukan diteruskan.

## Langkah mitigasi

1. Bila loop/anomali pada satu tenant: turunkan plafon efektif atau throttle
   panggilan AI tenant tersebut sampai akar masalah jelas — lindungi tenant lain
   dan tagihan platform lebih dulu.
2. Matikan panggilan model non-kritis (mis. enrichment opsional) sementara;
   kapabilitas modul default mati, jadi mematikan yang opsional tidak merusak core.
3. Bila lonjakan sah: naikkan plafon tenant secara sadar (keputusan biaya), catat
   alasannya; jangan diam-diam melewatkan cap.
4. Bila terindikasi penyalahgunaan/abuse: koordinasi dengan pemilik akun tenant,
   pertimbangkan kill switch per-tenant.
5. Uang selalu integer minor units + kode mata uang — jangan menjumlahkan biaya
   lintas mata uang tanpa konversi FX berversi saat menghitung dampak.

## Cara verifikasi pulih

- `chai_ai_budget_burn_ratio` tenant kembali di bawah ambang dan stabil.
- Tren `chai_ai_cost_cents_total` kembali menyerupai baseline harian.
- Tidak ada penolakan budget cap yang tak terduga untuk tenant sah lain.
- Bila disubah plafonnya, perubahan tercatat di audit dan disepakati pemilik biaya.

## Kapan eskalasi

- Biaya terus memanjat meski sudah di-throttle → page pemilik biaya AI + platform lead.
- Dugaan penyalahgunaan/kompromi kredensial → jalur keamanan, bukan hanya biaya.
- Budget cap ternyata tidak menegakkan plafon di runtime → bug P0, buka
  postmortem dan jadikan blocker sampai penegakan terbukti.
