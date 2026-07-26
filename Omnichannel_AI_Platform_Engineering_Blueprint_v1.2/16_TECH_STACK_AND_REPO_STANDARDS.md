# Tech Stack and Repository Standards

## 1. Version Policy

- Node.js: current Active LTS when repository is bootstrapped.
- TypeScript: current stable, strict mode.
- Package manager: pnpm, exact version pinned through Corepack.
- Framework/library: exact versions locked in pnpm lockfile.
- Production images use immutable digest.
- Major upgrades require compatibility test and ADR/release note when architectural.

Avoid floating latest in production.

## 2. Monorepo

| Tool | Choice |
|---|---|
| Package manager | pnpm workspaces |
| Build orchestration | Turborepo |
| Language | TypeScript; Python only for isolated AI/document services where required |
| Formatting | Prettier |
| Lint | ESLint flat config |
| Commit/release | Conventional commits + automated changelog |

Recommended layout:

```text
apps/
  owner-console/
  client-portal/
  api/
  realtime-gateway/
workers/
  channel-worker/
  ai-worker/
  media-worker/
  automation-worker/
  payment-worker/
  logistics-worker/
  analytics-worker/
packages/
  contracts/
  domain/
  database/
  auth/
  connector-sdk/
  payment-domain/
  logistics-domain/
  ui/
  observability/
  test-fixtures/
services/
  ai-gateway/
infra/
  compose/
  opentofu/
  monitoring/
```

## 3. Frontend Stack

| Concern | Default |
|---|---|
| Framework | Next.js App Router |
| UI runtime | React |
| Language | TypeScript |
| Styling | Tailwind CSS with semantic CSS variables |
| Accessible primitives | Radix UI via shadcn/ui-style owned components |
| Server state | TanStack Query |
| Data tables | TanStack Table |
| Large lists | TanStack Virtual |
| Forms | React Hook Form + Zod |
| Charts | Apache ECharts |
| Localization | next-intl or equivalent |
| Icons | Lucide |
| Unit/component test | Vitest + Testing Library |
| E2E | Playwright |
| API mocks | MSW generated/typed fixtures |

### Frontend rules

- Owner and client apps share packages/ui, never route/auth middleware.
- Server Components for static/read-heavy shell where appropriate.
- Interactive inbox/dashboard components remain client-side only where required.
- URL owns shareable filter/search/page state.
- TanStack Query owns server cache.
- Avoid global client store unless state is truly cross-route and non-server.
- Permission/entitlement bootstrap controls UX, not authorization.
- No direct provider SDK in browser.

## 4. Backend Stack

| Concern | Default |
|---|---|
| Framework | NestJS |
| HTTP adapter | Fastify |
| API | REST + OpenAPI |
| Validation | Zod/JSON Schema with generated TypeScript contracts |
| Database | PostgreSQL |
| Query/ORM | Drizzle ORM + explicit SQL for hot paths/RLS |
| Migrations | Drizzle migration tooling or dedicated SQL migrations reviewed in Git |
| DB driver/pool | pg + PgBouncer-compatible settings |
| Cache/queue | Redis + BullMQ |
| Realtime | Socket.IO/WebSocket with Redis adapter |
| Durable workflow | Temporal TypeScript SDK, introduced at Growth stage |
| Object storage | S3 API |
| Logging | Structured logger with OpenTelemetry correlation |

### Backend rules

- Controller → application service → domain/repository/adapter.
- No repository access from controller.
- No cross-module repository import.
- Business mutation opens tenant-scoped transaction.
- Audit and outbox written in same transaction.
- External call outside DB transaction unless workflow pattern requires reservation.
- Provider error normalized at adapter boundary.
- All async handlers idempotent.

## 5. Contract Tooling

- OpenAPI generated from shared schemas.
- Typed frontend client generated in CI.
- Canonical event schemas stored in packages/contracts.
- Schema compatibility check blocks breaking change.
- Provider fixtures live in connector package, sanitized.
- Runtime validation at trust boundaries.

## 6. Authentication

Reference MVP provider: managed Auth0-compatible OIDC deployment for speed, behind a provider-neutral OIDC integration.

Requirements:

- separate owner/client applications and audiences;
- MFA for owner;
- organization/tenant mapping remains in platform DB, not trusted solely from IdP;
- short-lived access;
- server-side session/cookie security;
- service workload identities.

Identity provider may later be replaced by ZITADEL, Keycloak, or enterprise federation without changing domain membership.

## 7. AI Stack

| Concern | Default |
|---|---|
| Gateway implementation | LiteLLM service behind internal contract |
| AI observability/evals | Langfuse |
| Cloud/local providers | Registry/adapters |
| Local development | Ollama optional |
| Production private models | vLLM/private managed endpoint when required |
| Embeddings | Provider through alias |
| Vector | pgvector |

Python services remain isolated containers; core application remains TypeScript.

## 8. Media and Document Stack

- FFmpeg for audio normalization.
- ClamAV or managed malware scanning.
- MIME detection independent of extension.
- PDF/text extraction through isolated service.
- OCR through provider adapter; local Tesseract optional.
- Object storage references.
- CPU/memory/time limits.

