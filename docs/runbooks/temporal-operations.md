# Temporal Operations Runbook

> Operational procedures for monitoring and managing Temporal workflows in Chai staging/production.

## Quick Reference

| Service | URL | Health Check |
|---------|-----|--------------|
| Temporal Server | `localhost:7233` | `temporal workflow list --address localhost:7233` |
| Temporal UI | `http://localhost:8080` | `curl http://localhost:8080` |
| Temporal Worker | Docker container | `docker compose ps temporal-worker` |

## Monitoring Workflows

### View All Running Workflows

**Via Temporal UI:**
1. Navigate to `http://localhost:8080`
2. Select namespace: `default`
3. Filter by status: `Running`

**Via CLI:**
```bash
temporal workflow list --address localhost:7233 --status Running
```

### View Specific Workflow

**By Workflow ID:**
```bash
temporal workflow describe \
  --workflow-id follow-up-tenant_123-job_456 \
  --address localhost:7233
```

**View Execution History:**
```bash
temporal workflow show \
  --workflow-id payment-reconcile-tenant_123-ext_789 \
  --address localhost:7233
```

### Monitor Workflow Metrics

**Check worker logs:**
```bash
docker compose -f infra/staging/docker-compose.yml logs -f temporal-worker
```

**Check Temporal server logs:**
```bash
docker compose -f infra/staging/docker-compose.yml logs -f temporal
```

## Handling Stuck Workflows

### Identify Stuck Workflows

Workflows stuck for > 1 hour without progress:

```bash
# List workflows running for more than 1 hour
temporal workflow list \
  --address localhost:7233 \
  --status Running \
  --query 'StartTime < "2024-01-01T00:00:00Z"'
```

### Cancel a Stuck Workflow

```bash
temporal workflow cancel \
  --workflow-id <workflow-id> \
  --address localhost:7233
```

**Example:**
```bash
temporal workflow cancel \
  --workflow-id logistics-poll-tenant_123-order_456 \
  --address localhost:7233
```

### Terminate a Workflow (Force Kill)

Use only when cancel doesn't work:

```bash
temporal workflow terminate \
  --workflow-id <workflow-id> \
  --reason "Stuck workflow - manual intervention" \
  --address localhost:7233
```

## Retrying Failed Workflows

### View Failed Workflows

```bash
temporal workflow list \
  --address localhost:7233 \
  --status Failed
```

### Reset a Failed Workflow

Reset to last successful state and retry:

```bash
temporal workflow reset \
  --workflow-id <workflow-id> \
  --reset-type LastWorkflowTask \
  --address localhost:7233
```

### Start a New Workflow with Same Input

If reset doesn't work, start a fresh workflow:

**Follow-Up:**
```typescript
import { startFollowUpWorkflow } from '@chai/worker-temporal';

await startFollowUpWorkflow({
  tenantId: 'tenant_123',
  jobId: 'job_456',
  automationRuleId: 'rule_789',
  triggerEvent: { ... },
});
```

**Payment Reconciliation:**
```typescript
import { startPaymentReconcileWorkflow } from '@chai/worker-temporal';

await startPaymentReconcileWorkflow({
  tenantId: 'tenant_123',
  externalId: 'payment_ext_456',
  maxAttempts: 10,
  pollIntervalSeconds: 30,
});
```

**Logistics Polling:**
```typescript
import { startLogisticsPollWorkflow } from '@chai/worker-temporal';

await startLogisticsPollWorkflow({
  tenantId: 'tenant_123',
  orderId: 'order_789',
  maxPolls: 20,
  pollIntervalSeconds: 60,
});
```

## Common Issues and Fixes

### Issue 1: Worker Not Connecting to Temporal

**Symptoms:**
- Worker logs show connection timeout
- No workflows executing

**Diagnosis:**
```bash
# Check Temporal server health
docker compose -f infra/staging/docker-compose.yml ps temporal

# Check network connectivity
docker compose -f infra/staging/docker-compose.yml exec temporal-worker \
  wget --spider http://temporal:7233
```

**Fix:**
```bash
# Restart Temporal server
docker compose -f infra/staging/docker-compose.yml restart temporal

# Wait for healthy status
docker compose -f infra/staging/docker-compose.yml ps temporal

# Restart worker
docker compose -f infra/staging/docker-compose.yml restart temporal-worker
```

