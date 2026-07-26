# Product Scope and Operating Rules

## 1. Product Statement

Platform adalah multi-tenant AI customer operations system yang menyatukan customer service, sales qualification, booking, follow-up, knowledge, human inbox, payment orchestration, shipment tracking, dan business actions di berbagai channel.

Produk dijual sebagai managed service. Founder mengoperasikan control plane; client memperoleh portal transparan yang hanya mengakses tenant mereka.

## 2. Product Surfaces

| Surface | Audience | Purpose |
|---|---|---|
| Internal Control Panel | PLATFORM_OWNER saja pada MVP | Membuat tenant, channel, AI, limits, health, billing, audit |
| Client Portal | Client Owner/Admin/Manager/Agent/Analyst/Viewer | Operasi inbox, knowledge, lead, booking, analytics |
| Website Widget | End customer | Chat, media, forms, handover |
| Channel Endpoints | External providers | Webhooks dan outbound actions |
| Partner API | Future integration accounts | Controlled machine-to-machine integration |

## 3. MVP Outcome

MVP harus memungkinkan satu klien:

1. Menghubungkan WhatsApp Meta Direct atau website widget.
2. Menjawab FAQ berdasarkan knowledge yang disetujui.
3. Menerima text, image, voice note, dan dokumen dasar.
4. Mengalihkan conversation ke agent manusia.
5. Menangkap serta mengkualifikasi lead.
6. Melihat dan membuat booking Google Calendar.
7. Menjalankan follow-up sederhana dengan stop rules.
8. Melihat dashboard service, lead, booking, AI quality, dan usage.
9. Mengganti AI provider/model alias tanpa mengubah conversation core.
10. Jika entitlement aktif, membuat hosted payment link untuk booking/order/invoice dan memverifikasi status melalui provider milik tenant.
11. Jika entitlement aktif, membaca shipment tracking dari shipping API milik tenant dan mengirim milestone/exception notification.

## 4. Personas

### 4.1 Platform Owner

- Satu-satunya internal user aktif pada MVP.
- Mengakses semua tenant melalui explicit tenant selector.
- Membuat dan menonaktifkan tenant.
- Mengatur plan, quota, provider, connector, dan risk flags.
- Dapat meminta time-bound support access ke content tenant; semua akses diaudit.
- Mengelola secrets melalui secure flow tanpa melihat kembali plaintext.

### 4.2 Client Owner

- Pemilik operasional tenant.
- Mengelola client users dan konfigurasi bisnis yang aman.
- Melihat usage dan outcome.
- Tidak dapat mengakses provider secrets, platform margin, global health, atau tenant lain.

### 4.3 Client Manager

- Mengelola queue, assignment, SLA, lead, booking, dan laporan.
- Dapat menyetujui medium/high actions sesuai limit.

### 4.4 Client Agent

- Menangani conversation yang diizinkan.
- Dapat pause/resume AI pada conversation.
- Tidak mengubah billing, model route, connector, atau tenant policy.

### 4.5 Client Analyst/Viewer

- Analyst dapat memakai filter dan export sesuai permission.
- Viewer hanya membaca dashboard summary.

### 4.6 End Customer

- Tidak memiliki akun platform.
- Diidentifikasi melalui channel identity dalam tenant.
- Dapat meminta manusia, opt-out, koreksi data, atau penghapusan sesuai policy.

## 5. Business Rules

### 5.1 Tenant

- Tenant tidak pernah dihapus langsung; status berubah ACTIVE → SUSPENDED → PENDING_DELETION → DELETED.
- Suspension menghentikan outbound automation terlebih dahulu.
- Semua business records memiliki tenant_id.
- Channel account hanya dapat dimiliki satu tenant.

### 5.2 Conversation

- Satu conversation memiliki satu active channel account.
- Reopen window configurable; default 24 jam setelah resolved.
- Human takeover menghentikan AI outbound sampai explicit resume.
- Internal notes tidak pernah muncul pada outbound payload.

### 5.3 Contact identity

- Nomor telepon tidak unique secara global.
- Unique identity: tenant + channel + channel account + external user id.
- Merge contact tidak otomatis hanya berdasarkan nama.
- Identity terverifikasi memiliki priority lebih tinggi daripada AI inference.

### 5.4 AI

- Agent hanya memakai published configuration.
- AI response harus dapat dilacak ke prompt/model/knowledge version.
- Tidak ada tool execution tanpa policy validation.
- Low evidence, safety risk, atau repeated tool failure memicu handover.

### 5.5 Follow-up

- Follow-up harus memiliki consent basis.
- Reply, opt-out, closed lead, completed booking, atau invalid channel menghentikan sequence.
- Channel policy dievaluasi kembali pada send time.

### 5.6 Booking

- Availability diperiksa ulang sebelum create.
- Semua create/reschedule/cancel memakai idempotency key.
- Timezone customer dan resource ditampilkan eksplisit pada confirmation.

### 5.7 Commerce

- External commerce/ERP adalah source of truth pada awal.
- Read actions mendahului write actions.
- Stock response menyebut freshness.
- Refund/cancel/inventory mutation memerlukan approval sesuai policy.

### 5.8 Payment

