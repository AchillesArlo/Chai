# Omnichannel AI Customer Operations Platform

## Engineering Blueprint — Master Index

| Metadata | Nilai |
|---|---|
| Status | Implementation-ready baseline |
| Versi | 1.2 |
| Tanggal | 15 Juli 2026 |
| Product owner | Founder / Platform Owner |
| Architecture status | Approved |
| Target implementation | MVP menuju production-ready |
| Primary timezone | Asia/Jakarta |
| Primary locale | Bahasa Indonesia; English supported |

Paket ini adalah sumber kerja utama untuk product, design, frontend, backend, AI, integration, QA, dan operations. PRD utama tetap menjadi sumber visi dan scope; dokumen dalam folder ini menerjemahkannya menjadi spesifikasi implementasi.

## 1. Keputusan yang Dikunci

Keputusan berikut berlaku sampai diubah melalui Architecture Decision Record:

1. Backend menggunakan modular monolith event-driven dengan worker terpisah.
2. PostgreSQL adalah source of truth dan Row-Level Security menjadi lapisan isolasi tenant.
3. Tenant adalah boundary utama; channel account, termasuk nomor WhatsApp, berada di bawah tenant.
4. Internal Control Panel dan Client Portal adalah aplikasi/surface terpisah.
5. Pada MVP, **hanya akun Founder dengan role PLATFORM_OWNER** yang dapat mengakses Internal Control Panel.
6. Role internal lain sudah dimodelkan, tetapi disabled sampai Founder mengaktifkannya.
7. Client user tidak pernah dapat memperoleh role atau route internal melalui UI maupun API.
8. WhatsApp production default adalah Meta Cloud API Direct dengan webhook milik platform.
9. Community WhatsApp Gateway hanya operator-enabled, best-effort, tanpa production channel SLA.
10. n8n adalah integration layer, bukan conversation engine atau database.
11. AI menggunakan internal gateway contract dan logical model aliases; provider dapat diganti.
12. AI tidak mengeksekusi side effect secara langsung; setiap action melewati Tool Policy Engine.
13. BullMQ menangani short jobs; Temporal diperkenalkan untuk durable/long-running workflows.
14. S3-compatible object storage menyimpan media; queue hanya membawa reference.
15. MVP diluncurkan ke 3–5 design partners sebelum perluasan channel/commerce.
16. Payment dibangun sebagai orchestration layer dengan akun merchant milik tenant; platform tidak menyimpan kredensial pembayaran mentah atau menampung dana.
17. Logistics menggunakan canonical shipment/tracking model; akun carrier/aggregator/marketplace milik tenant dan provider tetap menjadi source of truth.
18. Hosted payment link dan read-only shipment tracking dapat masuk Stage 1 sebagai modul vertikal opsional; refund, label/pickup, dan return mutation memiliki gate terpisah.

## 2. Dokumen dalam Paket

| Dokumen | Tujuan | Pengguna utama |
|---|---|---|
| [01_PRODUCT_SCOPE.md](01_PRODUCT_SCOPE.md) | Scope, persona, business rules, dan launch boundary | Product, semua tim |
| [02_SYSTEM_ARCHITECTURE.md](02_SYSTEM_ARCHITECTURE.md) | C4, module boundaries, deployment, scaling, sequence | Backend, DevOps |
| [03_UX_UI_SPECIFICATION.md](03_UX_UI_SPECIFICATION.md) | Seluruh route, screen, flow, state, dan UX rules | Product, Design, Frontend |
| [04_DESIGN_SYSTEM.md](04_DESIGN_SYSTEM.md) | Token, component, accessibility, chart, responsive behavior | Design, Frontend |
| [05_DATA_MODEL_AND_TENANCY.md](05_DATA_MODEL_AND_TENANCY.md) | Entity dictionary, keys, RLS, indexing, lifecycle | Backend, Data |
| [06_API_AND_REALTIME_CONTRACT.md](06_API_AND_REALTIME_CONTRACT.md) | REST, errors, idempotency, endpoints, SSE/WebSocket | Frontend, Backend |
| [07_EVENTS_AUTOMATIONS_AND_JOBS.md](07_EVENTS_AUTOMATIONS_AND_JOBS.md) | Event catalog, queues, outbox, workflow semantics | Backend, Integration |
| [08_AI_AGENT_AND_KNOWLEDGE.md](08_AI_AGENT_AND_KNOWLEDGE.md) | Agent runtime, gateway, tools, RAG, evals, safety | AI, Backend |
| [09_CHANNEL_AND_CONNECTOR_SPEC.md](09_CHANNEL_AND_CONNECTOR_SPEC.md) | Connector interface dan channel-specific rules | Integration, Backend |
| [10_SECURITY_PRIVACY_AND_RBAC.md](10_SECURITY_PRIVACY_AND_RBAC.md) | Threat model, IAM, owner-only access, privacy | Security, Backend |
| [11_ANALYTICS_AND_KPI_DICTIONARY.md](11_ANALYTICS_AND_KPI_DICTIONARY.md) | Metric definitions, events, dashboards, QA | Product, Data |
| [12_QA_AND_TEST_STRATEGY.md](12_QA_AND_TEST_STRATEGY.md) | Test matrix, fixtures, release gates | QA, Engineering |
| [13_DEVOPS_SRE_AND_RUNBOOKS.md](13_DEVOPS_SRE_AND_RUNBOOKS.md) | Environments, CI/CD, observability, DR, incidents | DevOps, SRE |
| [14_ENGINEERING_BACKLOG.md](14_ENGINEERING_BACKLOG.md) | Epics, dependencies, sequencing, DoR/DoD | Product, Engineering |
| [15_ADR_REGISTER.md](15_ADR_REGISTER.md) | Rekaman keputusan arsitektur | Tech lead, semua tim |
| [16_TECH_STACK_AND_REPO_STANDARDS.md](16_TECH_STACK_AND_REPO_STANDARDS.md) | Pilihan library, runtime, repo, coding, dan reference deployment | Semua engineer |
| [17_PAYMENT_AND_LOGISTICS_SPEC.md](17_PAYMENT_AND_LOGISTICS_SPEC.md) | Payment orchestration, shipment tracking, state, API, security, dan fase 0–4 | Product, Backend, Integration, QA, SRE |
| [18_ENGINEERING_GAPS_AND_REMEDIATIONS.md](18_ENGINEERING_GAPS_AND_REMEDIATIONS.md) | Register kecacatan, keputusan yang hilang, remediation, gate, dan acceptance criteria lintas dokumen | Product, Architecture, Engineering, Security, QA, SRE |
| [GLOSSARY.md](GLOSSARY.md) | Istilah canonical | Semua tim |

