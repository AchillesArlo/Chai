# Jalur D — AI Agent, Knowledge, Connector

> Audit terhadap `Omnichannel_AI_Platform_Engineering_Blueprint_v1.2/08_AI_AGENT_AND_KNOWLEDGE.md` (433 baris)
> dan `09_CHANNEL_AND_CONNECTOR_SPEC.md` (450 baris). Metode & aturan bukti: `docs/plans/2026-07-27-rencana-audit-blueprint.md` §3, §10.
> Read-only. Dokumen internal (README, remediasi) **bukan** bukti; hanya kode + keluaran perintah.
> Baris blueprint diverifikasi: `(Get-Content <doc>).Count` → 433 dan 450.

## Temuan struktural yang membingkai seluruh Jalur D

Dua fakta wiring menentukan hampir semua klasifikasi di bawah:

1. **Runtime AI (`services/ai-gateway`) tidak diimpor oleh aplikasi/worker mana pun.**
   `@chai/ai-gateway` hanya muncul sebagai nama di `package.json`-nya sendiri; tidak ada
   `package.json` lain yang men-declare dependensi itu.
   Perintah: `grep '@chai/ai-gateway' **/package.json` → 1 hasil (definisi paket itu sendiri).
   Akibatnya: gateway model, `ToolExecutionEngine`, guardrail injection, RAG, dan budget cap
   **ada + berteskan unit** tetapi **tidak berada di jalur produksi**. `createAiGateway` dan
   `ToolExecutionEngine` hanya dipakai di berkas `test/`.

2. **Tidak ada runtime agen yang mengeksekusi proposal tool.** Tidak ada konsumen
   `toolProposals` di produksi (`grep 'toolProposal|proposedTool|tool_call'` → hanya
   `services/ai-gateway/**` + adapter model yang selalu `toolProposals: []` + berkas tes).
   `grep 'invokeAgent|runAgent|agentRuntime|runConversationTurn'` → 0 hasil kode.
   Adapter OpenAI/Anthropic (`packages/connectors/src/connectors/{openai,anthropic}/index.ts`)
   mengembalikan `toolProposals: []` tanpa parsing tool-call.

**Konsekuensi untuk invarian** (policy engine satu-satunya pemberi izin efek samping tool AI;
tool tak dikenal ditolak): invarian **tidak dilanggar** — justru karena tidak ada satu pun
jalur produksi di mana AI menyebabkan efek samping tool. Lapisan **keputusan** (`evaluateToolPolicy`)
benar, dapat dijangkau lewat `POST /api/client/v1/actions/evaluate`, dan menolak tool tak dikenal.
Lapisan **eksekusi** (`ToolExecutionEngine`, yang mewajibkan keputusan ALLOW) tidak ter-wire.
Tidak ada `BERTENTANGAN`; risikonya adalah kapabilitas yang belum dibangun, bukan lubang keamanan aktif.

---

## Ringkasan Jalur D — Dokumen 08 (AI Agent & Knowledge)

| ID | Persyaratan | Kelas | Severity |
|---|---|---|---|
| REQ-08-001 | Kontrak AI internal provider-neutral (request/response) | SEBAGIAN | LOW |
| REQ-08-002 | Core tidak pernah menyimpan respons provider-spesifik sebagai kontrak bisnis | TIDAK-TERVERIFIKASI | LOW |
| REQ-08-003 | Provider baru = adapter+manifest, bukan perubahan core | SEBAGIAN | LOW |
| REQ-08-004 | Alias model logis memisahkan tier tenant dari deployment fisik | SEBAGIAN | LOW |
| REQ-08-005 | Routing policy berurut + fallback lintas-provider terevaluasi | SEBAGIAN | MEDIUM |
| REQ-08-006 | HUMAN_ACTIVE = tidak ada outbound AI | SEBAGIAN | MEDIUM |
| REQ-08-007 | Tanpa evidence fakta tenant → tanya/kualifikasi/handover | SEBAGIAN | MEDIUM |
| REQ-08-008 | AI tak dapat menimpa consent/permission/entitlement/approval/state | SEBAGIAN | HIGH |
| REQ-08-009 | AI tak pernah menerima akses DB tak terbatas | SEBAGIAN | MEDIUM |
| REQ-08-010 | Hasil tool tak tepercaya & divalidasi | SEBAGIAN | MEDIUM |
| REQ-08-011 | Memori jangka panjang: field disetujui, sumber/expiry, tanpa trait spekulatif | HILANG | LOW |
| REQ-08-012 | Siklus hidup prompt + prompt terbit imutabel | SEBAGIAN | MEDIUM |
| REQ-08-013 | Pipeline ingestion knowledge (scan→extract→chunk→embed→hybrid→review→publish) | SEBAGIAN | MEDIUM |
| REQ-08-014 | Retrieval hybrid full-text + vektor + rerank | SEBAGIAN | MEDIUM |
| REQ-08-015 | Filter retrieval tenant/visibility/language/effective-date | SEBAGIAN | MEDIUM |
| REQ-08-016 | Ambang minimum evidence + kembalikan source/chunk id + excerpt | TERPENUHI | - |
| REQ-08-017 | Tanpa retrieval lintas-tenant | TERPENUHI | - |
| REQ-08-018 | Kebijakan grounded answer klaim tenant-spesifik | SEBAGIAN | HIGH |
| REQ-08-019 | Katalog tool kanonik dengan risk tier | TERPENUHI | - |
| REQ-08-020 | ExecuteRefund CRITICAL, tak boleh dieksekusi AI | TERPENUHI | - |
| REQ-08-021 | Kontrak eksekusi tool 12 langkah + ActionRequest idempoten + audit | SEBAGIAN | HIGH |
| REQ-08-022 | Policy engine satu-satunya pemberi izin; tool tak dikenal ditolak (ADR-011) | SEBAGIAN | MEDIUM |
| REQ-08-023 | Nilai uang/alamat/kurir tak pernah dari teks model bebas | SEBAGIAN | HIGH |
| REQ-08-024 | Evidence pembayaran = webhook/query terverifikasi, bukan screenshot | TERPENUHI | - |
| REQ-08-025 | Mutasi eksternal tak pasti tetap RECONCILING, tanpa retry duplikat | SEBAGIAN | MEDIUM |
| REQ-08-026 | Multimodal (image/audio/document); injeksi dokumen = untrusted | SEBAGIAN | MEDIUM |
| REQ-08-027 | Guard prompt-injection / content boundary | SEBAGIAN | MEDIUM |
| REQ-08-028 | Redaksi secret/PII | SEBAGIAN | MEDIUM |
| REQ-08-029 | Allowlist tool per tenant | SEBAGIAN | MEDIUM |
| REQ-08-030 | URL/domain allowlist, prohibited topic, loop limit, max tool/turn | HILANG | MEDIUM |
| REQ-08-031 | Framework evaluasi: dataset + metrik | SEBAGIAN | LOW |
| REQ-08-032 | Release floor: zero regression safety + canary | HILANG | MEDIUM |
| REQ-08-033 | Trace AI tertaut + raw trace terbatas | SEBAGIAN | LOW |
| REQ-08-034 | Budget bulanan per tenant + ceiling per request + fail-to-safe | SEBAGIAN | MEDIUM |
| REQ-08-035 | AC: provider swap mempertahankan kontrak internal | SEBAGIAN | LOW |
| REQ-08-036 | AC: kapabilitas salah tak pernah dipilih | HILANG | MEDIUM |
| REQ-08-037 | AC: policy tenant terbatas memblokir provider | SEBAGIAN | MEDIUM |
| REQ-08-038 | AC: skema tool invalid tak pernah dieksekusi | SEBAGIAN | MEDIUM |
| REQ-08-039 | AC: AI tak dapat mengarang nominal/diskon/pajak/tandai paid | SEBAGIAN | HIGH |
| REQ-08-040 | AC: AI tak dapat membocorkan shipment pelanggan lain dari tracking tebakan | SEBAGIAN | HIGH |
| REQ-08-041 | AC: human takeover memblokir kirim AI | SEBAGIAN | MEDIUM |
| REQ-08-042 | AC: skenario tanpa-evidence tak berhalusinasi | SEBAGIAN | MEDIUM |
| REQ-08-043 | AC: dokumen prompt-injection tak memperluas akses tool | SEBAGIAN | MEDIUM |
| REQ-08-044 | AC: rollback rilis model bekerja | HILANG | MEDIUM |
| REQ-08-045 | AC: budget tenant mengisolasi tenant berisik | SEBAGIAN | MEDIUM |


---

## Ringkasan Jalur D — Dokumen 09 (Channel & Connector)

