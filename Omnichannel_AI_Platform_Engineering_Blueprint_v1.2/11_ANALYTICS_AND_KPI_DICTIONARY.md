# Analytics and KPI Dictionary

## 1. Analytics Principles

- Metric definition before visualization.
- Bot, human, and blended interactions separated.
- Timezone and freshness explicit.
- Denominator visible.
- Event versioned.
- Operational and analytical stores separated logically.
- PII minimized.
- Dashboard value reconciles to source.

## 2. Semantic Dimensions

Common dimensions:

- tenant;
- date/hour in tenant timezone;
- channel and channel account;
- provider mode;
- conversation mode;
- queue/team/agent;
- intent;
- lead source/stage;
- automation/version;
- agent profile/prompt/model alias;
- connector;
- vertical pack;
- outcome type.
- payment provider/account, request purpose, currency, and verified status;
- shipping provider/carrier/service, canonical shipment status, warehouse/store, and exception type.

## 3. Core Fact Events

| Fact | Grain |
|---|---|
| message_fact | One canonical message |
| conversation_fact | One conversation lifecycle |
| assignment_fact | One assignment interval |
| ai_generation_fact | One model generation |
| retrieval_fact | One retrieval request |
| tool_action_fact | One action request |
| lead_fact | One lead lifecycle/state snapshot |
| appointment_fact | One appointment |
| automation_run_fact | One workflow run |
| channel_delivery_fact | One outbound delivery |
| usage_cost_fact | One measured usage item |
| csat_fact | One valid response |
| payment_request_fact | One canonical payment request lifecycle |
| payment_transaction_fact | One verified provider transaction/reversal/refund/dispute event |
| payment_reconciliation_fact | One provider comparison run |
| shipment_fact | One shipment lifecycle/state snapshot |
| tracking_event_fact | One deduplicated canonical tracking event |
| shipment_exception_fact | One delivery exception lifecycle |

## 4. Metric Definitions

### 4.1 Active tenants

Distinct active tenants with at least one eligible message or business outcome in period.

### 4.2 Inbound messages

Count of canonical customer-originated messages accepted after deduplication.

### 4.3 Conversations opened

Count conversation.opened events. Reopen is reported separately.

### 4.4 First response time

For each eligible conversation:

first outbound customer-visible response timestamp − first inbound timestamp.

Report:

- p50;
- p75;
- p90/p95;
- bot/human/blended;
- exclude internal notes and delivery delay unless explicitly named end-to-end.

### 4.5 Resolution time

resolved_at − opened_at − configured paused duration.

Definition version must state whether waiting-on-customer is excluded.

### 4.6 Automation/containment rate

Numerator:

eligible conversations resolved without human takeover.

Denominator:

eligible resolved conversations.

Exclude:

- spam/test;
- capability-disabled;
- mandatory-human intents;
- channel/system failures.

Always show numerator and denominator.

### 4.7 Handover rate

Conversations entering HUMAN_ACTIVE / eligible AI-handled conversations.

Segment by reason.

### 4.8 Reopen rate

Resolved conversations reopened within configured window / resolved conversations.

### 4.9 Successful automated outcome

Distinct outcome completed through AI/automation with no human correction/reversal within validation window.

Outcome types:

- ANSWER_RESOLVED;
- LEAD_QUALIFIED;
- APPOINTMENT_CONFIRMED;
- ORDER_STATUS_FOUND;
- TICKET_RESOLVED;
- INVOICE_SENT.
- PAYMENT_CONFIRMED;
- SHIPMENT_STATUS_FOUND;
- DELIVERY_EXCEPTION_HANDLED.

### 4.10 Lead qualification rate

Qualified leads / leads with sufficient required data.

### 4.11 Lead conversion rate

Converted leads / qualified leads, using declared attribution window.

### 4.12 Booking conversion

Confirmed appointments / conversations where booking intent and valid offer occurred.

