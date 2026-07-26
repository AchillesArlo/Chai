# Summary & Blueprint Konsultasi — Omnichannel AI Customer Operations Platform

> **Dokumen Konsultasi & Ringkasan Eksekutif Baseline Platform**  
> *Versi:* 1.2 | *Tanggal:* 20 Juli 2026 | *Target:* Founder / Tech Lead / Platform Architect  

---

## 1. Ringkasan Eksekutif & Visi Platform

Produk yang dibangun bukan sekadar "bot WhatsApp biasa", melainkan **Platform Operasi Pelanggan Berbasis AI Multi-Tenant (Omnichannel AI Customer Operations Platform)** yang dapat dikonfigurasi secara independen untuk setiap klien (*tenant*).

Platform ini memiliki dua permukaan (*surface*) utama yang terpisah secara tegas:
1. **Internal Control Panel (Owner Console)**: Digunakan oleh tim internal/operator untuk membuat tenant, menghubungkan channel, mengonfigurasi AI & Knowledge Base, mengelola integrasi, memantau *system health*, dan metering biaya.
2. **Client Portal**: Digunakan oleh klien/tenant untuk mengelola *unified inbox*, melakukan *human handover* (mengambil alih pesan), melihat analitik, dan mengelola produk/booking/leads.

---

## 2. Keputusan Arsitektur Utama & Tech Stack

| Komponen | Keputusan Arsitektur (Blueprint v1.2) |
|---|---|
| **Pola Arsitektur** | **Modular Monolith Event-Driven** (API Server & Workers terpisah, satu source of truth) |
| **Language & Runtime** | **Full-Stack TypeScript** (Next.js untuk UI, NestJS/Fastify untuk Core API) |
| **Database & Tenancy** | **PostgreSQL** dengan **Row-Level Security (RLS)** untuk isolasi tenant yang ketat |
| **Queue & Workflows** | **Redis + BullMQ** (short jobs/events), **Temporal** (long-running durable workflows & timer) |
| **Integration Layer** | **n8n** sebagai integration layer (bukan conversation engine atau database) |
| **AI Gateway & Policy** | **Internal AI Gateway + Tool Policy Engine** (AI tidak mengeksekusi side effect secara langsung) |
| **WhatsApp Strategy** | **Meta Cloud API Direct** (Jalur produksi utama) & **Community/WAHA Gateway** (Jalur eksperimental/best-effort) |

---

## 3. Komponen & Modul Utama Platform

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT PORTAL & OWNER CONSOLE                     |
|                                   (Next.js + Tailwind CSS)                        |
+-----------------------------------------------------------------------------------+
                                          | REST API / SSE / WebSockets
+-----------------------------------------------------------------------------------+
|                        MODULAR MONOLITH CORE (NestJS / Fastify)                   |
|  +----------------+  +------------------+  +-------------------+  +------------+  |
|  | Tenant & RBAC  |  | Conversation/Inbox| | Commerce & Orders |  | Payment &  |  |
|  | Module         |  | Module           |  | Module            |  | Logistics  |  |
|  +----------------+  +------------------+  +-------------------+  +------------+  |
|  +-----------------------------------------------------------------------------+  |
|  | AI AGENT RUNTIME & GATEWAY (Knowledge RAG + Tool Policy Engine)             |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
     |                             |                            |