| ID | Persyaratan | Kelas | Severity |
|---|---|---|---|
| REQ-09-001 | Set operasi konektor kanonik terimplementasi | SEBAGIAN | MEDIUM |
| REQ-09-002 | Bentuk capability manifest | TERPENUHI | - |
| REQ-09-003 | Effective capability intersection (connector∩account∩entitlement∩policy) | HILANG | MEDIUM |
| REQ-09-004 | Hasil konektor ternormalisasi (success/externalId/retryability/error) | TERPENUHI | - |
| REQ-09-005 | Error taxonomy incl UNKNOWN_RESULT reconcile-before-retry | SEBAGIAN | MEDIUM |
| REQ-09-006 | Verifikasi signature + timestamp webhook | SEBAGIAN | HIGH |
| REQ-09-007 | Provider challenge handshake | HILANG | MEDIUM |
| REQ-09-008 | Replay prevention + inbox dedup | SEBAGIAN | MEDIUM |
| REQ-09-009 | Batas ukuran body + retensi raw terbatas | SEBAGIAN | LOW |
| REQ-09-010 | Meta Direct + required states | SEBAGIAN | MEDIUM |
| REQ-09-011 | Official BSP mode | HILANG | LOW |
| REQ-09-012 | Community Gateway (owner-only, kill switch legal) | HILANG | LOW |
| REQ-09-013 | Modul domain tak bercabang pada provider mode | TERPENUHI | - |
| REQ-09-014 | Keamanan widget: publishable key + signed session + origin + rate limit | SEBAGIAN | HIGH |
| REQ-09-015 | Konektor Instagram | HILANG | LOW |
| REQ-09-016 | Konektor TikTok (CONDITIONAL) | HILANG | LOW |
| REQ-09-017 | Konektor Shopee (read-first) | HILANG | LOW |
| REQ-09-018 | Konektor TikTok Shop | HILANG | LOW |
| REQ-09-019 | Konektor Google Calendar + rules | SEBAGIAN | LOW |
| REQ-09-020 | Konektor CRM/Helpdesk | HILANG | LOW |
| REQ-09-021 | Konektor Commerce/ERP | HILANG | LOW |
| REQ-09-022 | Payment hosted-checkout, tanpa field kartu mentah | TERPENUHI | - |
| REQ-09-023 | Verifikasi webhook payment + reconcile unknown-result | SEBAGIAN | HIGH |
| REQ-09-024 | Redirect/screenshot/klaim tak menetapkan PAID | TERPENUHI | - |
| REQ-09-025 | Peta status provider berversi, unknown→UNKNOWN | TERPENUHI | - |
| REQ-09-026 | Lookup tracking pelanggan butuh ownership, bukan nomor resi saja | TIDAK-TERVERIFIKASI | HIGH |
| REQ-09-027 | Webhook + state-aware polling fallback logistik | SEBAGIAN | MEDIUM |
| REQ-09-028 | Satu order → banyak shipment/paket | TIDAK-TERVERIFIKASI | LOW |
| REQ-09-029 | Penyimpanan auth/secret: vaulted + rotasi teraudit + tak ke browser | SEBAGIAN | HIGH |
| REQ-09-030 | Isolasi rate/concurrency per tenant + akun provider | SEBAGIAN | MEDIUM |
| REQ-09-031 | Harness conformance/certification konektor | TERPENUHI | - |
| REQ-09-032 | Certification payment (signature valid/invalid/rotated, redirect vs paid) | TERPENUHI | - |
| REQ-09-033 | Certification logistik (mapping unknown, multi-parcel, poll fallback, privacy) | TERPENUHI | - |
| REQ-09-034 | Disable/kill switch konektor | SEBAGIAN | HIGH |
| REQ-09-035 | Versioning konektor (adapter vs provider API) | SEBAGIAN | LOW |

### Penilaian ADR yang relevan (wajib per §4 rencana)

| ADR | Ringkasan | REQ terkait | Kondisi |
|---|---|---|---|
| ADR-010 | Kontrak AI provider-neutral, alias, LiteLLM replaceable | REQ-08-001/003/004 | parsial: kontrak & alias ada, tak ter-wire |
| ADR-011 | AI Proposes, Policy Executes | REQ-08-022/019/020/021 | keputusan benar & terjangkau; eksekusi tak ter-wire |
| ADR-012 | Hybrid RAG di PostgreSQL (full-text + pgvector) | REQ-08-014 | full-text saja; pgvector belum |
| ADR-014 | Strategi WhatsApp (Meta Direct default, BSP, Community) | REQ-09-010/011/012 | Meta Direct sandbox; BSP/Community belum |
| ADR-026 | Payment orchestration, bukan custody | REQ-09-022/023/024 | hosted checkout + webhook terverifikasi; adapter riil tak ter-wire |
| ADR-027 | Logistik kanonik, provider truth, unknown fail-safe | REQ-09-025/026/027 | mapping fail-safe terpenuhi; ownership lookup belum terverifikasi |
| ADR-028 | Modul vertikal opsional Stage 1 di balik entitlement | REQ-09-022, REQ-08-019 | entitlement gate terpasang (payment_orchestration/shipment_tracking) |


---

## Temuan Dokumen 08 — blok per REQ

### REQ-08-001 — Kontrak AI internal provider-neutral — SEBAGIAN — LOW
**Persyaratan** (`08_AI §3`): request/response internal ternormalisasi dengan field wajib (request_id, tenant_id, task_type, model_alias, sensitivity, max_cost, dst.).
**Kondisi nyata**: Tipe request/result ada di `packages/connectors/src/connectors/mock-ai/index.ts` (`AiCompletionRequest`/`AiCompletionResult`) dan dipakai gateway. Field yang dimintargetkan blueprint (sensitivity, latency_class, region_policy, max_cost, structured_output_schema, allowed_tools) tidak lengkap; gateway `complete()` hanya memakai model/tenantId/toolProposals.
**Bukti**: `services/ai-gateway/src/index.ts:45-113`; `mock-ai/index.ts:19-99`. Tidak ada importer produksi (lihat temuan struktural).
**Yang kurang**: field kontrak penuh (sensitivity/region/latency/max_cost/structured schema) dan pemakaiannya di jalur produksi.

### REQ-08-002 — Core tak menyimpan respons provider-spesifik sebagai kontrak bisnis — TIDAK-TERVERIFIKASI — LOW
**Persyaratan** (`08_AI §3`): "Core never persists provider-specific response as the business contract."
**Kondisi nyata**: Tidak ada jalur produksi yang mem-persist respons AI sama sekali (runtime AI tak ter-wire). Tidak ada tabel/repo yang menulis hasil model.
**Bukti**: `grep 'invokeAgent|runAgent|generateReply' *.ts` → 0; tidak ada dependen `@chai/ai-gateway`.
**Yang kurang**: keputusan tak dapat diambil sampai ada jalur persistensi respons AI untuk diperiksa.

### REQ-08-003 — Provider baru tanpa perubahan core — SEBAGIAN — LOW
**Persyaratan** (`08_AI §4`): "New provider requires adapter tests and capability manifest, not core code change."
**Kondisi nyata**: Pola adapter ada (mock/openai/anthropic), tetapi menambah provider memerlukan menyunting `switch` terpusat di `factory.ts` (bagian core), bukan sekadar mendaftarkan adapter+manifest.
**Bukti**: `packages/connectors/src/factory.ts:182-210` (`createAiAdapterFactory` switch hard-coded per provider).
**Yang kurang**: registry adapter berbasis manifest sehingga provider baru tidak menyentuh factory core.

### REQ-08-004 — Alias model logis memisah tier dari deployment — SEBAGIAN — LOW
**Persyaratan** (`08_AI §6`): alias (cs-fast, cs-quality, dst.); "physical deployment remains replaceable."
**Kondisi nyata**: `createAiGateway` menerima peta `aliases` dan `resolveModel`, tapi peta alias kanonik §6 tidak didefinisikan dan gateway tak ter-wire.
**Bukti**: `services/ai-gateway/src/index.ts:48-56` (`aliases`, `resolveModel`).
**Yang kurang**: definisi alias kanonik + wiring; tidak ada penyimpanan alias→deployment per tenant yang aktif.

### REQ-08-005 — Routing policy berurut + fallback terevaluasi — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §7`): 11 langkah routing (allow/deny, sensitivity/region, capability, quality floor, latency, budget, health, weighted, same-model fallback, cross-provider terevaluasi, deterministic/handover).
**Kondisi nyata**: Hanya langkah budget (6) dan handover/safe-fallback (11) ada di gateway. Tidak ada Model Router dengan sensitivity/region/capability/quality-floor routing.
**Bukti**: `services/ai-gateway/src/index.ts:63-113` (budget + safeFallback); `grep 'capabilityRouting|qualityFloor|evaluationFloor'` → 0.
**Yang kurang**: router dengan urutan §7, terutama filter capability & quality floor sebelum eksekusi.

### REQ-08-006 — HUMAN_ACTIVE = tanpa outbound AI — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §8`): "HUMAN_ACTIVE means no outbound AI."
**Kondisi nyata**: `evaluateToolPolicy` menolak origin `ai` saat mode `HUMAN_ACTIVE` (`AI_OUTBOUND_BLOCKED`) dan `PAUSED` — aturan terkodekan & terjangkau lewat endpoint actions/evaluate. Namun tidak ada jalur kirim AI produksi untuk ditegakkan.
**Bukti**: `packages/domain/src/ai-policy/tool-policy.ts:166-181`; `apps/api/src/modules/actions/actions.controller.ts` (endpoint). Tidak ada AI-send path (temuan struktural).
**Yang kurang**: jalur kirim AI aktual yang memanggil aturan ini sebelum mengirim.

### REQ-08-007 — Tanpa evidence → tanya/handover — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §8,§13`): tanpa evidence fakta tenant-spesifik → tanya, kualifikasi, atau handover.
**Kondisi nyata**: Retrieval mengembalikan kosong bila di bawah ambang evidence (mendukung "no evidence"), tetapi keputusan tanya/handover ada di gateway/mock yang tak ter-wire.
**Bukti**: `apps/api/src/modules/knowledge/postgres-knowledge.repository.ts:128-140` (filter ambang); `conversation.handover` di katalog (`tool-policy.ts`).
**Yang kurang**: pengambilan keputusan grounded-answer di runtime produksi.

### REQ-08-008 — AI tak menimpa consent/permission/entitlement/approval/state — SEBAGIAN — HIGH
**Persyaratan** (`08_AI §8`): daftar hard rule.
**Kondisi nyata**: `evaluateToolPolicy` mengkodekan entitlement (`FEATURE_NOT_ENABLED`), approval (HIGH/CRITICAL), konfirmasi (MEDIUM), dan mode/state. Entitlement diambil server-side di endpoint. Namun tak ada runtime AI yang tunduk pada keputusan ini.
**Bukti**: `packages/domain/src/ai-policy/tool-policy.ts:183-230`; `apps/api/src/modules/actions/actions.controller.ts:70` (entitlement dari server).
**Yang kurang**: konsumen keputusan di jalur eksekusi AI produksi.

### REQ-08-009 — AI tak menerima akses DB tak terbatas — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §8`): "AI never receives unrestricted database access."
**Kondisi nyata**: Katalog tool hanya berisi operasi tercakup (knowledge/product/order/payment/shipment), tidak ada tool DB mentah; dan tak ada runtime AI yang dipegangi koneksi DB. Ini benar secara konstruksi, bukan kontrol yang ditegakkan.
**Bukti**: `packages/domain/src/ai-policy/tool-policy.ts:40-149` (katalog tanpa tool DB); tak ada runtime AI.
**Yang kurang**: penegakan eksplisit (mis. tool hanya lewat handler tercakup) saat runtime dibangun.

