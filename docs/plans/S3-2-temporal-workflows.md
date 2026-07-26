# S3-2: Temporal Durable Workflows

> Stage 3, Workstream S3-2 — Replaces SKIP LOCKED claim-loop pattern with Temporal durable execution.

## Overview

This workstream introduces Temporal.io as the durable execution engine for three critical business processes:

| Workflow | ID Prefix | Task Queue | Replaces |
|----------|-----------|------------|----------|
| Follow-Up Job Processing | `follow-up-{tenantId}-{jobId}` | `follow-up-queue` | automation-worker SKIP LOCKED |
| Payment Reconciliation | `payment-reconcile-{tenantId}-{externalId}` | `payment-reconcile-queue` | payment-worker SKIP LOCKED |
| Logistics Status Polling | `logistics-poll-{tenantId}-{orderId}` | `logistics-poll-queue` | logistics-worker SKIP LOCKED |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       API / Triggers                         │
│  (startFollowUpWorkflow / startPaymentReconcileWorkflow /   │
│   startLogisticsPollWorkflow)                                │
└──────────────────────────┬──────────────────────────────────┘
                           │ Temporal Client
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Temporal Server                            │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ follow-up-   │  │ payment-reconcile│  │ logistics-   │  │
│  │ queue        │  │ -queue           │  │ poll-queue   │  │
│  └──────┬───────┘  └────────┬─────────┘  └──────┬───────┘  │
└─────────┼───────────────────┼────────────────────┼──────────┘
          │                   │                    │
          ▼                   ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│              Temporal Worker (chai-main-queue)               │
│  ┌────────────────┐ ┌──────────────────┐ ┌───────────────┐  │
│  │ Follow-Up      │ │ Payment          │ │ Logistics     │  │
│  │ Activities     │ │ Activities       │ │ Activities    │  │
│  └───────┬────────┘ └────────┬─────────┘ └──────┬────────┘  │
└──────────┼───────────────────┼───────────────────┼──────────┘
           │                   │                   │
           ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│              Domain Functions (@chai/connectors)              │
│  executeAutomation    pollAndReconcile    pollAndAdvance     │
└─────────────────────────────────────────────────────────────┘
```

## Workflow Definitions

### FollowUpWorkflow (`follow-up.workflow.ts`)

Processes follow-up jobs triggered by automation rules.

**Input:**
```typescript
{
  tenantId: string;
  jobId: string;
  automationRuleId: string;
  triggerEvent: { type: string; timestamp: string; payload: Record<string, unknown> };
}
```

**Output:**
```typescript
{
  jobId: string;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  executedAt: string;
  error?: string;
}
```

**Retry Policy:** 3 attempts, exponential backoff (1s initial, 2x coefficient)

### PaymentReconcileWorkflow (`payment-reconcile.workflow.ts`)

Reconciles payment sessions by polling provider status. Implements stop-on-paid pattern.

**Input:**
```typescript
{
  tenantId: string;
  externalId: string;
  maxAttempts?: number;       // default: 10
  pollIntervalSeconds?: number; // default: 30
}
```

**Output:**
```typescript
{
  externalId: string;
  status: string;
  terminal: boolean;
  attempts: number;
  reconciledAt: string;
}
```

**Retry Policy:** 5 attempts per activity, exponential backoff

### LogisticsPollWorkflow (`logistics-poll.workflow.ts`)

Polls logistics status until delivery or max polls reached. Uses Temporal's durable timer.

**Input:**
```typescript
{
  tenantId: string;
  orderId: string;
  maxPolls?: number;           // default: 20
  pollIntervalSeconds?: number; // default: 60
}
```

**Output:**
```typescript
{
  orderId: string;
  finalStatus: string;
  pollsPerformed: number;
  lastPolledAt: string;
}
```

**Retry Policy:** 5 attempts per activity, exponential backoff

## Task Queue Configuration

| Queue | Purpose | Worker Concurrency | Timeout |
|-------|---------|-------------------|---------|
| `chai-main-queue` | All workflows (unified) | 10 per worker | 5 min |
| `follow-up-queue` | Follow-up workflows | — | — |
| `payment-reconcile-queue` | Payment reconciliation | — | — |
| `logistics-poll-queue` | Logistics polling | — | — |

**Note:** The current implementation uses a single unified task queue (`chai-main-queue`) for simplicity. The named queues are defined as constants for future migration to dedicated workers per domain.

## Docker Compose Services

Three new services added to `infra/staging/docker-compose.yml`:

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `temporal` | `temporalio/auto-setup:1.26` | 7233 | Temporal server (auto-setup with PostgreSQL) |
| `temporal-ui` | `temporalio/ui:2.34` | 8080 | Web UI for workflow monitoring |
| `temporal-worker` | Custom (Dockerfile.dev) | — | Worker process executing workflows |

## Monitoring

### Temporal Web UI
Access at `http://localhost:8080` (staging) to:
- View workflow execution history
- Inspect activity attempts and failures
- Search workflows by ID, type, or status
- Cancel or signal running workflows

### Health Checks
- Temporal server: `temporal workflow list --address localhost:7233`
- Temporal UI: `GET http://localhost:8080`
- Temporal worker: Process check via `pgrep -f "tsx src/worker.ts"`

## Deployment

### Prerequisites
1. PostgreSQL must be running (Temporal uses it for persistence)
2. `pnpm install` must include `@temporalio/*` packages

### Steps
```bash
# Start Temporal infrastructure
docker compose -f infra/staging/docker-compose.yml up -d temporal temporal-ui

# Wait for Temporal to be healthy
docker compose -f infra/staging/docker-compose.yml ps temporal

# Start Temporal worker
docker compose -f infra/staging/docker-compose.yml up -d temporal-worker

# Verify worker is running
docker compose -f infra/staging/docker-compose.yml logs temporal-worker
```

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal server gRPC address |
| `TEMPORAL_NAMESPACE` | `default` | Temporal namespace |
| `TEMPORAL_PORT` | `7233` | Host port for Temporal |
| `TEMPORAL_UI_PORT` | `8080` | Host port for Temporal UI |

## Migration Path

### Phase 1 (Current): Parallel Operation
- Temporal workflows run alongside existing SKIP LOCKED workers
- Both systems process jobs; deduplication via workflow IDs

### Phase 2: Traffic Shifting
- Gradually route new jobs to Temporal workflows
- Existing workers handle backlog

### Phase 3: Full Cutover
- Disable SKIP LOCKED workers
- Temporal becomes sole execution engine

## Backward Compatibility

- Existing workers (`automation-worker`, `payment-worker`, `logistics-worker`) are **NOT modified**
- Temporal workflows call the same domain functions via `@chai/connectors`
- Workflow IDs include tenant and entity IDs for deterministic deduplication