## 9. Integration Stack

- Native Connector SDK in TypeScript.
- n8n for custom integrations.
- Meta Direct WhatsApp adapter.
- Community Gateway isolated service only.
- Google Calendar API.
- OAuth callbacks through dedicated handler.
- PaymentProviderAdapter and ShippingProviderAdapter in the TypeScript Connector SDK.
- Provider-hosted checkout/payment links; no raw card/bank credential handling.
- Payment webhook/command/reconciliation workers and Logistics webhook/command/poll workers as independent process entry points.
- Provider SDK is optional inside an adapter; stable HTTP contracts, capability discovery, idempotency, and reconciliation are the domain boundary.

## 10. Observability

| Signal | Default |
|---|---|
| Instrumentation | OpenTelemetry |
| Application errors | Sentry or equivalent |
| Metrics | Prometheus-compatible |
| Dashboards | Grafana |
| Logs | Loki or managed equivalent |
| Traces | Tempo or managed equivalent |
| AI traces | Langfuse linked by correlation ID |

Managed observability may replace components on MVP; instrumentation stays vendor-neutral.

## 11. Analytics

MVP:

- PostgreSQL metric events/summary tables;
- background aggregation;
- ECharts frontend.

Scale:

- ClickHouse;
- incremental materialized views;
- event delivery through outbox/CDC.

## 12. Testing

| Concern | Tool |
|---|---|
| Unit | Vitest |
| UI | Testing Library |
| E2E | Playwright |
| Integration resources | Testcontainers |
| HTTP/provider mocks | MSW/WireMock-style service |
| Load | k6 |
| Security | Semgrep/SAST, dependency/container scanners, DAST |
| Contract | OpenAPI/schema compatibility tests |

Payment/logistics test infrastructure additionally uses provider sandbox accounts plus deterministic recorded/synthetic HTTP/webhook fixtures. Fixtures must contain no production credential, customer address, payment token, or proof-of-delivery artifact.

## 13. Infrastructure Reference

Cloud-neutral architecture; AWS Jakarta-region reference:

| Capability | Reference service |
|---|---|
| Containers | ECS/Fargate or managed containers |
| Database | RDS PostgreSQL |
| Cache | ElastiCache Redis-compatible |
| Object | S3 |
| CDN/WAF | CloudFront + WAF |
| Load balancer | ALB |
| Secrets/KMS | Secrets Manager + KMS |
| Registry | ECR |
| DNS/certificates | Route 53 + ACM |

Infrastructure as code: OpenTofu/Terraform-compatible modules.

Kubernetes is not required for MVP.

## 14. Local Development

Docker Compose services:

- PostgreSQL + pgvector;
- Redis;
- MinIO;
- Mail sandbox;
- LiteLLM;
- Langfuse optional profile;
- n8n optional profile;
- mock provider server.

Developer workflow:

1. Install pinned Node/pnpm.
2. Copy non-secret local config template.
3. Start infrastructure profile.
4. Run migrations/seed.
5. Start apps/workers.
6. Run smoke tests.

Seed includes two tenants with overlapping contact identifiers.

## 15. Code Standards

- TypeScript strict; no implicit any.
- Domain enum/value objects centralized.
- No unvalidated unknown external payload.
- Functions/modules small enough for review.
- Errors typed and normalized.
- UTC internally.
- Money integer minor units.
- No logging full request/provider response by default.
- Comments explain why, not restate code.
- Public package APIs documented.

## 16. Git and Review

- protected main;
- short-lived branches;
- required CI;
- minimum one review; security/tenancy changes require technical owner;
- CODEOWNERS for auth, DB/RLS, contracts, infra;
- no force-push to protected branch;
- release tags immutable.

## 17. Feature Flags

Initial flags:

- community_whatsapp_gateway;
- instagram_connector;
- commerce_read;
- commerce_write;
- temporal_workflows;
- advanced_analytics;
- client_ai_settings;
- internal_team_roles;
- dedicated_tenant_mode.
- payment_orchestration;
- payment_refunds;
- payment_recurring;
- shipment_tracking;
- shipment_create_label;
- shipment_pickup;
- shipment_returns.

Flag evaluation is server-side and tenant-aware.

## 18. Dependency Selection Rules

Adopt dependency only if:

- active maintenance;
- compatible license;
- security posture;
- TypeScript/runtime compatibility;
- reasonable bundle/operational cost;
- replaceable boundary for critical vendor;
- tests/documentation.

Avoid separate library when platform/runtime capability is sufficient.

## 19. Bootstrap Acceptance

- monorepo builds;
- local one-command infrastructure;
- both web apps render distinct login audiences;
- API health/readiness;
- migration and RLS fixture;
- OpenAPI generated;
- queue worker processes sample job;
- telemetry trace end-to-end;
- CI scans/builds/tests;
- no production secret required locally.
- payment and shipping adapters boot against mocks/sandbox with verified webhook, unknown-result, and reconciliation examples;
- prohibited payment credential fields and cross-tenant provider-account fixtures fail CI;
- payment/logistics workers can be scaled or disabled independently without disabling AI CS core.