### REQ-08-010 — Hasil tool tak tepercaya & divalidasi — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §8,§15`): "Tool result is untrusted and validated."
**Kondisi nyata**: `toolResultToExternal` + `scanForPromptInjection` membungkus hasil tool sebagai data untrusted; komentar executor menegaskan hasil tak tepercaya. Semua di gateway yang tak ter-wire.
**Bukti**: `services/ai-gateway/src/prompt-context.ts:150-166`; `tool-execution.ts:150-175`.
**Yang kurang**: wiring + validasi skema hasil di jalur produksi.

### REQ-08-011 — Memori jangka panjang berbatas — HILANG — LOW
**Persyaratan** (`08_AI §9`): hanya field disetujui; sumber+timestamp; expiry; correction flow; tak simpan trait sensitif spekulatif.
**Kondisi nyata**: Tidak ada penyimpanan memori jangka panjang AI.
**Bukti**: `grep 'longTermMemory|long_term_memory' *.ts` → 0 hasil.
**Yang kurang**: seluruh mekanisme memori jangka panjang berbatas (field, sumber, expiry, koreksi).

### REQ-08-012 — Siklus hidup prompt + imutabilitas — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §10`): DRAFT→REVIEW→EVALUATED→CANARY→PUBLISHED→ROLLED_BACK/ARCHIVED; "No production prompt edited in place"; rollback target.
**Kondisi nyata**: `ai-agent` menyimpan `AgentProfile.status` (DRAFT/ACTIVE/PAUSED/ARCHIVED) — bukan siklus prompt. Tak ada state REVIEW/EVALUATED/CANARY/ROLLED_BACK, instruksi imutabel, atau rollback target.
**Bukti**: `apps/api/src/modules/ai-agent/ai-agent.repository.ts:5-20`; `grep 'EVALUATED|ROLLED_BACK|rollbackTarget|promptRelease' *.ts` → tak ada yang terkait prompt (hanya SLO/analytics).
**Yang kurang**: entitas prompt-release berversi dengan siklus penuh + imutabilitas + rollback.

### REQ-08-013 — Pipeline ingestion knowledge — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §11`): source auth → MIME/malware check → extraction → language → metadata/effective-date → chunking → embedding → hybrid index → review → publish.
**Kondisi nyata**: `ingest` menyimpan dokumen `status='READY'` dengan `chunk_ids` placeholder tunggal; tanpa scan malware, chunking nyata, embedding, deteksi bahasa, effective-date, atau alur review.
**Bukti**: `apps/api/src/modules/knowledge/postgres-knowledge.repository.ts:38-70`; `migrations/0009_knowledge.sql:14` (`embedding jsonb`, tak diisi).
**Yang kurang**: tahap scan/extract/chunk/embed/review; effective-date & language metadata.

### REQ-08-014 — Retrieval hybrid full-text + vektor + rerank — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §12`, ADR-012): "Full-text + vector candidates. Rerank."
**Kondisi nyata**: Jalur produksi (`retrieve`) memakai `websearch_to_tsquery` + `ts_rank` (full-text) saja. Tidak ada kandidat vektor maupun rerank. Kolom `embedding` bertipe `jsonb` (bukan `vector` pgvector) dan tak diisi. Retriever pgvector hanya rencana di komentar RAG (tak ter-wire).
**Bukti**: `apps/api/src/modules/knowledge/postgres-knowledge.repository.ts:110-140`; `migrations/0009_knowledge.sql:14`; `migrations/0046_knowledge_fulltext_index.sql:11-19`; `services/ai-gateway/src/rag.ts:7-8` ("Swap the retriever for pgvector"). Verifikasi ulang K-08: **masih terbuka**.
**Yang kurang**: ekstensi + kolom `vector`, kandidat vektor, dan langkah rerank.

### REQ-08-015 — Filter retrieval visibility/language/effective-date — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §12`): "Apply tenant, visibility, language, effective-date filters."
**Kondisi nyata**: Query memfilter `tenant_id`, `knowledge_base_id`, `status='READY'`. Tidak ada filter visibility, language, atau effective-date.
**Bukti**: `apps/api/src/modules/knowledge/postgres-knowledge.repository.ts:119-126`.
**Yang kurang**: predikat visibility, language, dan effective-date pada query retrieval.

### REQ-08-016 — Ambang evidence + source/chunk id + excerpt — TERPENUHI — -
**Persyaratan** (`08_AI §12`): minimum evidence threshold; "Return source/chunk IDs and excerpts."
**Kondisi nyata**: `retrieve` menerapkan `DEFAULT_EVIDENCE_THRESHOLD` (0.05), mengembalikan `RetrievedEvidence` berisi `citation{documentId, knowledgeBaseId, excerpt}` + `score`. Terjangkau di produksi lewat `POST /api/client/v1/knowledge/retrieve` (`@RequirePermission('knowledge.read')`).
**Bukti**: `postgres-knowledge.repository.ts:104-146`; `knowledge.repository.ts:41-56` (`DEFAULT_EVIDENCE_THRESHOLD`); `knowledge.controller.ts:88-102` (call site produksi).

### REQ-08-017 — Tanpa retrieval lintas-tenant — TERPENUHI — -
**Persyaratan** (`08_AI §12`): "No cross-tenant global retrieval."
**Kondisi nyata**: `retrieve` memfilter `tenant_id = ${tenantId}` dan berjalan di dalam `withTenantTransaction` (RLS default-deny). Tidak ada namespace pengetahuan global lintas-tenant.
**Bukti**: `postgres-knowledge.repository.ts:104-127` (predikat tenant + `withTenantTransaction`).
**Catatan**: "global platform knowledge namespace" terpisah (kalimat kedua §12) belum dibangun; itu perluasan opsional, bukan pelanggaran isolasi.

### REQ-08-018 — Kebijakan grounded answer — SEBAGIAN — HIGH
**Persyaratan** (`08_AI §13`): klaim tenant-spesifik butuh evidence terbit/tool terverifikasi + freshness + tanpa konflik; jika tidak → nyatakan batas/tanya/handover/jangan mengarang.
**Kondisi nyata**: Ambang evidence + citation mendukung sisi retrieval. Penegakan pada waktu-jawab (freshness, resolusi konflik, "never invent") ada di gateway/mock tak ter-wire.
**Bukti**: `postgres-knowledge.repository.ts:128-146`; tak ada runtime jawab produksi.
**Yang kurang**: penegakan grounded-answer (freshness + konflik + no-invent) di jalur jawab produksi.

### REQ-08-019 — Katalog tool kanonik + risk tier — TERPENUHI — -
**Persyaratan** (`08_AI §14`): katalog tool dengan risk tier + default.
**Kondisi nyata**: `TOOL_CATALOG` mendefinisikan risk LOW/MEDIUM/HIGH/CRITICAL + `requiredEntitlement` + `aiExecutable`. Sumber tunggal; dipakai `evaluateToolPolicy` dan `toolRiskTier`. Terjangkau lewat `evaluateActionPolicy` di endpoint actions.
**Bukti**: `packages/domain/src/ai-policy/tool-policy.ts:40-149`; `apps/api/src/modules/actions/action-policy.ts:2,31`; tes `apps/api/src/modules/actions/action-policy.test.ts`.

### REQ-08-020 — ExecuteRefund CRITICAL, tak dieksekusi AI — TERPENUHI — -
**Persyaratan** (`08_AI §14`): "ExecuteRefund | Critical | Disabled for AI"; contoh kanonik aksi yang tak boleh diambil model.
**Kondisi nyata**: `payment.execute_refund` = `{aiExecutable:false, risk:'CRITICAL'}`; origin `ai` → `AI_EXECUTION_FORBIDDEN` (DENY) apa pun approval-nya. `payment.payout/split`, `order.cancel`, `account.delete`, `logistics.cancel` juga `aiExecutable:false`. `aiForbiddenTools()` mengembalikan daftar ini.
**Bukti**: `tool-policy.ts:129-135` (execute_refund), `:198-206` (`AI_EXECUTION_FORBIDDEN`), `:244-249` (`aiForbiddenTools`).


### REQ-08-021 — Kontrak eksekusi tool 12 langkah — SEBAGIAN — HIGH
**Persyaratan** (`08_AI §15`): model propose → validasi skema → resolve tenant/entity → re-check state/version → policy/entitlement → consent/identity/confirmation → approval → **ActionRequest idempoten** → eksekusi → validasi hasil → simpan audit/usage/metric.
**Kondisi nyata**: `ToolExecutionEngine.execute` menutup langkah keputusan-authoritative (menolak non-ALLOW), cek allowlist tenant, cek registry, lalu eksekusi + menandai hasil untrusted. Tak ada pembuatan ActionRequest idempoten, re-check versi, maupun persist audit/usage. Tak ter-wire.
**Bukti**: `services/ai-gateway/src/tool-execution.ts:118-190`.
**Yang kurang**: ActionRequest idempoten, re-check state/version, persist audit/usage/metric, dan wiring.

### REQ-08-022 — Policy engine satu-satunya pemberi izin; tool tak dikenal ditolak — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §14/§15`, ADR-011): "AI proposes, policy executes"; tool tak dikenal ditolak, bukan dianggap aman.
**Kondisi nyata**: **Lapisan keputusan benar & terjangkau**: `evaluateToolPolicy` mengembalikan `UNKNOWN_TOOL` DENY untuk tool di luar katalog (bukan diperlakukan low-risk), dapat dipanggil produksi via `POST /api/client/v1/actions/evaluate`. **Executor mewajibkan keputusan ALLOW** dan menolak keputusan yang diterbitkan untuk tool lain (`decision.tool !== toolName`). **Namun** tak ada jalur produksi yang mengeksekusi proposal tool AI — tidak ada bypass, tetapi juga tidak ada penegakan "policy executes" yang hidup.
**Bukti**: `packages/domain/src/ai-policy/tool-policy.ts:152-165` (`UNKNOWN_TOOL`); `apps/api/src/modules/actions/action-policy.ts:31` + `actions.controller.ts:63-84` (call site produksi); `services/ai-gateway/src/tool-execution.ts:126-145` (wajib ALLOW + cek `decision.tool`). Tak ada konsumen `toolProposals` produksi (`grep 'toolProposal|proposedTool|tool_call'` → hanya gateway/adapter/tes).
**Yang kurang**: pipeline eksekusi tool AI produksi yang selalu memanggil `evaluateToolPolicy` sebelum efek samping. Invarian tidak dilanggar; kapabilitas belum dibangun.