- Tenant menghubungkan akun merchant/payment gateway miliknya sendiri.
- Platform mengorkestrasi hosted payment link dan status; dana tidak ditampung atau diteruskan platform.
- Amount/currency berasal dari invoice, order, booking, atau draft manusia yang disetujui.
- Screenshot, redirect, dan klaim customer bukan bukti pembayaran final.
- Status final berasal dari verified webhook atau authenticated provider reconciliation.
- Refund/payout/split/recurring capabilities disabled sampai gate fase terkait lulus.

### 5.9 Logistics

- Tenant menghubungkan akun carrier, aggregator, fulfillment, atau marketplace miliknya sendiri.
- Provider/marketplace tetap menjadi source of truth; platform menyimpan canonical projection dan timeline.
- Customer tracking lookup memverifikasi identity/order ownership sesuai tenant policy.
- ETA selalu menyebut source dan freshness; AI tidak mengarang tanggal pengiriman.
- Cost-bearing/destructive actions seperti label, pickup, cancel, dan return memerlukan recheck serta approval.

## 6. Capability Entitlements

| Capability | Core | Add-on | Default MVP |
|---|---:|---:|---:|
| WhatsApp Meta Direct |  | ✓ | Enabled per tenant |
| Website widget | ✓ |  | Enabled |
| Community WhatsApp Gateway |  | Experimental | Disabled |
| Unified inbox | ✓ |  | Enabled |
| Knowledge/RAG | ✓ |  | Enabled |
| Multimodal | Basic | Advanced | Basic |
| Lead qualification | ✓ | Advanced scoring | Basic |
| Calendar |  | ✓ | Optional |
| Follow-up | Basic | Advanced automation | Basic |
| Hosted payment link |  | Add-on | Optional vertical pilot |
| Shipment tracking |  | Add-on | Optional vertical pilot |
| Refund/recurring payment |  | Advanced | Disabled |
| Shipment label/pickup/return |  | Advanced | Disabled |
| Instagram |  | ✓ | Deferred |
| Commerce |  | ✓ | Deferred/read-first |
| Advanced analytics |  | ✓ | Deferred |
| Dedicated deployment |  | Enterprise | Deferred |

Disabled capability:

- tidak muncul di navigation;
- tidak muncul sebagai AI tool;
- API mengembalikan FEATURE_NOT_ENABLED;
- background jobs tidak dibuat;
- data lama tetap aman dan dapat diaktifkan kembali sesuai retention.

## 7. MVP Functional Scope

### Must

- Tenant lifecycle dan owner-only control panel.
- Client user invitations dan RBAC.
- Meta Direct webhook/outbound adapter.
- Website widget.
- Contacts, identities, conversations, messages, attachments.
- Unified inbox, assignment, takeover, notes.
- Agent profiles, knowledge ingestion, RAG, model aliases.
- Voice transcription, image understanding, basic document extraction.
- Lead fields, qualification, assignment.
- Calendar availability dan booking.
- Simple follow-up.
- Provider-neutral payment and logistics contracts, tenant isolation, webhook verification, reconciliation, and feature flags.
- One hosted-payment-link journey and one read-only shipment-tracking journey for a design partner when the corresponding optional module is enabled.
- Client and owner dashboards.
- Audit, metering, observability, backup.

### Should

- BYOK.
- Community Gateway pilot.
- CSAT.
- Knowledge freshness alerts.
- Scheduled report.
- Suggested replies for human agents.

### Explicitly deferred

- Generic TikTok DM.
- Marketplace write operations.
- Visual workflow builder.
- Voice calls.
- Native mobile apps.
- Multi-region active-active.
- Full CRM/ERP replacement.
- Payment custody, payout, split settlement, or stored card/bank credentials.
- Autonomous refund, label purchase, pickup, shipment cancellation, or return creation.

## 8. Launch Guardrails

- Maksimum 5 design-partner tenants.
- Meta Direct menjadi channel utama untuk client production.
- Community Gateway hanya untuk approved pilot.
- Destructive commerce actions disabled.
- Payment uses hosted checkout; refund/recurring/payout/split capabilities disabled.
- Logistics is tracking read-only; cost-bearing shipment mutations disabled.
- Payment and shipping provider accounts, credentials, queues, and data are tenant-isolated.
- Prompt/model updates melalui canary.
- Founder menerima daily health/cost digest.
- Setiap tenant memiliki named human escalation target.

## 9. Success Criteria

MVP dianggap berhasil bila selama 30 hari:

- tidak ada cross-tenant exposure;
- ≥99.5% platform API availability;
- ≥95% accepted logical messages selesai diproses tanpa manual replay;
- minimal 3 tenant aktif mingguan;
- minimal satu outcome bernilai per tenant: resolved question, qualified lead, atau booking;
- dashboard usage dapat direkonsiliasi;
- Founder dapat meng-onboard tenant berikutnya tanpa menyalin core workflow.
- enabled payment pilot completes link → verified paid/expired outcome without duplicate side effect;
- enabled logistics pilot completes linked shipment → normalized tracking/exception flow without exposing another customer’s data.

## 10. Requirement Traceability Tags

Semua work item memakai tag:

- TEN: tenancy/IAM;
- CHN: channel;
- INB: inbox;
- CON: conversation;
- AIA: AI/agent;
- KB: knowledge;
- MED: multimodal;
- SAL: lead/sales;
- CAL: booking;
- AUT: automation;
- COM: commerce;
- PAY: payment orchestration;
- LOG: logistics/shipment;
- REP: reporting;
- SEC: security;
- OPS: operations.
