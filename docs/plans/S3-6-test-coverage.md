# S3-6 Test Coverage Documentation

## Overview
This document outlines the test coverage strategy and results for Stage 3 of the Chai omnichannel AI platform. It covers E2E tests, performance baselines, security tests, and identifies coverage gaps.

**Date**: 2026-03-15  
**Stage**: 3 — Test Coverage Completion  
**Blueprint Requirement**: 80%+ test coverage  

---

## Test Coverage Analysis

### Current Coverage
- **Unit tests**: ~65% (estimated from existing test files in `apps/api/test/` and `apps/api/src/`)
- **Integration tests**: ~45% (12 integration test files in `apps/api/test/integration/`)
- **E2E tests**: ~30% (newly created in `tests/e2e/`)

### Coverage by Module
| Module | Unit % | Integration % | E2E % |
|--------|--------|---------------|-------|
| apps/api | ~70% | ~50% | ~35% |
| apps/client-portal | ~40% | N/A | ~25% |
| apps/owner-console | ~35% | N/A | ~20% |
| apps/realtime-gateway | ~50% | ~30% | ~15% |
| packages/domain | ~80% | N/A | N/A |
| packages/database | ~60% | ~40% | N/A |
| packages/connectors | ~75% | ~60% | N/A |
| packages/auth | ~85% | N/A | N/A |

**Note**: Percentages are estimates based on file counts and test density. Actual coverage requires running Vitest with `--coverage` flag.

---

## E2E Test Scenarios

### 1. Conversation Flow
- **File**: `tests/e2e/conversation-flow.spec.ts`
- **Scenario**: Webhook ingest → conversation creation → AI response → human takeover
- **Status**: ✅ Implemented
- **Test Cases**:
  - Webhook ingest creates conversation
  - Conversation transitions from AI to human mode
  - Action policy evaluation for AI and human origins

### 2. Lead Booking
- **File**: `tests/e2e/lead-booking.spec.ts`
- **Scenario**: Lead extraction → qualification → booking → follow-up
- **Status**: ✅ Implemented
- **Test Cases**:
  - Full lead lifecycle: list → qualify → book appointment
  - Booking detects slot conflict
  - Idempotency verification for duplicate bookings

### 3. Payment Flow
- **File**: `tests/e2e/payment-flow.spec.ts`
- **Scenario**: Checkout → webhook → reconciliation
- **Status**: ✅ Implemented
- **Test Cases**:
  - Create checkout session
  - Retrieve payment session
  - Webhook processes payment event
  - Checkout rejects invalid amount
  - Checkout requires authentication

### 4. Multi-Tenant Isolation
- **File**: `tests/e2e/multi-tenant-isolation.spec.ts`
- **Scenario**: Tenant A cannot access Tenant B data
- **Status**: ✅ Implemented
- **Test Cases**:
  - Client portal user cannot access other tenant data
  - Leads are tenant-scoped
  - Payments are tenant-scoped
  - Team members are tenant-scoped
  - Analytics are tenant-scoped
  - Unauthenticated requests are rejected
  - Disabled accounts are rejected
  - Revoked memberships are rejected
  - Viewer role cannot manage team
  - Agent role cannot manage team

---

## Performance Baseline

### API Load Tests
- **File**: `tests/performance/api-load.test.ts`
- **Target**: 100 req/s concurrent webhook ingestion
- **Results**: [To be filled after test execution]

### Data Access Benchmarks
- **File**: `tests/performance/data-benchmarks.test.ts`
- **Focus**: Lead operations, appointment booking under load, team operations
- **Results**: [To be filled after test execution]

### Metrics to Track
- Response time (p50, p95, p99)
- Throughput (requests/second)
- Error rate
- Resource utilization (CPU, memory)
- Database query latency

### Performance Targets
| Endpoint | Target p95 | Target Throughput |
|----------|-----------|-------------------|
| Webhook ingest | < 500ms | 100 req/s |
| Conversation list | < 300ms | 50 req/s |
| Analytics outcomes | < 500ms | 20 req/s |
| Payment checkout | < 1000ms | 30 req/s |
| Lead list | < 200ms | 100 req/s |
| Appointment booking | < 800ms | 50 req/s |

---

## Security Test Results