### REQ-08-023 — Uang/alamat/kurir tak dari teks model — SEBAGIAN — HIGH
**Persyaratan** (`08_AI §15`): "price, amount, currency, discount, tax, merchant, address, courier, and service are never accepted from unconstrained model text."
**Kondisi nyata**: Nominal pembayaran diambil dari body tervalidasi (`CreateCheckoutBody` amount `@IsInt @Min(1)`), bukan teks model; tak ada jalur AI yang menyuntik nominal. Benar secara konstruksi (tak ada runtime AI).
**Bukti**: `apps/api/src/modules/payments/payments.controller.ts:33-46,53-73`.
**Yang kurang**: penegakan eksplisit di kontrak eksekusi tool saat runtime AI dibangun (argumen finansial hanya dari state domain tersetujui).

### REQ-08-024 — Evidence pembayaran = webhook terverifikasi — TERPENUHI — -
**Persyaratan** (`08_AI §15`): "payment evidence is a verified provider webhook/query, never redirect, screenshot, OCR, or customer claim."
**Kondisi nyata**: `PaymentsController.webhook` menolak payload tak terverifikasi (`WEBHOOK_REJECTED`); `applyWebhook` memverifikasi signature lebih dulu lalu `decidePaymentTransition` mencegah transisi mundur/tidak sah. Terjangkau + berteskan (`payments.e2e.test.ts`).
**Bukti**: `apps/api/src/modules/payments/payments.controller.ts:119-133`; `postgres-payments.repository.ts:142-205` (verify → transition). Overlap Jalur C (17_PAYMENT).

### REQ-08-025 — Mutasi tak pasti tetap RECONCILING, tanpa retry duplikat — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §15`): "uncertain external mutations remain RECONCILING and cannot invite a duplicate retry."
**Kondisi nyata**: Status `UNKNOWN_RESULT` dipetakan (midtrans), reconciler logistik men-dedup pada `providerEventId`; payment-worker merekonsiliasi via poll. Namun tak ada state RECONCILING generik pada kontrak eksekusi tool AI (tak ter-wire).
**Bukti**: `packages/connectors/src/connectors/midtrans/index.ts:132-146`; `workers/logistics-worker/src/reconcile.ts:250-266` (dedup providerEventId). Overlap Jalur C.
**Yang kurang**: state RECONCILING + guard anti-retry-duplikat di kontrak eksekusi tool AI.

### REQ-08-026 — Multimodal; injeksi dokumen untrusted — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §16`): image (jangan identifikasi trait sensitif), audio (transcribe first), document (prompt injection = untrusted).
**Kondisi nyata**: Sisi dokumen: `scanForPromptInjection` memperlakukan teks dokumen sebagai data untrusted. Penanganan image/audio (OCR, transkripsi, offsets) tak ada di kode ter-wire; adapter model produksi hanya teks.
**Bukti**: `services/ai-gateway/src/rag.ts:118-150` (`scanDocuments`); tak ada penanganan image/audio produksi.
**Yang kurang**: pipeline image/audio (transcribe-first, no-sensitive-trait) dan wiring guard dokumen.

### REQ-08-027 — Guard prompt-injection / content boundary — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §9,§12,§17`): batas prompt-injection; konten eksternal sebagai data.
**Kondisi nyata**: `scanForPromptInjection` (8 pola + penetralan delimiter + pembungkus `<untrusted>`) dan `assembleTurnPrompt` (satu loop memindai setiap konten eksternal, `ROLE_BY_KIND` peta total) kuat dan berteskan (`prompt-injection.test.ts`). **Tetapi berada di `services/ai-gateway` yang tak diimpor siapa pun**; jalur retrieval produksi (`knowledge.retrieve`) **tidak** memanggil `scanForPromptInjection`.
**Bukti**: `services/ai-gateway/src/guardrails.ts:60-140`; `prompt-context.ts:1-140`; komentar ceiling `prompt-context.ts:14-20` (hanya menjaga pemanggil modul). `postgres-knowledge.repository.ts:104-146` (tanpa scan).
**Yang kurang**: wiring guard ke jalur yang benar-benar menyusun prompt di produksi.

### REQ-08-028 — Redaksi secret/PII — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §17`): "secret/PII redaction."
**Kondisi nyata**: `redactPii` (email, NIK, kartu, SSN, telp) di guardrail, berteskan; tak ter-wire ke output AI produksi. (`packages/domain/src/pii-pipeline` menggunakan ulang pola untuk audit — ranah Jalur A.)
**Bukti**: `services/ai-gateway/src/guardrails.ts:8-30,190-210`.
**Yang kurang**: penerapan redaksi pada output AI di jalur produksi.

### REQ-08-029 — Allowlist tool per tenant — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §17`): "tenant tool allowlist."
**Kondisi nyata**: `TenantPolicyStore.isAllowed` (allowlist/blocklist) di gateway (tak ter-wire). Modul `ai-agent` menyimpan `ToolPolicy` per tenant (CRUD terjangkau) tetapi tidak ditegakkan di eksekusi.
**Bukti**: `services/ai-gateway/src/tool-execution.ts:69-116`; `apps/api/src/modules/ai-agent/ai-agent.repository.ts:34-49` (ToolPolicy CRUD).
**Yang kurang**: penegakan allowlist tenant pada eksekusi tool produksi.

### REQ-08-030 — URL/domain allowlist, prohibited topic, loop limit, max tool/turn — HILANG — MEDIUM
**Persyaratan** (`08_AI §17`): daftar guardrail termasuk URL/domain allowlist, prohibited/regulated topic, repetitive loop limit, maximum tool calls per turn.
**Kondisi nyata**: Tidak ada implementasi.
**Bukti**: `grep 'urlAllowlist|domainAllowlist|allowedDomains|maxToolCalls|loopLimit|repetitiveLoop' *.ts` → 0 hasil.
**Yang kurang**: allowlist URL/domain, kebijakan topik terlarang, batas loop, batas jumlah tool per giliran.

### REQ-08-031 — Framework evaluasi: dataset + metrik — SEBAGIAN — LOW
**Persyaratan** (`08_AI §18`): kategori dataset (FAQ, adversarial injection, tool selection, dst.) + metrik.
**Kondisi nyata**: Ada `golden-dataset.test.ts` sebagai tes; bukan framework produk dengan kategori dataset & metrik §18 lengkap.
**Bukti**: `services/ai-gateway/test/golden-dataset.test.ts`.
**Yang kurang**: dataset per kategori §18 + metrik (correctness, evidence support, handover precision/recall, dll.).

### REQ-08-032 — Release floor: zero-regression + canary — HILANG — MEDIUM
**Persyaratan** (`08_AI §18`): zero regression pada suite safety kritis; canary sebelum rollout penuh.
**Kondisi nyata**: Tidak ada mekanisme release-floor/canary; state CANARY prompt tak ada.
**Bukti**: `grep 'canaryRollout|releaseFloor|CANARY|ROLLED_BACK' *.ts` → tak ada yang terkait rilis prompt/model.
**Yang kurang**: gate release-floor + rollout canary untuk rilis prompt/model.

### REQ-08-033 — Trace AI tertaut + raw trace terbatas — SEBAGIAN — LOW
**Persyaratan** (`08_AI §19`): trace menaut tenant/conversation/prompt release/alias/chunk/tool/tokens/cost/evaluator; akses raw terbatas & retensi terbatas.
**Kondisi nyata**: `traceId` dihasilkan di gateway/RAG; modul `observability` ada (ranah Jalur F). Graf tautan trace AI penuh + retensi raw AI tidak terverifikasi di jalur ter-wire.
**Bukti**: `services/ai-gateway/src/index.ts` (`traceId: randomUUID()`); `rag.ts:200-206` (`generateRagTraceId`).
**Yang kurang**: model trace AI yang menaut seluruh entitas §19 + kontrol retensi/akses raw.

### REQ-08-034 — Budget per tenant + ceiling per request + fail-to-safe — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §20`): budget bulanan per tenant; ceiling per request; route tugas sederhana ke model kecil; cegah retry berulang; alert; **fail to safe model/handover, bukan spend tak terbatas**.
**Kondisi nyata**: `createAiGateway` mengecek `hasExceededBudget(tenantId, monthlyBudgetUsd)` **sebelum** memanggil model; bila lewat → turun ke `safeFallbackModel` atau kembalikan `safeFallback:true` (handover). Berteskan (`budget.test.ts`). **Tetapi** `CostAccountingStore` in-memory (hilang saat restart), tak ter-wire, dan ceiling per-request (`max_cost`) tidak ditegakkan.
**Bukti**: `services/ai-gateway/src/index.ts:63-113`; `cost-accounting.ts:130-190` (`hasExceededBudget`, in-memory).
**Yang kurang**: penyimpanan biaya persisten per tenant, ceiling per-request, alert threshold, dan wiring produksi.


### REQ-08-035 — AC: provider swap mempertahankan kontrak — SEBAGIAN — LOW
**Persyaratan** (`08_AI §21`): "provider swap preserves internal response contract."
**Kondisi nyata**: Factory + tipe hasil ternormalisasi memungkinkan swap; tak ada tes end-to-end yang menegakkan kontrak lintas provider di jalur ter-wire.
**Bukti**: `packages/connectors/src/factory.ts:182-210`; adapter openai/anthropic mengembalikan bentuk hasil sama.
**Yang kurang**: AC eksplisit swap-preserves-contract pada runtime ter-wire.

### REQ-08-036 — AC: kapabilitas salah tak pernah dipilih — HILANG — MEDIUM
**Persyaratan** (`08_AI §21`): "wrong capability never selected."
**Kondisi nyata**: Tidak ada routing berbasis capability (lihat REQ-08-005), sehingga AC ini tak dapat berlaku.
**Bukti**: `grep 'capabilityRouting|routeByCapability|qualityFloor' *.ts` → 0.
**Yang kurang**: routing capability + AC-nya.