### 4.13 No-show rate

No-show appointments / appointments with confirmed status and past scheduled end.

### 4.14 Tool success rate

Succeeded tool actions / executed tool actions.

Proposed but rejected/invalid shown separately.

### 4.15 Grounded answer rate

AI factual answers requiring tenant evidence that contain valid published evidence or verified tool result / evaluated eligible answers.

### 4.16 Unsupported-claim rate

Sampled/evaluated answers with material claim unsupported or contradicted / evaluated factual answers.

### 4.17 AI fallback rate

Generations using non-primary deployment / eligible generation requests.

### 4.18 Cost per conversation

Allocated AI + channel + variable infrastructure costs / eligible conversations.

### 4.19 Cost per successful outcome

Allocated variable cost / successful automated outcomes.

### 4.20 Gross margin estimate

Recognized/allocated tenant revenue − attributable variable cost − allocated support cost.

Clearly label estimated until billing reconciliation.

### 4.21 CSAT

Positive valid responses / all valid responses.

Always show response rate:

valid responses / survey invitations.

### 4.22 Channel delivery success

Delivered outbound messages / accepted outbound messages, segmented by provider and category.

### 4.23 Payment conversion

Verified PAID eligible payment requests / eligible payment requests created in the cohort.

Show request count, denominator exclusions, currency, source, and attribution window. Do not combine monetary values across currencies without an explicit versioned FX conversion.

### 4.24 Time to pay

First verified PAID provider event time − first valid hosted-link-created time for a payment request.

Report p50/p75/p90 and exclude test, cancelled-before-send, and replaced-invalid requests.

### 4.25 Payment-attributed value

Sum verified paid transaction value linked to eligible conversation/lead/booking/order attribution, grouped by currency.

Label this as payment-attributed value, not platform revenue, settlement, cash balance, or accounting close.

### 4.26 Payment failure/expiry rate

Requests ending FAILED or EXPIRED / eligible terminal requests. Provider reason availability and unknown categories are displayed.

### 4.27 Payment reconciliation mismatch

Payment requests/attempts with unresolved provider-vs-platform status/amount/currency mismatch / reconciled eligible requests.

Also report oldest unresolved mismatch and time to resolution.

### 4.28 Delivered shipment rate

Shipments reaching DELIVERED / eligible terminal or due shipments for the cohort. Partial/multiple shipments remain separate facts; order-level completion is a distinct derived metric.

### 4.29 On-time delivery rate

Delivered on/before the versioned provider/client commitment / delivered shipments with an eligible commitment.

Never infer a commitment from an AI estimate or missing provider ETA.

### 4.30 Shipment exception rate

Shipments with at least one qualifying exception / eligible active or terminal shipments. Segment failed delivery, address issue, hold, lost, damaged, return, and unknown.

### 4.31 Stale shipment rate

Active shipments exceeding state/provider-specific no-event threshold / eligible active shipments.

The threshold and provider polling capability are metric dimensions/versioned configuration.

### 4.32 Shipment exception resolution time

resolved_at − detected_at, with p50/p75/p90 and open-age distribution. Paused/external-wait handling must be definition-versioned.

### 4.33 Tracking self-service containment

Eligible tracking-intent conversations resolved with verified shipment data and no human takeover/reopen within validation window / eligible tracking-intent conversations.

## 5. Owner Dashboard

### Platform Overview

- active tenants;
- messages/outcomes;
- platform/API SLO;
- unhealthy channels;
- AI cost;
- gross margin estimate;
- DLQ/failed workflows;
- security alerts.
- payment webhook/reconciliation health and oldest mismatch;
- shipping provider freshness, unknown mappings, and open delivery exceptions.

### Tenant Risk Table

Score factors:

- connector down;
- queue backlog;
- cost spike;
- low grounded rate;
- SLA breach;
- unanswered topics;
- usage threshold;
- session/token expiry.

