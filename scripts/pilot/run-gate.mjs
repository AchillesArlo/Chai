/**
 * Stage 1 final verification gate (Task 17).
 * Runs lint → typecheck → test → integration → e2e → smoke → audit.
 * Writes exits to docs/evidence/pilot-<date>/gate-summary.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const date = new Date().toISOString().slice(0, 10);
const evidenceDir = join(process.cwd(), 'docs', 'evidence', `pilot-${date}`);
mkdirSync(evidenceDir, { recursive: true });

const pnpm =
  process.platform === 'win32'
    ? join(process.cwd(), 'node_modules', '.bin', 'pnpm.cmd')
    : join(process.cwd(), 'node_modules', '.bin', 'pnpm');

const steps = [
  { name: 'lint', args: ['lint'] },
  { name: 'typecheck', args: ['typecheck'] },
  { name: 'test', args: ['test'] },
  { name: 'integration', args: ['test:integration'] },
  { name: 'e2e', args: ['test:e2e'] },
  { name: 'smoke', args: ['test:smoke'] },
  { name: 'audit', args: ['audit', '--audit-level=high'] },
];

const results = [];
let failed = false;

for (const step of steps) {
  console.log(`\n=== ${step.name} ===`);
  const run = spawnSync(pnpm, step.args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 20 * 1024 * 1024,
  });
  const exit = run.status ?? 1;
  writeFileSync(
    join(evidenceDir, `${step.name}.log`),
    `${run.stdout ?? ''}\n${run.stderr ?? ''}`,
  );
  results.push({ name: step.name, exit });
  console.log(`${step.name} exit=${exit}`);
  if (exit !== 0) failed = true;
}

const summary = {
  date,
  failed,
  results,
  timestamp: new Date().toISOString(),
};
writeFileSync(
  join(evidenceDir, 'gate-summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
);
console.log(`\nEvidence: ${evidenceDir}`);
process.exitCode = failed ? 1 : 0;