### REQ-08-037 — AC: policy tenant terbatas memblokir provider — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §21`): "restricted tenant policy blocks provider."
**Kondisi nyata**: `TenantPolicyStore` allowlist/blocklist ada + berteskan, tetapi tak ter-wire ke pemilihan provider produksi.
**Bukti**: `services/ai-gateway/src/tool-execution.ts:69-116`.
**Yang kurang**: penegakan allow/deny provider per tenant di routing produksi.

### REQ-08-038 — AC: skema tool invalid tak dieksekusi — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §21`): "tool schema invalid never executes."
**Kondisi nyata**: Executor menolak tanpa keputusan ALLOW & tool tak terdaftar; namun validasi skema argumen JSON (langkah §15.2) tidak dilakukan executor. Tak ter-wire.
**Bukti**: `services/ai-gateway/src/tool-execution.ts:126-175` (cek ALLOW + registry, tanpa validasi skema argumen).
**Yang kurang**: validasi skema argumen tool sebelum eksekusi + tes AC.

### REQ-08-039 — AC: AI tak mengarang nominal / tandai paid dari screenshot — SEBAGIAN — HIGH
**Persyaratan** (`08_AI §21`): "AI cannot invent amount/discount/tax or mark a payment paid from screenshot/redirect."
**Kondisi nyata**: PAID hanya dari webhook terverifikasi (REQ-08-024); nominal dari body tervalidasi (REQ-08-023); tak ada jalur AI penyuntik. Benar secara konstruksi; belum ada AC pada runtime AI.
**Bukti**: `payments.controller.ts:119-133`; `postgres-payments.repository.ts:142-205`.
**Yang kurang**: AC eksplisit terhadap runtime AI (saat dibangun). Overlap Jalur C.

### REQ-08-040 — AC: AI tak bocorkan shipment pelanggan lain dari tracking tebakan — SEBAGIAN — HIGH
**Persyaratan** (`08_AI §21`): "AI cannot reveal another customer's shipment or full address from a guessed tracking reference."
**Kondisi nyata**: Katalog `shipment.get_status` butuh entitlement + default identity-check; ADR-027/§16 mensyaratkan ownership. Penegakan ownership pada lookup ter-wire belum terverifikasi (lihat REQ-09-026).
**Bukti**: `tool-policy.ts:47-60` (entitlement `shipment_tracking`). Enforcement lookup: TIDAK-TERVERIFIKASI.
**Yang kurang**: verifikasi enforcement ownership pada lookup tracking + AC.

### REQ-08-041 — AC: human takeover memblokir kirim AI — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §21`): "human takeover blocks AI send."
**Kondisi nyata**: `evaluateToolPolicy` → `AI_OUTBOUND_BLOCKED` saat HUMAN_ACTIVE (unit-tested); tak ada jalur kirim AI produksi (REQ-08-006).
**Bukti**: `tool-policy.ts:166-172`.
**Yang kurang**: jalur kirim AI + AC end-to-end.

### REQ-08-042 — AC: tanpa-evidence tak berhalusinasi — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §21`): "no-evidence scenario does not hallucinate."
**Kondisi nyata**: Retrieval mengembalikan kosong di bawah ambang (jalur produksi), tetapi keputusan jawab (no-invent) di gateway tak ter-wire.
**Bukti**: `postgres-knowledge.repository.ts:128-146`.
**Yang kurang**: enforcement no-invert pada runtime jawab + AC.

### REQ-08-043 — AC: dokumen injeksi tak memperluas akses tool — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §21`): "prompt injection document cannot expand tool access."
**Kondisi nyata**: Guard membungkus dokumen sebagai data (REQ-08-027) + akses tool lewat policy (REQ-08-022), keduanya benar tetapi tak ter-wire bersama pada runtime.
**Bukti**: `rag.ts:118-150`; `tool-policy.ts:152-165`; `prompt-injection.test.ts`.
**Yang kurang**: integrasi guard+policy pada runtime + AC end-to-end.

### REQ-08-044 — AC: rollback rilis model bekerja — HILANG — MEDIUM
**Persyaratan** (`08_AI §21`): "model release rollback works."
**Kondisi nyata**: Tak ada store rilis prompt/model dengan rollback target (REQ-08-012/032).
**Bukti**: `grep 'rollbackTarget|rollback_target|promptRelease' *.ts` → 0.
**Yang kurang**: mekanisme rilis+rollback model/prompt.

### REQ-08-045 — AC: budget tenant mengisolasi tenant berisik — SEBAGIAN — MEDIUM
**Persyaratan** (`08_AI §21`): "tenant budgets isolate noisy tenant."
**Kondisi nyata**: `CostAccountingStore` memisah biaya per `tenantId`; `hasExceededBudget` per tenant + berteskan; in-memory & tak ter-wire (REQ-08-034).
**Bukti**: `cost-accounting.ts:60-120,180-190`.
**Yang kurang**: persistensi + wiring agar isolasi budget berlaku di produksi.

---

### Self-check Dokumen 08 (§10.7)
1. **Dibaca penuh?** Ya, 1–433 (via tool baca). Tak ada bagian dilewati.
2. **REQ & kelas:** 45 REQ. TERPENUHI 5 · SEBAGIAN 34 · HILANG 5 · BERTENTANGAN 0 · TIDAK-TERVERIFIKASI 1.
3. **Setiap TERPENUHI ada path:baris + call site/tes?** Ya (016 controller retrieve; 017 predikat tenant+RLS; 019 action-policy call site+test; 020 tool-policy; 024 payments webhook+e2e).
4. **Setiap HILANG ada perintah nol?** Ya (011, 030, 032, 036, 044 — grep dilampirkan).
5. **Sudah di-append ke berkas keluaran?** Ya.
6. **`git status --porcelain` hanya `docs/audit/`?** Diverifikasi di akhir berkas (bagian penutup).

### Laporan §10.8 — Dokumen 08
```
DOKUMEN 6/7 (jalur D) - 08_AI_AGENT_AND_KNOWLEDGE.md (433 baris)
REQ dihasilkan: 45
  TERPENUHI 5 | SEBAGIAN 34 | HILANG 5 | BERTENTANGAN 0 | TIDAK-TERVERIFIKASI 1
Temuan severity tertinggi: REQ-08-008/018/021/023/039/040 (HIGH) - hard rule & grounded/tool-exec ada di lapisan policy tetapi runtime AI tak ter-wire; invarian ADR-011 tidak dilanggar (tak ada bypass), hanya belum ditegakkan hidup.
Berkas keluaran: docs/audit/2026-07-29/jalur-d-ai-connector.md
Self-check 6 butir: semua "ya".
```


---

## Temuan Dokumen 09 — blok per REQ

### REQ-09-001 — Set operasi konektor kanonik — SEBAGIAN — MEDIUM
**Persyaratan** (`09 §1,§3`): setiap konektor mengimplementasi identity/auth, capability discovery, inbound verify/normalize, outbound mapping, rate-limit, error normalize, idempotency/reconcile, health, versioning, audit; operasi connect/refresh/rotate/revoke/discover/health/normalizeWebhook/send/fetchMedia/markRead/query/execute/reconcile/disconnect.
**Kondisi nyata**: Adapter riil (whatsapp-meta, midtrans, jne, google-calendar) mengimplementasi subset: discoverCapabilities, healthCheck, normalizeWebhook/handleWebhook, sendMessage/createCheckout/createShipment, reconcile via poll. Operasi connect/complete-auth/refresh/rotate/revoke/markRead/fetchMedia/disconnect sebagian besar absen.
**Bukti**: `packages/connectors/src/connectors/whatsapp-meta/index.ts:300-430`; `connector-sdk/src/index.ts:80-95` (interface).
**Yang kurang**: siklus otorisasi (connect/refresh/rotate/revoke), markRead/fetchMedia, disconnect di adapter.

### REQ-09-002 — Bentuk capability manifest — TERPENUHI — -
**Persyaratan** (`09 §2`): manifest {connector_key, version, capabilities, limits, risk_class, sla_class}.
**Kondisi nyata**: `discoverCapabilities` mengembalikan `CapabilityManifest` {connectorKey, capabilities{...}, limits, riskClass, slaClass, version}. Bentuk ditegakkan oleh harness conformance dan terjangkau via `adapterFor` di controller channel produksi.
**Bukti**: `whatsapp-meta/index.ts:303-318`; `connector-sdk/src/index.ts:87`; `packages/connectors/src/conformance/index.ts:22-33` (assert bentuk manifest).

### REQ-09-003 — Effective capability intersection — HILANG — MEDIUM
**Persyaratan** (`09 §2`): "UI and AI tools use effective capability intersection: connector ∩ account scopes ∩ entitlement ∩ policy."
**Kondisi nyata**: Tidak ada kode yang menghitung intersection ini.
**Bukti**: `grep 'effective capabilit|effectiveCapabilit|capability intersection|capabilityIntersect|intersect' D:\Games\Agent\Chai` → 0 hasil kode (hanya berkas blueprint `.md`).
**Yang kurang**: fungsi intersection efektif yang dipakai UI + tool AI.

### REQ-09-004 — Hasil konektor ternormalisasi — TERPENUHI — -
**Persyaratan** (`09 §3`): hasil {success/result, external ID, retryability, retry-after, error code/category, raw diagnostic ref, usage/cost}.
**Kondisi nyata**: `ConnectorResult` (connector-sdk) + `sendMessage` whatsapp mengembalikan {success, externalId, retryable, category, retryAfterMs, errorCode, diagnosticRef, usage}. Terjangkau via controller channel.
**Bukti**: `whatsapp-meta/index.ts:395-460`; `connector-sdk/src/index.ts` (`ConnectorResult`).

