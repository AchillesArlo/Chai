/**
 * Temporal Worker process.
 * Registers all workflows and activities, configures task queues, and handles graceful shutdown.
 *
 * Usage:
 *   tsx src/worker.ts
 *
 * Environment variables:
 *   TEMPORAL_ADDRESS  - Temporal server address (default: localhost:7233)
 *   TEMPORAL_NAMESPACE - Temporal namespace (default: default)
 */

import { Worker } from '@temporalio/worker';
import * as workflows from './workflows/index.js';
import * as followUpActivities from './activities/follow-up.activities.js';
import * as paymentActivities from './activities/payment.activities.js';
import * as logisticsActivities from './activities/logistics.activities.js';
// TASK_QUEUES reserved for future per-domain queue routing
import { TASK_QUEUES } from './types.js';

void TASK_QUEUES;

const TEMPORAL_ADDRESS = process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233';
const TEMPORAL_NAMESPACE = process.env['TEMPORAL_NAMESPACE'] ?? 'default';

async function runWorker(): Promise<void> {
  console.log('[TemporalWorker] Starting worker...', {
    address: TEMPORAL_ADDRESS,
    namespace: TEMPORAL_NAMESPACE,
  });

// workflows are discovered at runtime by Temporal via workflowsPath
void workflows;

const worker = await Worker.create({
    workflowsPath: new URL('./workflows/index.js', import.meta.url).href,
    activities: {
      ...followUpActivities,
      ...paymentActivities,
      ...logisticsActivities,
    },
    taskQueue: 'chai-main-queue',
    identity: `chai-temporal-worker-${process.pid}`,
    namespace: TEMPORAL_NAMESPACE,
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[TemporalWorker] Received ${signal}, shutting down gracefully...`);
    worker.shutdown();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  console.log('[TemporalWorker] Worker started, listening for tasks...');
  await worker.run();
  console.log('[TemporalWorker] Worker shut down cleanly.');
}

runWorker().catch((error) => {
  console.error('[TemporalWorker] Fatal error:', error);
  process.exit(1);
});