### Issue 2: Activity Timeout

**Symptoms:**
- Workflow shows activity timeout errors
- Activity retrying repeatedly

**Diagnosis:**
```bash
temporal workflow show \
  --workflow-id <workflow-id> \
  --address localhost:7233
```

Look for `ActivityTaskTimedOut` events.

**Fix:**
1. Check if the underlying service is slow/down
2. Increase `startToCloseTimeout` in workflow definition if needed
3. Reset workflow to retry with backoff

### Issue 3: Workflow Stuck in Timer

**Symptoms:**
- Workflow shows `TimerStarted` but no progress
- Long-running workflows (payment/logistics) appear stuck

**Diagnosis:**
```bash
temporal workflow describe \
  --workflow-id <workflow-id> \
  --address localhost:7233
```

Check `PendingActivities` and `PendingTimers`.

**Fix:**
- This is normal behavior for polling workflows
- Verify `pollIntervalSeconds` configuration
- If truly stuck, cancel and restart workflow

### Issue 4: Duplicate Workflow Execution

**Symptoms:**
- Multiple workflows with same ID
- Duplicate processing

**Diagnosis:**
```bash
temporal workflow list \
  --address localhost:7233 \
  --query 'WorkflowId = "follow-up-tenant_123-job_456"'
```

**Fix:**
- Workflow IDs are deterministic (include tenant + entity ID)
- Temporal prevents duplicate execution automatically
- If duplicates exist, cancel older instances:

```bash
temporal workflow cancel \
  --workflow-id <old-workflow-id> \
  --address localhost:7233
```

### Issue 5: Temporal UI Not Accessible

**Symptoms:**
- Cannot access `http://localhost:8080`

**Diagnosis:**
```bash
docker compose -f infra/staging/docker-compose.yml ps temporal-ui
docker compose -f infra/staging/docker-compose.yml logs temporal-ui
```

**Fix:**
```bash
docker compose -f infra/staging/docker-compose.yml restart temporal-ui
```

## Emergency Procedures

### Complete System Restart

```bash
# Stop all Temporal services
docker compose -f infra/staging/docker-compose.yml stop temporal temporal-ui temporal-worker

# Start in order
docker compose -f infra/staging/docker-compose.yml up -d temporal
sleep 10  # Wait for Temporal server
docker compose -f infra/staging/docker-compose.yml up -d temporal-ui temporal-worker
```

### Database Corruption Recovery

If Temporal's PostgreSQL tables are corrupted:

1. **Stop all Temporal services**
2. **Backup current state:**
   ```bash
   docker compose -f infra/staging/docker-compose.yml exec postgres \
     pg_dump -U chai_admin chai > temporal-backup-$(date +%Y%m%d).sql
   ```
3. **Drop Temporal tables:**
   ```bash
   docker compose -f infra/staging/docker-compose.yml exec postgres \
     psql -U chai_admin chai -c "DROP SCHEMA temporal CASCADE;"
   ```
4. **Restart Temporal (auto-setup will recreate schema):**
   ```bash
   docker compose -f infra/staging/docker-compose.yml restart temporal
   ```

**Note:** This will lose all workflow history. Running workflows will need to be restarted manually.

## Performance Tuning

### Adjust Worker Concurrency

Edit `infra/staging/docker-compose.yml`:

```yaml
temporal-worker:
  environment:
    TEMPORAL_WORKER_CONCURRENCY: "20"  # Increase for higher throughput
```

### Adjust Task Queue Concurrency

Modify workflow definitions in `workers/temporal/src/workflows/`:

```typescript
const worker = await Worker.create({
  taskQueue: 'follow-up-queue',
  maxConcurrentActivityTaskExecutions: 20,  // Increase
});
```

## Contact and Escalation

| Issue | Severity | Contact |
|-------|----------|---------|
| Worker down | P2 | On-call engineer |
| Temporal server down | P1 | Platform team |
| Workflow stuck > 24h | P3 | Business owner |
| Data inconsistency | P1 | Platform team + DBA |

## Additional Resources

- [Temporal Documentation](https://docs.temporal.io/)
- [Temporal TypeScript SDK](https://typescript.temporal.io/)
- Internal: `docs/plans/S3-2-temporal-workflows.md`