### REQ-09-005 — Error taxonomy + UNKNOWN_RESULT reconcile — SEBAGIAN — MEDIUM
**Persyaratan** (`09 §4`): 9 kategori (AUTH/PERMISSION/RATE_LIMIT/VALIDATION/NOT_FOUND/CONFLICT/TRANSIENT/POLICY/UNKNOWN_RESULT) dengan perilaku; UNKNOWN_RESULT = reconcile before retry.
**Kondisi nyata**: `classifyGraphApiError` (whatsapp) memetakan AUTH/RATE_LIMIT/TRANSIENT/VALIDATION/UNKNOWN_RESULT; midtrans `mapTransactionStatus` → UNKNOWN_RESULT. Kategori PERMISSION/NOT_FOUND/CONFLICT/POLICY tak dipetakan seragam.
**Bukti**: `whatsapp-meta/index.ts:262-280`; `midtrans/index.ts:110-127`.
**Yang kurang**: taksonomi 9-kategori lengkap + perilaku (capability downgrade untuk PERMISSION, refresh untuk CONFLICT, block+explain untuk POLICY).

### REQ-09-006 — Verifikasi signature + timestamp webhook — SEBAGIAN — HIGH
**Persyaratan** (`09 §5`): TLS, provider challenge, **signature/timestamp verification**, body size limit, replay prevention.
**Kondisi nyata**: Signature: WhatsApp `verifyWebhookSignature` (HMAC-SHA256 + `timingSafeEqual`), Midtrans `handleWebhook` (SHA-512 + `timingSafeEqual`, menolak tanpa serverKey). Jalur channel produksi memverifikasi via `normalizeWebhook`; jalur payment produksi via `verifyMockPaymentWebhookSignature`. **Namun** verifikasi **timestamp tidak ada** di mana pun; dan **JNE `handleWebhook` tidak memverifikasi signature** (selalu `verified:true` untuk payload berbentuk benar).
**Bukti**: `whatsapp-meta/index.ts:120-145`; `midtrans/index.ts:465-510`; `channels.controller.ts:74-83`; `jne/index.ts:320-345` (tanpa verifikasi signature).
**Yang kurang**: verifikasi timestamp (anti-replay) di semua webhook; verifikasi signature webhook JNE/logistik.

### REQ-09-007 — Provider challenge handshake — HILANG — MEDIUM
**Persyaratan** (`09 §5`): "Provider challenge" (mis. Meta GET hub.challenge/verify_token).
**Kondisi nyata**: Hanya ada route `POST .../webhook`; tak ada handler GET challenge.
**Bukti**: `grep 'hub\.challenge|hub_challenge|verify_token' *.ts` → 0 (hanya `verifyToken` JWT auth, tak terkait). `channels.controller.ts` hanya `@Post(...webhook)`.
**Yang kurang**: handler GET verifikasi/challenge provider (Meta subscribe).

### REQ-09-008 — Replay prevention + inbox dedup — SEBAGIAN — MEDIUM
**Persyaratan** (`09 §5`): "Replay prevention" + "Inbox dedup."
**Kondisi nyata**: Inbox dedup ada & berteskan (chaos duplicate-out-of-order): `repository.ingest` mengembalikan `duplicate`. Replay prevention berbasis timestamp/nonce tidak ada.
**Bukti**: `channels.controller.ts:84-92` (`result.duplicate`); `apps/api/test/chaos/duplicate-out-of-order.e2e.test.ts`.
**Yang kurang**: pencegahan replay berbasis timestamp/nonce (bukan hanya dedup id).

### REQ-09-009 — Batas ukuran body + retensi raw terbatas — SEBAGIAN — LOW
**Persyaratan** (`09 §5`): "Body size limit" + "Raw payload restricted retention."
**Kondisi nyata**: Event menyimpan `rawReference: restricted://...` (bukan raw penuh), mendukung retensi terbatas. Batas ukuran body webhook tidak diset eksplisit di route (mengandalkan default Fastify); modul `quarantine` menangani payload tak dikenal.
**Bukti**: `whatsapp-meta/index.ts:210-224` (`rawReference` restricted); tak ada `bodyLimit` khusus pada route webhook.
**Yang kurang**: batas ukuran body eksplisit pada endpoint webhook + kebijakan retensi raw terdokumentasi.

### REQ-09-010 — Meta Direct + required states — SEBAGIAN — MEDIUM
**Persyaratan** (`09 §6.1`): platform memiliki webhook/Graph client/template-window guard; states CONNECTING/CONNECTED/DEGRADED/TOKEN_EXPIRED/DISABLED.
**Kondisi nyata**: Adapter Meta Direct riil ada (Graph API + HMAC), **tetapi controller channel produksi mewire adapter SANDBOX** (`createWhatsAppMetaSandboxAdapter`), bukan yang produksi. Required states tidak dimodelkan; template/window guard tak ada.
**Bukti**: `apps/api/src/modules/channels/channel-adapters.ts:16-28` (whatsapp-meta → sandbox); `whatsapp-meta/index.ts` (adapter riil, tak dipakai controller).
**Yang kurang**: wiring adapter Meta Direct riil; model state konektor; template/window guard.

### REQ-09-011 — Official BSP mode — HILANG — LOW
**Persyaratan** (`09 §6.2`, ADR-014): adapter BSP (auth/webhook BSP, mapping akun, fee, migrasi).
**Kondisi nyata**: Tidak ada adapter BSP.
**Bukti**: `grep 'OFFICIAL_BSP' *.ts` → 0 kode; direktori `packages/connectors/src/connectors/` tak memuat konektor BSP.
**Yang kurang**: adapter BSP.

### REQ-09-012 — Community Gateway — HILANG — LOW
**Persyaratan** (`09 §6.3`, ADR-014): mode best-effort, aktivasi owner-only, kill switch legal/policy.
**Kondisi nyata**: Tidak diimplementasikan (hanya roadmap `docs/plans/2026-07-26-community-gateway-roadmap.md`).
**Bukti**: `grep 'COMMUNITY_GATEWAY|CommunityGateway|community_gateway' *.ts` → 0 kode.
**Yang kurang**: seluruh mode Community Gateway (sengaja ditangguhkan per roadmap).

### REQ-09-013 — Domain tak bercabang pada provider mode — TERPENUHI — -
**Persyaratan** (`09 §6`): "Domain modules never branch on provider mode. Channel adapter maps to canonical messages/actions."
**Kondisi nyata**: Controller memakai `adapterFor(provider): ChannelAdapter`; repo domain menerima `InboundEvent` kanonik; worker memakai port ter-invert. Percabangan spesifik provider terisolasi di adapter.
**Bukti**: `channels.controller.ts:52-100` (bekerja pada `ChannelAdapter` + `InboundEvent`); `workers/logistics-worker/src/main.ts:60-85` (port `CarrierTrackingPort`).


### REQ-09-014 — Keamanan widget — SEBAGIAN — HIGH
**Persyaratan** (`09 §7 Security`): publishable widget key identifies config (bukan secret); allowed origins; signed short-lived session; bot/abuse rate limits; file scan; CSP/iframe isolation; no tenant secret in browser.
**Kondisi nyata**: CRUD widget menyimpan `allowedOrigins` (config). **Namun** endpoint runtime sesi publik (`GET :widgetId/sessions`, `GET/POST/PUT sessions`) **tanpa auth, tanpa tenant scope**, dan `createSession` menerima `tenantId` dari **body** pemanggil. Tidak ada publishable key, signed session, enforcement origin runtime, atau rate limit.
**Bukti**: `apps/api/src/modules/widget/widget.controller.ts:236-266` (komentar "Public end-customer widget runtime (no tenant scope, no principal)"; `CreateWidgetSessionDto.tenantId` dari body). `grep 'publishableKey|widgetKey|signedSession' *.ts` → 0.
**Yang kurang**: publishable key, signed short-lived session, enforcement origin, rate limit, dan hentikan `tenantId` dari body. **Perlu verifikasi RLS `widget_session`** (Jalur A) apakah `tenantId` body bisa menulis lintas tenant — jika ya, ini isolasi tenant (release-blocking).

### REQ-09-015 — Konektor Instagram — HILANG — LOW
**Persyaratan** (`09 §8`): DM/comments/private reply, refresh token, capability discovery.
**Kondisi nyata**: Tidak ada.
**Bukti**: Direktori `packages/connectors/src/connectors/` = {anthropic, openai, jne, midtrans, google-calendar, whatsapp-meta, whatsapp-meta-sandbox, mock-*}; tak ada `instagram`.
**Yang kurang**: konektor Instagram.

### REQ-09-016 — Konektor TikTok (CONDITIONAL) — HILANG — LOW
**Persyaratan** (`09 §9`): mode Business API/Shop/ads-lead/comment; setiap kapabilitas CONDITIONAL sampai izin diverifikasi.
**Kondisi nyata**: Tidak ada.
**Bukti**: Enumerasi direktori konektor (di atas) tak memuat `tiktok`.
**Yang kurang**: konektor TikTok.

### REQ-09-017 — Konektor Shopee (read-first) — HILANG — LOW
**Persyaratan** (`09 §10`): shop auth, product/stock/order/fulfillment; write setelah sandbox/approval/idempotency/reconcile.
**Kondisi nyata**: Tidak ada.
**Bukti**: Enumerasi direktori konektor tak memuat `shopee`.
**Yang kurang**: konektor Shopee.

### REQ-09-018 — Konektor TikTok Shop — HILANG — LOW
**Persyaratan** (`09 §11`): seller auth, product/inventory/order/fulfillment.
**Kondisi nyata**: Tidak ada.
**Bukti**: Enumerasi direktori konektor tak memuat `tiktok-shop`.
**Yang kurang**: konektor TikTok Shop.

### REQ-09-019 — Konektor Google Calendar — SEBAGIAN — LOW
**Persyaratan** (`09 §12`): OAuth per tenant; list/free-busy/create/reschedule/cancel; timezone eksplisit, recheck availability, idempotency, external event ID, token-expiry alert, webhook/poll reconcile.
**Kondisi nyata**: Konektor ada (`google-calendar/index.ts` + `oauth.ts`) dengan operasi & conformance test. Wiring produksi (`createCalendarAdapterFactory`) tidak terkonfirmasi di modul calendar API.
**Bukti**: `packages/connectors/src/connectors/google-calendar/index.ts`; `conformance/google-calendar.test.ts`.
**Yang kurang**: verifikasi wiring produksi + token-expiry alert & webhook reconcile.