Risk score is operational prioritization, not hidden customer grading.

### Cost and Usage

- tenant;
- model/provider;
- channel/provider;
- audio/image/document;
- retry waste;
- support effort;
- estimated margin.

## 6. Client Dashboard

### Home

- open/urgent;
- first response;
- automated outcomes;
- qualified leads;
- bookings;
- CSAT;
- recommended actions.

### Service

- volume;
- response/resolution;
- containment/handover;
- reasons/intents;
- reopen;
- SLA;
- queue/agent.

### Sales

- lead sources;
- qualification;
- stage funnel;
- conversion;
- time-to-follow-up;
- owner performance.

### Booking

- offered/confirmed/completed/cancelled/no-show;
- resource/time distribution;
- conversion.

### Payments

- requests/links/paid conversion;
- paid value by currency and source;
- time to pay;
- processing/expired/failed reasons;
- provider freshness, webhook lag, and reconciliation mismatch;
- refund/dispute only after capability launch.

### Logistics

- active shipment status mix;
- delivered/on-time rates with eligible denominators;
- transit/dwell time;
- stale and exception rates;
- exception age/resolution;
- tracking containment/handover;
- provider freshness and notification delivery.

### AI Quality

- grounded rate;
- low-evidence/handover;
- fallback;
- tool success;
- human edits;
- top unanswered topics;
- prompt/model release markers.

### Usage

- message;
- AI units/cost;
- channel cost;
- quotas;
- forecast.

## 7. Data Freshness

| Data | Target |
|---|---:|
| Inbox/realtime operations | Seconds |
| Operational dashboard | <5 minutes production |
| Provider billing reconciliation | Daily |
| Marketplace/order sync | Connector-specific, displayed |
| Payment webhook projection | Seconds/minutes; provider dependency displayed |
| Payment reconciliation | Near-real-time for uncertainty; daily completeness check |
| Shipment webhook projection | Seconds/minutes; provider dependency displayed |
| Shipment polling fallback | State/provider-specific, displayed |
| Monthly invoice records | Daily/final close |

Dashboard shows last successful processing time and partial-source warnings.

## 8. Metric Event Requirements

Every event includes:

- event name/version;
- tenant;
- occurred and ingested time;
- source object;
- dedup key;
- dimensions;
- values;
- producer version.

Late event policy:

- accept within watermark;
- recompute affected aggregate;
- label finalization state for billing.

## 9. Data Quality Checks

- duplicate event rate;
- missing tenant/source;
- invalid timestamps;
- dimension referential integrity;
- negative duration/cost;
- impossible state sequence;
- provider vs platform volume reconciliation;
- raw vs aggregate count;
- freshness lag;
- metric version drift.
- payment amount/currency/status mismatch against provider sample/close;
- payment redirect/screenshot event incorrectly counted as paid;
- shipment invalid state sequence, duplicate scan, unknown mapping, missing provider event, and partial-fulfillment mismatch;

Failure produces data-quality alert and dashboard partial badge.

## 10. Experiment/Release Analysis

Compare prompt/model/automation releases by:

- eligible cohort;
- quality;
- cost;
- latency;
- handover;
- outcome;
- error.

No release decision from unbalanced raw comparison; use defined cohort/canary.

## 11. Privacy

- analytical identity pseudonymous where possible;
- no message content in general metric store;
- role-based row/field access;
- export audited;
- retention;
- small-cohort suppression if needed for employee analytics.
- payment tokens/bank references, full address, and proof-of-delivery artifacts excluded from general metric store;
- monetary metrics separated by currency unless a governed FX semantic layer is explicitly enabled.

## 12. Analytics Acceptance

- metric formula implemented once in semantic layer;
- UI definition matches formula;
- tenant timezone tests;
- bot/human classification tests;
- duplicate/late event tests;
- source reconciliation within agreed tolerance;
- empty/partial/stale states tested;
- export matches dashboard filters.