PRD utama: [PRD_Arsitektur_Omnichannel_AI_Customer_Operations_Platform.md](PRD_Arsitektur_Omnichannel_AI_Customer_Operations_Platform.md)

## 3. Urutan Baca

### Founder/Product

1. PRD utama
2. Product Scope
3. UX/UI Specification
4. Analytics/KPI
5. Payment and Logistics Specification
6. Engineering Backlog

### Frontend

1. UX/UI Specification
2. Design System
3. API & Realtime Contract
4. Security/RBAC
5. QA Strategy

### Backend

1. System Architecture
2. Data Model
3. API Contract
4. Events/Jobs
5. AI and Connector specifications
6. Payment and Logistics Specification
7. Security/RBAC
8. Engineering Gaps and Remediations

### DevOps/SRE

1. System Architecture
2. Security/RBAC
3. DevOps/SRE/Runbooks
4. Payment and Logistics Specification
5. QA release gates
6. Engineering Gaps and Remediations

## 4. Source-of-Truth Precedence

Jika terjadi konflik:

1. Security/privacy requirement mengalahkan UX convenience.
2. ADR berstatus Accepted mengalahkan dokumen arsitektur lama.
3. API contract mengalahkan asumsi frontend.
4. Data model/RLS mengalahkan payload convenience.
5. PRD menentukan outcome dan scope.
6. Backlog menentukan urutan, bukan mengubah requirement.

Konflik yang tidak dapat diselesaikan dengan aturan tersebut harus menjadi ADR baru.

## 5. Repository Layout yang Direkomendasikan

```text
apps/
  owner-console/
  client-portal/
  api/
  realtime-gateway/
workers/
  channel-worker/
  media-worker/
  automation-worker/
  payment-worker/
  logistics-worker/
  analytics-worker/
packages/
  contracts/
  domain/
  auth/
  database/
  ui/
  observability/
  connector-sdk/
infra/
  compose/
  terraform/
  monitoring/
docs/
```

owner-console dan client-portal boleh berada dalam satu Next.js deployment pada MVP hanya jika route, session audience, middleware, dan build-time navigation dipisahkan tegas. Rekomendasi default adalah dua apps agar risiko accidental exposure lebih kecil.

## 6. Environment Baseline

| Environment | Data | External side effect | Tujuan |
|---|---|---|---|
| local | Synthetic | Mock/sandbox | Development |
| test | Ephemeral | Mock | CI |
| staging | Synthetic/anonymized | Sandbox/test accounts | E2E, UAT |
| production | Real tenant data | Live | Customer traffic |

Production secrets, customer data, dan channel accounts tidak boleh digunakan di local/test.

## 7. Implementation Readiness Gate

Coding feature boleh dimulai bila:

- user story memiliki acceptance criteria;
- route/screen dan permission sudah diketahui;
- API/event contract tersedia;
- data owner dan retention diketahui;
- error/loading/empty states didefinisikan;
- audit dan metric events ditentukan;
- test cases critical path tersedia;
- dependency dan feature flag diketahui.

## 8. Change Control

- Perubahan copy/layout kecil: design review.
- Perubahan endpoint non-breaking: contract review.
- Perubahan schema/event: migration + compatibility review.
- Perubahan auth, tenancy, AI action, atau provider boundary: ADR wajib.
- Perubahan scope MVP: Founder approval.
- Perubahan production SLO: Founder + technical owner approval.

## 9. Definition of Documentation Complete

Paket dianggap siap digunakan jika:

- tidak ada route tanpa permission;
- tidak ada endpoint mutation tanpa idempotency/audit decision;
- tidak ada entity business tanpa tenant ownership decision;
- tidak ada AI tool tanpa risk class;
- tidak ada metric tanpa formula dan denominator;
- tidak ada critical flow tanpa test dan runbook;
- tidak ada external connector tanpa capability/rate-limit/error policy.
- tidak ada payment/shipment status yang dipercaya tanpa authoritative-source dan reconciliation policy;
- tidak ada payment atau logistics mutation tanpa risk class, idempotency, confirmation/approval, dan uncertain-result handling;
- setiap Stage 0–4 capability memiliki entry/exit gate, feature flag, test, metric, dan runbook sesuai risikonya.