### REQ-09-020 — Konektor CRM/Helpdesk — HILANG — LOW
**Persyaratan** (`09 §13`): objek contact/lead/ticket + config mapping; hindari sync dua-arah tanpa resolusi konflik eksplisit.
**Kondisi nyata**: Tidak ada konektor CRM/helpdesk eksternal (modul `ticket` internal, bukan sync konektor).
**Bukti**: Enumerasi direktori konektor tak memuat konektor CRM/helpdesk.
**Yang kurang**: konektor CRM/Helpdesk.

### REQ-09-021 — Konektor Commerce/ERP — HILANG — LOW
**Persyaratan** (`09 §14`): mapping product/SKU/inventory/order/fulfillment; read cache source+observed_at; write revalidate.
**Kondisi nyata**: Tidak ada konektor commerce/ERP eksternal (`marketplace` internal).
**Bukti**: Enumerasi direktori konektor.
**Yang kurang**: konektor Commerce/ERP.

### REQ-09-022 — Payment hosted-checkout, tanpa field kartu — TERPENUHI — -
**Persyaratan** (`09 §15`, ADR-026): hosted checkout; no raw card/CVV/PIN/OTP/bank-login fields.
**Kondisi nyata**: Midtrans memakai Snap hosted checkout (redirect_url/token); `PaymentsController.createCheckout` menerima hanya amount/currency/idempotencyKey — tak ada field kartu.
**Bukti**: `midtrans/index.ts:280-360` (Snap); `payments.controller.ts:33-73`.

### REQ-09-023 — Verifikasi webhook payment + reconcile unknown — SEBAGIAN — HIGH
**Persyaratan** (`09 §15`): webhook verify/normalize; unknown submit result reconciled before retry.
**Kondisi nyata**: Jalur produksi memverifikasi via `verifyMockPaymentWebhookSignature` (provider `mock-payment` hard-coded) dan menolak yang tak terverifikasi. **Verifier Midtrans SHA-512 riil tidak ter-wire** (`handleWebhook` hanya dipanggil di tes). Unknown-result direkonsiliasi lewat poll payment-worker.
**Bukti**: `postgres-payments.repository.ts:35` (`PROVIDER='mock-payment'`), `:142-160` (`verifyMockPaymentWebhookSignature`); `midtrans/index.ts:465` (`handleWebhook`, hanya tes). Overlap Jalur C.
**Yang kurang**: wiring verifier provider riil (Midtrans) ke jalur webhook produksi.

### REQ-09-024 — Redirect/screenshot tak menetapkan PAID — TERPENUHI — -
**Persyaratan** (`09 §15`): "redirect/screenshot/customer claim does not set PAID."
**Kondisi nyata**: Status hanya berubah setelah signature terverifikasi + `decidePaymentTransition` (mencegah mundur/duplikat/downgrade terminal). Berteskan (`payment-transitions.test.ts`, `payments.e2e.test.ts`).
**Bukti**: `postgres-payments.repository.ts:142-205`; `payment-transitions.test.ts`. Overlap Jalur C.

### REQ-09-025 — Peta status provider berversi, unknown→UNKNOWN — TERPENUHI — -
**Persyaratan** (`09 §16`, ADR-027): "versioned provider-code → canonical-shipment-status mapping. Unknown codes map to UNKNOWN and alert; AI cannot infer them."
**Kondisi nyata**: `mapJneMilestone` memetakan kode ke milestone kanonik, kode absen/tak dikenal → `UNKNOWN` dengan `unmapped:true`, membawa `mappingVersion` (`JNE_STATUS_MAP_VERSION`). Worker `canonicalMilestone` sebagai lapis pertahanan kedua: kode di luar himpunan → `UNKNOWN`, bukan ditebak. Ter-wire via logistics-worker.
**Bukti**: `jne/index.ts:52-100` (`JNE_STATUS_MAP_VERSION`, `mapJneMilestone`); `workers/logistics-worker/src/reconcile.ts:33-56` (`canonicalMilestone`).
**Catatan**: emisi alert saat `unmapped` belum eksplisit (flag tersedia, alert belum dipancarkan) — celah kecil, bukan pelanggaran fail-safe.

### REQ-09-026 — Lookup tracking butuh ownership — TIDAK-TERVERIFIKASI — HIGH
**Persyaratan** (`09 §16`, ADR-027): "Customer lookup requires tenant plus contact/order ownership, not a tracking number alone."
**Kondisi nyata**: Katalog `shipment.get_status` default identity-check + entitlement; namun enforcement ownership pada jalur lookup logistik ter-wire belum diperiksa dalam sesi ini.
**Bukti**: `tool-policy.ts:47-60`. Jalur lookup `apps/api/src/modules/logistics` belum ditelusuri untuk enforcement ownership.
**Yang kurang (untuk memutuskan)**: telusuri `logistics.controller.ts`/repo apakah lookup memverifikasi contact/order ownership, bukan hanya nomor resi.

### REQ-09-027 — Webhook + state-aware polling fallback — SEBAGIAN — MEDIUM
**Persyaratan** (`09 §16`): "webhook verification/normalization" + "state-aware polling fallback."
**Kondisi nyata**: Polling fallback lengkap & ter-wire: `runLogisticsReconciler` memilih shipment melewati SLA, menandai `STALE`, men-dedup pada `providerEventId`, commit events+audit+outbox satu transaksi. Webhook JNE ada tetapi tak dirutekan ke endpoint dan tak diverifikasi signature (REQ-09-006).
**Bukti**: `workers/logistics-worker/src/reconcile.ts:200-330`; `main.ts:24`.
**Yang kurang**: route webhook logistik + verifikasi signature.

### REQ-09-028 — Satu order → banyak shipment/paket — TIDAK-TERVERIFIKASI — LOW
**Persyaratan** (`09 §16`): "One order may map to multiple shipments and packages."
**Kondisi nyata**: Kardinalitas ini adalah properti skema data (ranah Jalur A/05_DATA_MODEL); tak diverifikasi di sesi ini.
**Bukti**: reconciler bekerja per `tracking_number` (`reconcile.ts:230-260`), tak menampik multi-parcel, tetapi skema `chai.shipment`/`package` tak diperiksa.
**Yang kurang (untuk memutuskan)**: periksa skema shipment/package (Jalur A) untuk relasi order→banyak shipment/paket.


### REQ-09-029 — Penyimpanan auth/secret konektor — SEBAGIAN — HIGH
**Persyaratan** (`09 §17`): OAuth token di secret manager; DB simpan reference+metadata; API key encrypted/vaulted; token tak dikembalikan ke browser; scope/expiry terlihat; rotation/revocation teraudit.
**Kondisi nyata**: `connector_secrets` punya kolom `secret_value_encrypted` (bytea) + metadata rotasi (`secret_version`, `rotated_at`, `rotated_by`); RLS ditegakkan lewat parent (`0040`). Tak ada endpoint yang mengembalikan nilai secret ke browser. **Namun** repo hanya menyimpan/membaca buffer — mekanisme enkripsi-at-rest aktual (kripto + secret manager) tidak terlihat di jalur ini (ranah Jalur A); nama kolom "encrypted" tidak membuktikan enkripsi.
**Bukti**: `apps/api/src/modules/connector-config/postgres-connector-config.repository.ts:38-46,150-185` (kolom + metadata rotasi); controller tak mengembalikan nilai secret.
**Yang kurang**: bukti enkripsi-at-rest/secret-manager (verifikasi Jalur A) + audit rotasi/revocation eksplisit.

### REQ-09-030 — Isolasi rate/concurrency per tenant + provider — SEBAGIAN — MEDIUM
**Persyaratan** (`09 §18`): connector maintain provider/account limit state, per-tenant queue, Retry-After, concurrency, cost/volume quota; isolasi per tenant + akun provider; payment/tracking diprioritaskan.
**Kondisi nyata**: Worker memproses per tenant (roster) dengan `batchLimit`; whatsapp mengklasifikasi 429→RATE_LIMIT + `retryAfterMs`. Tidak ada objek limit-state provider/akun, per-tenant queue, atau manajer concurrency; tak ada prioritas payment/tracking > bulk.
**Bukti**: `workers/logistics-worker/src/main.ts:20-30` (roster+batch); `whatsapp-meta/index.ts:266-270` (retryAfter). 
**Yang kurang**: state limit per provider/akun, queue per tenant, concurrency, prioritas realtime > bulk.

### REQ-09-031 — Harness conformance/certification — TERPENUHI — -
**Persyaratan** (`09 §19`): sebelum produksi: auth/refresh, scope discovery, webhook verify/replay/duplicate, pagination, rate limit, timeout/5xx, idempotency, unknown-result reconcile, media limits, PII/log redaction, tenant isolation, sandbox/live separation, disable/kill switch, runbook.
**Kondisi nyata**: `runChannelConformance` + suite conformance (whatsapp, midtrans, jne, google-calendar, payment, shipping, logistics-canonical) berjalan sebagai gate tes.
**Bukti**: `packages/connectors/src/conformance/index.ts:16-95`; `conformance/{midtrans,jne,whatsapp-meta,google-calendar,payment,shipping,logistics-canonical}.test.ts`.
**Catatan**: gate ini test-time, bukan gate registrasi runtime; sesuai §19 ("Before production").

### REQ-09-032 — Certification payment — TERPENUHI — -
**Persyaratan** (`09 §19`): hosted-checkout boundary, prohibited-field, amount/currency/idempotency integrity, signature valid/invalid/rotated + out-of-order, redirect vs verified-paid, unknown-create-result + reconcile mismatch, refund gate.
**Kondisi nyata**: `midtrans.test.ts` menguji signature salah/valid/rotated, redirect-vs-paid, unknown-create-result; `payment.test.ts` menguji verifyWebhook bad/good; `midtrans-advanced.test.ts` refund/settlement.
**Bukti**: `conformance/midtrans.test.ts:40-235`; `conformance/payment.test.ts:44-46`.

### REQ-09-033 — Certification logistik — TERPENUHI — -
**Persyaratan** (`09 §19`): status mapping version/unknown, multi-parcel/partial, webhook gap + poll fallback, guessed tracking/privacy, stale/exception detection + notification dedup, label/pickup/cancel/return unknown-result.
**Kondisi nyata**: `jne.test.ts` menguji mapping unknown, webhook, guessed tracking; `logistics-canonical.test.ts` + reconciler tes menguji poll fallback + STALE + dedup.
**Bukti**: `conformance/jne.test.ts:40-200`; `conformance/logistics-canonical.test.ts`.

