# Canonical Glossary

| Term | Definition |
|---|---|
| Tenant | Boundary bisnis dan data utama untuk satu client organization |
| Channel | Jenis media komunikasi, misalnya WhatsApp atau website |
| Channel Account | Satu account/nomor/page/store yang terhubung ke tenant |
| Provider | Implementasi transport untuk suatu channel atau AI capability |
| Contact | Customer profile canonical dalam satu tenant |
| Contact Identity | Identifier customer pada satu channel account |
| Conversation | Thread layanan canonical antara contact dan tenant |
| Message | Unit inbound/outbound/internal dalam conversation |
| Attachment | Reference file/media yang terkait message |
| Human Takeover | State ketika AI berhenti mengirim dan agent manusia mengendalikan conversation |
| Agent Profile | Konfigurasi perilaku AI untuk tenant/use case |
| Model Alias | Nama logical model yang dipetakan ke deployment fisik |
| AI Gateway | Boundary provider-neutral untuk model calls |
| Tool | Operasi terstruktur yang dapat diusulkan AI |
| Action Request | Permintaan eksekusi tool setelah policy validation |
| Capability | Fitur yang didukung connector, model, tenant, atau plan |
| Entitlement | Hak tenant memakai capability berdasarkan package/config |
| Knowledge Source | Sumber content yang di-ingest untuk RAG |
| Chunk | Unit retrieval yang berasal dari versioned document |
| Evidence | Chunk/source yang mendukung AI answer |
| Lead | Potensi customer/opportunity dalam tenant |
| Qualification | Penilaian rule + AI terhadap kelayakan lead |
| Appointment | Booking canonical yang dipetakan ke calendar event |
| Automation | Definition event-condition-action yang versioned |
| Workflow Run | Eksekusi automation tertentu |
| Outbox | Record transactional yang akan dipublikasikan/dikirim |
| Inbox Event | Record external event untuk deduplication dan processing |
| Idempotency Key | Kunci yang membuat retry tidak menghasilkan side effect kedua |
| DLQ | Dead-letter queue untuk job/event yang gagal permanen |
| RLS | PostgreSQL Row-Level Security |
| BYOK | Bring Your Own Key untuk AI/provider credentials |
| Meta Direct | Integrasi langsung ke Meta Cloud API dengan webhook platform |
| BSP | Official Business/Solution Partner untuk WhatsApp |
| Community Gateway | Session-based WhatsApp bridge yang tidak resmi dan best-effort |
| Platform Owner | Founder dan satu-satunya internal role aktif pada MVP |
| Client Portal | Dashboard operasional milik satu tenant |
| Internal Control Panel | Control plane lintas tenant yang hanya untuk Platform Owner pada MVP |
| SLO | Service Level Objective internal/kontraktual sesuai scope |
| RPO | Maximum acceptable data loss window |
| RTO | Maximum acceptable recovery duration |
| Canonical Event | Event provider-neutral yang dipakai seluruh platform |
| Metric Event | Append-only event untuk perhitungan KPI |
| Vertical Pack | Template agent, knowledge, fields, automation, dan dashboard untuk industri tertentu |
| Payment Orchestration | Pembuatan request/link, verifikasi status, attribution, dan reconciliation melalui akun provider milik tenant tanpa menampung dana |
| Payment Provider Account | Koneksi merchant/gateway milik satu tenant dan satu environment |
| Hosted Checkout | Halaman pembayaran yang di-host provider sehingga data pembayaran sensitif tidak masuk platform |
| Payment Request | Permintaan jumlah/currency/purpose yang terhubung ke invoice, order, booking, atau business reference |
| Payment Attempt | Satu percobaan checkout/provider untuk Payment Request |
| Payment Reconciliation | Perbandingan projection platform dengan status authoritative provider |
| Unknown Result | Kondisi ketika provider mungkin menerima mutation tetapi respons tidak pasti; wajib reconcile sebelum retry |
| Shipment | Satu movement fulfillment yang dapat memiliki beberapa package/item dan terhubung ke order/contact |
| Shipment Package | Satu parcel fisik di dalam Shipment |
| Tracking Event | Milestone immutable dari provider yang dipetakan ke canonical shipment state |
| Shipment Exception | Masalah delivery seperti stale, failed, address issue, lost, damaged, atau return yang membutuhkan tindakan |
| Proof of Delivery | Artifact/referensi terbatas dari provider yang menunjukkan serah terima |
| Canonical Shipment Status | Taxonomy status provider-neutral yang versioned; provider code tetap disimpan sebagai diagnostic metadata |
| Bring Your Own Merchant | Tenant menghubungkan akun merchant/payment gateway miliknya sendiri dan menerima settlement langsung sesuai kontrak provider |
| Bring Your Own Shipping Provider | Tenant menghubungkan akun carrier/aggregator/fulfillment miliknya sendiri |