+----+--------+             +------+-------+            +-------+------+
| PostgreSQL  |             | Redis /      |            |  n8n / Meta  |
| (RLS DB)    |             | BullMQ Queue |            |  Cloud API   |
+-------------+             +--------------+            +--------------+
```

1. **Omnichannel Connector Engine**: Mengolah pesan inbound/outbound dari WhatsApp, Instagram, Live Chat, dan Email ke dalam bentuk *Canonical Conversation Model*.
2. **AI Agent & Knowledge Base (RAG)**: Menggunakan RAG (*Retrieval-Augmented Generation*), vector search, dan *Tool Policy Engine* untuk memvalidasi setiap tindakan AI sebelum dieksekusi ke database/API eksternal.
3. **Human-in-the-Loop (Handover)**: Fitur serah terima percakapan dari AI ke Agen Manusia secara instan dengan notifikasi real-time dan deteksi tabrakan agen (*collision detection*).
4. **Payment Orchestration & Logistics**: Dibuat sebagai provider-neutral module (penyedia link pembayaran hosted dan tracking pengiriman barang real-time tanpa menyimpan dana/kredensial pembayaran mentah di platform).

---

## 4. Evaluasi & Perbandingan Repository Open-Source (Skala 1 - 10)

Untuk mempercepat pengembangan atau dijadikan acuan kode, berikut adalah evaluasi repository GitHub open-source terbaik yang paling mendekati project ini:

| Repository | Skala Fitur & Bisnis | Skala Tech Stack | Deskripsi & Kegunaan Utama |
|---|:---:|:---:|---|
| 🏆 **[Chatwoot](https://github.com/chatwoot/chatwoot)** | **8.5 / 10** | **6.0 / 10** | **Paling Mendekati Secara Fitur Produk.** Omnichannel inbox, WhatsApp Meta API, Human Handover, & Multi-tenant matang. *Kelemahan:* Menggunakan Ruby on Rails. |
| ⚡ **[Twenty CRM](https://github.com/twentyhq/twenty)** | **7.0 / 10** | **9.5 / 10** | **Paling Mendekati Secara Kode & Arsitektur.** Monorepo TypeScript, NestJS, React, PostgreSQL RLS, BullMQ, & Modular Monolith yang identik 1:1 dengan stack kita. |
| 🛠️ **[Typebot](https://github.com/baptisteArno/typebot.io)** | **7.5 / 10** | **8.5 / 10** | **Acuan Integrasi WhatsApp & UI Client.** Full-stack TypeScript (Next.js, Prisma, PostgreSQL) untuk chatbot & WhatsApp API. |
| 🧠 **[Dify.ai](https://github.com/langgenius/dify)** | **7.0 / 10** | **5.5 / 10** | **Acuan AI Agent & RAG Engine.** Modul RAG, Tool Execution, dan AI Gateway paling matang. |

---

## 5. Pilihan Strategi Implementasi untuk Konsultasi

### 🔹 **Opsi 1: Full Custom Build (Sesuai Blueprint v1.2 Murni)**
* **Pendekatan**: Membangun dari nol menggunakan TypeScript (NestJS/Fastify + Next.js).
* **Acuan Codebase**: Menggunakan struktur arsitektur **Twenty CRM** sebagai template backend/monorepo, dan **Chatwoot** sebagai acuan desain UI/UX Inbox.
* **Kelebihan**: Kontrol 100% penuh atas kodingan, performa tinggi, tidak ada debt dari framework lain.
* **Kekurangan**: Membutuhkan waktu pengembangan 3–6 bulan untuk MVP.

### 🔹 **Opsi 2: Hybrid Headless (Chatwoot Engine + Custom AI Service)**
* **Pendekatan**: Menggunakan **Chatwoot** via Docker sebagai Messaging/Inbox Engine backend, lalu membangun **Custom AI Service (TypeScript)** dan **Client Portal (Next.js)** terpisah yang terhubung via Webhook/API.
* **Kelebihan**: MVP siap dalam 2–4 minggu.
* **Kekurangan**: Memiliki dua stack terpisah (Ruby & Node.js).

---

## 6. Checklist Diskusi / Konsultasi Tim

- [ ] Apakah akan memilih **Opsi 1 (Full Custom Build)** atau **Opsi 2 (Chatwoot Hybrid)**?
- [ ] Apakah integrasi WhatsApp tahap awal difokuskan pada **Meta Cloud API Direct** atau **Self-hosted Gateway (WAHA)**?
- [ ] Apakah modul **Payment Orchestration** & **Logistics Tracking** dimasukkan ke MVP Stage 1 atau ditunda ke Stage 2?