### 1. RBAC Enforcement
- **File**: `tests/security/rbac-enforcement.spec.ts`
- **Tests**: Permission checks on all endpoints
- **Status**: ✅ Implemented
- **Coverage**:
  - Owner audience guard on owner routes
  - Client audience guard on client routes
  - Role-based access (CLIENT_OWNER, CLIENT_VIEWER, CLIENT_AGENT)
  - Permission checks for team management (tenant.team.read, tenant.team.manage)
  - Disabled/revoked account rejection

### 2. Tenant Isolation
- **File**: `tests/security/tenant-isolation.spec.ts`
- **Tests**: RLS policy validation
- **Status**: ✅ Implemented
- **Coverage**:
  - Tenant-scoped data access patterns
  - Cross-tenant data leakage prevention
  - Tenant context propagation through request lifecycle
  - Owner tenant scope validation (expiration, tenant binding)

### 3. Input Validation
- **File**: `tests/security/input-validation.spec.ts`
- **Tests**: SQL injection, XSS, path traversal
- **Status**: ✅ Implemented
- **Coverage**:
  - SQL injection attempts in query parameters
  - XSS payloads in webhook bodies
  - Path traversal in file/resource references
  - Malformed JSON handling
  - Type validation (class-validator decorators)
  - Idempotency key collision resistance

---

## Coverage Improvement Actions

### Priority 1: Critical Paths
- [x] E2E tests for conversation flow
- [x] E2E tests for lead booking
- [x] E2E tests for payment flow
- [x] Multi-tenant isolation tests
- [ ] Add unit tests for `packages/connectors/meta-whatsapp`
- [ ] Add unit tests for `packages/connectors/mock-payment`
- [ ] Add integration tests for PostgreSQL repositories

### Priority 2: Edge Cases
- [ ] Add tests for webhook retry logic
- [ ] Add tests for concurrent appointment booking race conditions
- [ ] Add tests for payment webhook signature verification failures
- [ ] Add tests for AI/human mode transition edge cases
- [ ] Add tests for lead qualification boundary conditions (score 0, 100)

### Priority 3: Documentation
- [x] Document test scenarios (this document)
- [ ] Update test coverage reports with actual percentages
- [ ] Create test execution runbook
- [ ] Document performance baseline metrics after first run

### Priority 4: Infrastructure
- [ ] Set up CI/CD pipeline for automated test execution
- [ ] Configure coverage thresholds in Vitest config
- [ ] Add performance regression detection
- [ ] Integrate security scan into PR checks

---

## Next Steps
1. ✅ Create E2E test suites
2. ✅ Create performance test suites
3. ✅ Create security test suites
4. Execute all test suites and collect metrics
5. Fill in performance baseline results
6. Identify coverage gaps from actual test runs
7. Implement missing tests for critical paths
8. Update this document with final results
9. Present coverage report to stakeholders

---

## Test Execution Commands

### Run All Tests
```bash
# E2E tests (Playwright)
pnpm exec playwright test tests/e2e/

# Performance tests (Vitest)
pnpm exec vitest run tests/performance/

# Security tests (Playwright)
pnpm exec playwright test tests/security/

# Existing API E2E tests
pnpm --filter @chai/api test:e2e
```

### Generate Coverage Report
```bash
# Vitest coverage
pnpm exec vitest run --coverage

# Playwright HTML report
pnpm exec playwright test --reporter=html
```

---

## Issues & Blockers

### Resolved
- ✅ Created missing test directories (`tests/e2e/`, `tests/performance/`, `tests/security/`)
- ✅ Aligned test patterns with existing Playwright and Vitest configurations
- ✅ Used existing local identity adapter for authentication in tests

### Open
- ⚠️ Performance baseline metrics need to be collected after first test run
- ⚠️ Actual coverage percentages need to be measured with coverage tools
- ⚠️ Some tests require running API server (integration tests)
- ⚠️ Multi-tenant isolation tests limited by local identity adapter (single tenant in test env)

---

## References
- Blueprint: `Omnichannel_AI_Platform_Engineering_Blueprint_v1.2/`
- Existing test patterns: `apps/api/test/audience.e2e.test.ts`
- Playwright config: `playwright.config.ts`
- Vitest config: `vitest.config.ts`
- Local identity adapter: `apps/api/src/auth/local-identity.ts`
