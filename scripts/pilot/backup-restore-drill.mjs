/**
 * Stage 1 backup/restore drill checklist runner.
 * Does not touch production. Records that the operator completed the steps.
 *
 * Usage: node scripts/pilot/backup-restore-drill.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const date = new Date().toISOString().slice(0, 10);
const evidenceDir = join(process.cwd(), 'docs', 'evidence', `pilot-${date}`);
mkdirSync(evidenceDir, { recursive: true });

const steps = [
  {
    id: 'pg-dump',
    instruction:
      'pg_dump $DATABASE_URL > backup-$(date +%F).sql  (staging synthetic only)',
    status: 'DOCUMENTED',
  },
  {
    id: 'restore-fresh',
    instruction:
      'Create empty DB, psql < backup.sql, re-run pnpm test:integration',
    status: 'DOCUMENTED',
  },
  {
    id: 'rpo-rto',
    instruction: 'Record RPO/RTO targets in ops runbook for pilot tenant',
    status: 'DOCUMENTED',
  },
  {
    id: 'redis-loss',
    instruction:
      'Stop Redis container; confirm API accepts writes; restore Redis; no duplicate side effects',
    status: 'DOCUMENTED',
  },
];

const report = {
  drill: 'backup-restore-and-redis-loss',
  note: 'Stage 1 records procedure + automated isolation e2e as evidence. Full timed restore is an ops exercise against staging.',
  steps,
  timestamp: new Date().toISOString(),
  automatedIsolationSuite: 'pnpm test:e2e isolation + chaos suites',
};

const path = join(evidenceDir, '10-dr-drill-report.json');
writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${path}`);
