# QA and Test Strategy

## 1. Quality Objectives

- No tenant isolation defect.
- No duplicate high-impact side effect.
- Safe degraded behavior when provider fails.
- UI permissions match backend.
- AI changes cannot silently regress safety.
- Release can be rolled back.
- Critical operations have observable evidence.

## 2. Test Layers

| Layer | Scope | Frequency |
|---|---|---|
| Static | types, lint, imports, schemas, security | Every commit |
| Unit | domain rules/policies/mappers | Every commit |
| Component | UI components/workers/modules | Every PR |
| Integration | PostgreSQL/RLS/Redis/object store | Every PR |
| Contract | API/events/connectors | Every PR/nightly |
| E2E | critical user flows | PR smoke/nightly |
| AI evaluation | golden/adversarial | Prompt/model release |
| Performance | load/burst/soak | Scheduled/release |
| Security | scans/authorization/fuzz/pen test | Continuous/milestone |
| DR/operations | backup/restore/failover/runbook | Scheduled |

## 3. Test Environments

- Unit/test: isolated ephemeral resources.
- Integration: real PostgreSQL/Redis containers.
- Staging: production-like topology, synthetic data.
- Provider sandbox/test accounts.
- No production customer data in automated tests.
- Seeded multi-tenant fixture with deliberate similar IDs/names to detect leaks.

## 4. Critical E2E Journeys

1. Create tenant → invite Client Owner → onboarding → activate.
2. Meta webhook inbound → AI answer → delivery status.
3. Website widget inbound → human takeover → human reply → resolve.
4. Voice note → transcription → answer/handover.
5. Knowledge upload → scan → review → test → publish → grounded answer.
6. Lead capture → qualification → assignment.
7. Availability → confirmation → appointment create → reminder.
8. Follow-up scheduled → customer replies → automation stops.
9. AI provider timeout → fallback → trace/cost.
10. Wrong-tenant API/DB/search/object/export attempts denied.
11. Owner accesses tenant context with audit.
12. Community Gateway disconnect does not affect Meta tenant.
13. Approved booking/order/invoice → hosted payment link → verified paid/expired → reminder stops exactly once.
14. Payment timeout/duplicate/out-of-order webhook → reconciliation → no duplicate link or false paid state.
15. Linked shipment → webhook/poll tracking → milestone notification → delivery exception/resolution.
16. Guessed tracking number/wrong contact/tenant → no shipment, address, order, or proof data exposure.

## 5. Tenancy Test Matrix

For each resource:

- list;
- get by ID;
- create with foreign ID;
- update;
- delete/archive;
- search;
- export;
- realtime subscription;
- job replay;
- object URL;
- vector retrieval.

Cases:

- valid same tenant;
- user member of different tenant;
- guessed ID;
- missing tenant context;
- Platform Owner without selected context;
- expired privileged grant;
- worker with wrong signed context.

Expected: no data, no existence leakage, audit where sensitive.

## 6. Domain Unit Tests

### Conversation

- valid/invalid state transitions;
- takeover race;
- resume;
- assignment;
- reopen window;
- SLA timers.

### Consent/follow-up

- opt-in categories;
- opt-out;
- reply stop;
- channel window;
- template requirement;
- business hours/timezone.

### Booking

- free/busy overlap;
- timezone/DST;
- recheck;
- idempotency;
- uncertain provider response;
- reschedule/cancel.

### Lead

- required fields;
- score version;
- stage guards;
- duplicate identity.

### Payment

- amount/currency minor-unit integrity and immutability after attempt;
- authoritative amount-source/version and discount/tax guard;
- request/attempt/status transitions, late-event precedence, and explicit reversal;
- create idempotency, concurrency, unknown submit result, and reconcile-before-retry;
- verified webhook/query vs redirect/screenshot/customer claim;
- reminder stop-on-paid/expired/cancel/reply/opt-out;
- refund eligibility/approval/recent-auth when enabled;
- attribution and multi-currency separation.