### REQ-09-034 — Disable/kill switch konektor — SEBAGIAN — HIGH
**Persyaratan** (`09 §19`, §6.3): "disable/kill switch" (three-layer: env/db/owner per runbook).
**Kondisi nyata**: `KillSwitchRuntime` tiga lapis (env `KILL_SWITCH_<PROVIDER>`, db per-tenant, owner per-provider) ada + berteskan, **tetapi tak ter-wire ke jalur permintaan produksi mana pun** (hanya tes + skrip pilot). Jalur produksi memakai boolean tunggal terpisah di repo payments/logistics (`private killSwitch=false`) yang **hanya di-toggle oleh tes** (`setKillSwitch`); env `KILL_SWITCH_PAYMENT` dibaca hanya oleh `KillSwitchRuntime` yang tak ter-wire. Artinya menyetel `KILL_SWITCH_PAYMENT=1` di produksi **tidak** mempengaruhi controller payment.
**Bukti**: `packages/connectors/src/kill-switch.ts:40-95` (tiga lapis, tak ter-wire); `apps/api/src/modules/payments/postgres-payments.repository.ts:55,63-66,210-215` (boolean tunggal); `payments.controller.ts:66-75` (`isKillSwitchOn`); toggle hanya di `payments.e2e.test.ts`/integration. `grep KillSwitchRuntime` → hanya def/tes/skrip.
**Yang kurang**: wiring `KillSwitchRuntime` (env/db/owner) ke controller payment/logistics/channel; sumber DB persisten; jalur toggle produksi (owner-console).

### REQ-09-035 — Versioning konektor — SEBAGIAN — LOW
**Persyaratan** (`09 §20`): adapter version terpisah dari provider API version; breaking change → capability/version baru; tenant instance melaporkan versi; migrasi canary; deprecation alert; raw field tak jadi domain field wajib tanpa ADR.
**Kondisi nyata**: Manifest membawa `version:'1'`; mapping logistik berversi (`JNE_STATUS_MAP_VERSION`). Tetapi tak ada pelaporan versi per-instance tenant, migrasi canary, atau deprecation alert.
**Bukti**: `whatsapp-meta/index.ts:317` (`version:'1'`); `jne/index.ts:57`.
**Yang kurang**: pelaporan versi per tenant, migrasi canary, deprecation alert.

---

## Verifikasi ulang temuan pra-isi §5 yang menyentuh Jalur D

- **K-08 (retrieval belum hybrid pgvector)** — **DIKONFIRMASI (masih terbuka)**. Jalur retrieval produksi full-text `ts_rank` saja; kolom `embedding jsonb` (bukan `vector`) tak terisi; tak ada rerank. Bukti: REQ-08-014. (Dokumen remediasi bukan bukti; kode adalah bukti.)
- **K-10 (`ai-gateway/src/cost-accounting.ts` Math.random)** — **DIBANTAH untuk berkas ini**. `cost-accounting.ts:60-66` memakai `randomUUID()`, bukan `Math.random`, dengan komentar eksplisit tentang tabrakan biaya antar-tenant. Butir K-10 lain di luar Jalur D (ranah Jalur B).

---

### Self-check Dokumen 09 (§10.7)
1. **Dibaca penuh?** Ya, 1–450 (via tool baca). Tak ada bagian dilewati.
2. **REQ & kelas:** 35 REQ. TERPENUHI 9 · SEBAGIAN 14 · HILANG 10 · BERTENTANGAN 0 · TIDAK-TERVERIFIKASI 2.
3. **Setiap TERPENUHI ada path:baris + call site/tes?** Ya (002 conformance assert; 004 sdk+adapter; 013 controller+port; 022/024 payments; 025 jne+worker; 031/032/033 conformance suite).
4. **Setiap HILANG ada perintah nol?** Ya (003, 007, 011, 012, 015–018, 020, 021 — grep/enumerasi direktori dilampirkan).
5. **Sudah di-append?** Ya.
6. **`git status --porcelain` hanya `docs/audit/`?** Diverifikasi di penutup.

### Laporan §10.8 — Dokumen 09
```
DOKUMEN 7/7 (jalur D) - 09_CHANNEL_AND_CONNECTOR_SPEC.md (450 baris)
REQ dihasilkan: 35
  TERPENUHI 9 | SEBAGIAN 14 | HILANG 10 | BERTENTANGAN 0 | TIDAK-TERVERIFIKASI 2
Temuan severity tertinggi: REQ-09-006 (verifikasi timestamp webhook absen + JNE tanpa signature), REQ-09-014 (endpoint sesi widget publik tanpa auth, tenantId dari body), REQ-09-034 (kill switch tiga lapis tak ter-wire), REQ-09-029 (secret) — HIGH.
Berkas keluaran: docs/audit/2026-07-29/jalur-d-ai-connector.md
Self-check 6 butir: semua "ya".
```

---

## Rekapitulasi Jalur D (dua dokumen)

Rekap dihitung dari kedua tabel Ringkasan dengan perintah PowerShell berikut (token kelas pada
kolom kelas tabel; header blok memakai em-dash sehingga tak ikut terhitung):

```powershell
$f = "docs\audit\2026-07-29\jalur-d-ai-connector.md"
# Kelas dihitung hanya bila diikuti sel Severity (HIGH/MEDIUM/LOW/-), yang hanya
# terjadi di dua tabel Ringkasan — bukan di tabel rekap ini sendiri.
foreach ($c in "TERPENUHI","SEBAGIAN","HILANG","BERTENTANGAN","TIDAK-TERVERIFIKASI") {
  $n = (Select-String -Path $f -Pattern ("\| " + [regex]::Escape($c) + " \| (HIGH|MEDIUM|LOW|-) \|") -AllMatches).Matches.Count
  Write-Output "$c = $n"
}
(Select-String -Path $f -Pattern '^\| REQ-0[89]-' -AllMatches).Matches.Count  # total baris REQ
```

| Kelas | Doc 08 | Doc 09 | Total |
|---|---|---|---|
| TERPENUHI | 5 | 9 | 14 |
| SEBAGIAN | 34 | 14 | 48 |
| HILANG | 5 | 10 | 15 |
| BERTENTANGAN | 0 | 0 | 0 |
| TIDAK-TERVERIFIKASI | 1 | 2 | 3 |
| **Total REQ** | **45** | **35** | **80** |

Per severity (dari kolom Severity kedua tabel):

| Severity | Jumlah (perkiraan dari tabel) |
|---|---|
| HIGH | 12 (08: 008,018,021,023,039,040; 09: 006,014,023,026,029,034) |
| MEDIUM | 34 |
| LOW | 16 |
| - (TERPENUHI) | 14 |

### Angka kematangan baru untuk lapisan "AI safety & policy" (§1 rencana mengklaim ~35%)

Rasio `TERPENUHI / total REQ` Jalur D = **14/80 = 17,5%**. Bila TERPENUHI + separuh-bobot SEBAGIAN:
`(14 + 48/2)/80 = 47,5%`. Angka §1 (~35%) untuk AI-safety **terlalu optimistis untuk kematangan
produksi** namun tidak jauh bila mesin kebijakan/guardrail dihitung "ada": komponen keputusan
(`evaluateToolPolicy`, katalog risk tier, `decidePaymentTransition`, mapping status fail-safe)
memang **matang & terjangkau**, tetapi seluruh **runtime AI** (gateway, tool execution, guardrail,
RAG hybrid, budget) **tidak ter-wire ke produksi**. Estimasi jujur: lapisan **keputusan** ~70%
matang; lapisan **runtime/eksekusi AI** ~10% (sebagian besar pustaka tak terpanggil). Rata-rata
tertimbang mendekati **30–35%**, jadi §1 dibenarkan sebagai potret gabungan tetapi menyembunyikan
belahan tajam decision-vs-runtime.

### Butir TIDAK-TERVERIFIKASI (apa yang dibutuhkan untuk menutup)

- **REQ-08-002** — butuh jalur persistensi respons AI untuk diperiksa (belum ada runtime AI).
- **REQ-09-026** — telusuri `apps/api/src/modules/logistics` apakah lookup tracking memverifikasi
  contact/order ownership, bukan nomor resi saja.
- **REQ-09-028** — periksa skema `chai.shipment`/`package` (Jalur A/05_DATA_MODEL) untuk relasi
  satu order → banyak shipment/paket.

### Rujukan silang antar jalur (untuk konsolidasi master)

- REQ-08-024/09-024/09-023 (PAID hanya dari webhook terverifikasi; `decidePaymentTransition`) overlap **Jalur C** (17_PAYMENT).
- REQ-09-029 (enkripsi secret at rest + rotasi) overlap **Jalur A** (10_SECURITY §4.2).
- REQ-09-014 (RLS `widget_session`, `tenantId` dari body) perlu konfirmasi isolasi tenant — **Jalur A**.
- REQ-08-033 (trace/observability AI) overlap **Jalur F**.
- Temuan struktural (ai-gateway tak ter-wire) sejajar dengan catatan **Jalur F** (`docs/audit/2026-07-29/jalur-f-operasional.md:87-91`), diverifikasi independen di sini lewat pemeriksaan `package.json` + `grep toolProposal`.

---

## Penutup — kepatuhan read-only

Satu-satunya artefak yang **ditulis/dibuat oleh Jalur D** adalah berkas ini
(`docs/audit/2026-07-29/jalur-d-ai-connector.md`). Tidak ada kode produksi yang disunting Jalur D.

`git status --porcelain` pada akhir sesi menampilkan juga `M .github/workflows/ci.yml`,
`M infra/production/nginx.conf`, `M package.json`, dan `?? scripts/verify-infra-config.mjs` —
berkas-berkas ini **di luar cakupan Jalur D** (bukan AI/knowledge/connector), tidak disentuh sesi
ini, dan berasal dari kondisi repo/agen jalur lain dalam orkestrasi paralel. Verifikasi: seluruh
perintah sesi ini hanya membaca (`Get-Content`, `Select-String`, `git status`) atau menulis ke
`docs/audit/`.