### Logistics

- provider-code mapping and UNKNOWN fail-safe;
- duplicate/out-of-order tracking events and immutable timeline;
- one order with multiple/partial shipments and multiple packages;
- state-aware polling, webhook gap, and stale threshold;
- ETA source/freshness and no invented date;
- exception open/assign/resolve/dedup;
- tracking identity/privacy and proof-of-delivery access;
- create/label/pickup/cancel/return unknown result when enabled.

## 7. API Contract Tests

- request/response schema;
- unknown fields;
- auth audiences;
- permissions;
- feature entitlement;
- errors;
- pagination stability;
- filtering/sorting;
- idempotency same/different payload;
- If-Match conflicts;
- correlation ID.

## 8. Realtime Tests

- connect/auth;
- tenant/queue/conversation scope;
- reconnect last_event_id;
- duplicate/out-of-order version;
- permission revoked during session;
- takeover synchronization;
- presence expiry;
- load/fan-out.

## 9. Connector Tests

Common:

- auth/refresh/revoke;
- webhook signature/replay;
- duplicate/out-of-order;
- pagination;
- 429;
- timeout/5xx;
- invalid data;
- media;
- unknown submit result;
- kill switch.

WhatsApp:

- Meta verification;
- inbound content types;
- delivery/read/failure;
- 24-hour/template guard;
- pricing category attribution;
- Community QR/reconnect/logout/isolation/migration.

Calendar:

- timezone;
- free/busy;
- duplicate create;
- deleted/moved event;
- token expiration.

Payment gateway:

- sandbox/live and merchant-account isolation;
- hosted-checkout boundary and prohibited credential fields;
- signature valid/invalid/rotated, replay, duplicate, and out-of-order event;
- amount/currency/external-ID mapping;
- redirect vs verified status;
- 429/5xx/timeout before and after acceptance;
- authenticated reconciliation and mismatch;
- refund/dispute events when enabled.

Shipping/logistics:

- carrier/aggregator/store-account isolation;
- webhook signature/replay and polling fallback;
- status-mapping version/unknown code;
- pagination/event gap/timezone;
- multi-parcel/partial fulfillment;
- stale/failed/lost/damaged/return exception;
- proof/reference redaction;
- label/pickup/cancel/return mutation when enabled.

## 10. AI Tests

### Deterministic

- request normalization;
- capability routing;
- provider policy;
- budget;
- schema validation;
- tool policy;
- human mode block;
- trace/cost.

### Golden evaluation

- grounded FAQ;
- no evidence;
- conflicting evidence;
- prompt injection;
- sensitive info;
- tool selection;
- malformed tool arguments;
- Indonesian/English;
- multimodal;
- handover.
- payment amount/status/refund adversarial cases;
- shipment identity/status/ETA/proof privacy and exception cases.

### Release

- current vs candidate;
- critical safety must not regress;
- quality floor;
- cost/latency;
- canary;
- rollback.

## 11. UI Tests

- route permission;
- owner/client audience;
- navigation entitlement;
- loading/empty/error/partial/stale;
- optimistic conflict;
- unsaved change;
- responsive critical paths;
- keyboard;
- screen reader labels;
- chart table alternative;
- long localization.
- payment processing/reconciliation/mismatch/approval states;
- shipment timeline/stale/exception/proof states;
- money formatting by currency without client-side authoritative arithmetic;
- screen-reader ordered timeline and status text independent of color.

Visual regression for:

- app shells;
- inbox;
- data tables;
- dialogs;
- status/risk badges;
- dashboard.

## 12. File Security Tests

- MIME spoof;
- malware test file;
- oversized;
- corrupt;
- archive traversal;
- decompression bomb limit;
- SVG/HTML script;
- password-protected;
- SSRF URL;
- redirect chain;
- timeout.

## 13. Performance Tests

Profiles from PRD:

- MVP sustained 10 msg/s, burst 50;
- production baseline sustained 100, burst 500.

Scenarios:

- text-heavy;
- media references;
- AI latency;
- provider 429;
- webhook duplicate;
- hot tenant/noisy neighbor;
- large inbox;
- dashboard;
- realtime fan-out;
- export;
- worker restart.
- payment webhook burst and reconciliation backlog isolated from messages;
- logistics polling fan-out/provider throttling and customer lookup priority.

Measure:

- p50/p95/p99;
- queue lag;
- DB/cache saturation;
- error/retry;
- tenant fairness;
- cost.

## 14. Resilience/Chaos

- kill worker;
- restart Redis;
- DB failover;
- object store transient;
- model outage;
- connector outage;
- network latency;
- expired secret;
- corrupt job;
- clock skew where relevant.
- payment/shipping signing-key rotation and webhook silence;
- provider returns success then loses response;
- provider status conflict and unknown shipment code.

Verify recovery without duplicate side effects.

## 15. Security Tests

- SAST/dependency/container/secrets;
- IDOR/BOLA;
- broken property authorization;
- CSRF/CORS;
- session fixation;
- audience confusion;
- rate-limit;
- injection;
- SSRF;
- webhook forgery;
- privilege escalation;
- audit bypass;
- prompt/tool injection;
- export abuse.
- prohibited card/CVV/PIN/OTP/bank-login payload/log redaction;
- payment merchant-account cross-tenant confusion;
- tracking enumeration, address/proof exposure, and provider-token misuse;
- refund/return/label action approval bypass.

## 16. Data/Analytics Tests

- event dedup;
- late events;
- timezone;
- bot/human attribution;
- numerator/denominator;
- source reconciliation;
- stale/partial;
- cost rounding/currency;
- tenant filter;
- export equivalence.
- payment amount/currency/status/provider reconciliation and false-paid detection;
- shipment state/timeline/partial-fulfillment/provider reconciliation;
- currency-separated payment-value reporting.

## 17. Release Gates

### PR merge

- static/unit/integration;
- contract compatibility;
- security scan;
- review.

### Staging

- migrations;
- E2E smoke;
- provider sandbox;
- observability;
- rollback.

### Production

- change approved;
- backup healthy;
- no unresolved critical finding;
- canary/feature flag;
- runbook/on-call;
- post-deploy verification.

Payment/logistics production release additionally requires:

- provider adapter certification;
- legal/contract/PCI-scope and privacy review owners recorded;
- webhook/reconciliation synthetic checks;
- mismatch/exception dashboards and alerts;
- kill switches and tested provider-outage/mismatch runbooks;
- zero open isolation, false-paid, duplicate-side-effect, or restricted-data Critical findings.

## 18. Severity and Exit Criteria

| Severity | Meaning | Release |
|---|---|---|
| Blocker | Security/data loss/core unavailable | Stop |
| Critical | Major feature unsafe/unusable | Stop |
| Major | Important defect with workaround | Explicit approval |
| Minor | Limited cosmetic/non-critical | May ship |

Zero open Blocker/Critical for production.

## 19. Test Data

- deterministic synthetic tenants;
- same phone/external IDs across tenants;
- Indonesian names/content;
- multiple timezones;
- invalid/expired consent;
- large conversation;
- conflicting knowledge;
- provider failures;
- media samples.
- payment links, attempts, redirect-only, paid, failed, expired, refund, mismatch, and multi-currency samples;
- shipments with duplicate/out-of-order scans, unknown codes, partial packages, stale/failed/lost/returned states, and restricted proof samples.

Synthetic fixtures are versioned with schema.

## 20. QA Definition of Done

- acceptance criteria automated where practical;
- permissions/tenant cases included;
- audit/metric checked;
- error/empty/loading UX checked;
- observability visible;
- rollback or disable path tested;
- documentation updated.
