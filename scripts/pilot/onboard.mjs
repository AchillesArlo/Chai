/**
 * S7: Pilot Onboard + Outcome Metrics Tracker (2 weeks)
 *
 * Records pilot tenant onboarding and tracks outcome metrics over a 2-week
 * pilot period. Writes results to docs/evidence/pilot-metrics.json.
 *
 * Usage:
 *   node scripts/pilot/onboard.mjs onboard --tenant t-pilot-1 --name "Acme Corp" --plan stage-1
 *   node scripts/pilot/onboard.mjs record --tenant t-pilot-1 --metric conversations --value 42
 *   node scripts/pilot/onboard.mjs report --tenant t-pilot-1
 *   node scripts/pilot/onboard.mjs report --all
 *   node scripts/pilot/onboard.mjs signoff --tenant t-pilot-1
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const EVIDENCE_DIR = join(process.cwd(), 'docs', 'evidence');
const METRICS_FILE = join(EVIDENCE_DIR, 'pilot-metrics.json');
const PILOT_DURATION_DAYS = 14;

const TARGET_METRICS = {
  conversations: { goal: '>=50', unit: 'count', description: 'Conversations handled' },
  aiResolutionRate: { goal: '>=40%', unit: 'percent', description: 'AI-resolved without human' },
  avgResponseTimeMs: { goal: '<3000', unit: 'ms', description: 'Avg first response time' },
  agentSatisfaction: { goal: '>=4/5', unit: 'rating', description: 'Agent satisfaction score' },
  systemUptime: { goal: '>=99.5%', unit: 'percent', description: 'Platform uptime during pilot' },
  slaCompliance: { goal: '>=95%', unit: 'percent', description: 'Events within <3s SLA' },
};

function loadState() {
  if (existsSync(METRICS_FILE)) {
    return JSON.parse(readFileSync(METRICS_FILE, 'utf8'));
  }
  return { metrics: {}, tenants: {} };
}

function saveState(state) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(METRICS_FILE, JSON.stringify(state, null, 2));
}

function cmdOnboard(args) {
  const state = loadState();
  const { tenant, name, plan } = args;

  if (!tenant) {
    console.error('--tenant required');
    process.exit(1);
  }

  state.tenants[tenant] = {
    name: name || tenant,
    onboardedAt: new Date().toISOString(),
    plan: plan || 'stage-1',
    pilotEndsAt: new Date(Date.now() + PILOT_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
  };

  state.metrics[tenant] = {};
  saveState(state);
  console.log(`✓ Onboarded pilot tenant: ${name || tenant} (${tenant})`);
  console.log(`  Plan: ${plan || 'stage-1'}`);
  console.log(`  Pilot ends: ${state.tenants[tenant].pilotEndsAt}`);
}

function cmdRecord(args) {
  const state = loadState();
  const { tenant, metric, value } = args;

  if (!tenant || !metric || value === undefined) {
    console.error('--tenant, --metric, and --value required');
    process.exit(1);
  }
  if (!state.tenants[tenant]) {
    console.error(`Tenant ${tenant} not onboarded. Run onboard first.`);
    process.exit(1);
  }

  const numericValue = Number(value);
  state.metrics[tenant][metric] = {
    recordedAt: new Date().toISOString(),
    value: numericValue,
  };

  saveState(state);
  const target = TARGET_METRICS[metric];
  console.log(`✓ Recorded ${metric}=${numericValue} for ${tenant}`);
  if (target) console.log(`  Target: ${target.goal}`);
}

function cmdReport(args) {
  const state = loadState();
  const { tenant } = args;

  if (args.all) {
    console.log('\n=== Pilot Metrics Report (All Tenants) ===\n');
    for (const [tid, info] of Object.entries(state.tenants || {})) {
      reportTenant(tid, info, state.metrics[tid] || {});
    }
  } else if (tenant) {
    const info = state.tenants?.[tenant];
    if (!info) {
      console.error(`Tenant ${tenant} not found`);
      process.exit(1);
    }
    reportTenant(tenant, info, state.metrics[tenant] || {});
  } else {
    console.error('Use --tenant <id> or --all');
    process.exit(1);
  }
}

function reportTenant(tid, info, metrics) {
  console.log(`\n--- ${info.name} (${tid}) ---`);
  console.log(`  Status: ${info.status}`);
  console.log(`  Onboarded: ${info.onboardedAt}`);
  console.log(`  Pilot ends: ${info.pilotEndsAt}`);

  const now = Date.now();
  const ends = new Date(info.pilotEndsAt).getTime();
  const daysRemaining = Math.max(0, Math.ceil((ends - now) / (24 * 60 * 60 * 1000)));
  console.log(`  Days remaining: ${daysRemaining}`);

  if (Object.keys(metrics).length === 0) {
    console.log('  No metrics recorded yet.');
    return;
  }

  console.log('\n  Metrics:');
  for (const [metric, record] of Object.entries(metrics)) {
    const target = TARGET_METRICS[metric];
    const targetStr = target ? ` (target: ${target.goal})` : '';
    console.log(`    ${metric.padEnd(22)} ${record.value}${targetStr}`);
  }
  console.log('');
}

function cmdSignoff(args) {
  const state = loadState();
  const { tenant } = args;

  if (!tenant) {
    console.error('--tenant required');
    process.exit(1);
  }

  const info = state.tenants?.[tenant];
  if (!info) {
    console.error(`Tenant ${tenant} not found`);
    process.exit(1);
  }

  const metrics = state.metrics[tenant] || {};
  const checks = [];

  // Verify pilot duration elapsed
  const now = Date.now();
  const ends = new Date(info.pilotEndsAt).getTime();
  const daysElapsed = Math.floor((now - new Date(info.onboardedAt).getTime()) / (24 * 60 * 60 * 1000));
  checks.push({
    name: 'Pilot duration (>=14 days)',
    passed: daysElapsed >= PILOT_DURATION_DAYS,
    value: `${daysElapsed} days`,
  });

  // Verify required metrics recorded
  for (const metric of Object.keys(TARGET_METRICS)) {
    const recorded = metrics[metric];
    checks.push({
      name: `Metric recorded: ${metric}`,
      passed: recorded !== undefined,
      value: recorded ? String(recorded.value) : 'missing',
    });
  }

  console.log(`\n=== Sign-off Check: ${info.name} (${tenant}) ===\n`);
  let allPassed = true;
  for (const check of checks) {
    const status = check.passed ? '✓' : '✗';
    console.log(`  ${status} ${check.name}: ${check.value}`);
    if (!check.passed) allPassed = false;
  }

  console.log('');
  if (allPassed) {
    console.log('✓ PILOT READY FOR SIGN-OFF');
    state.tenants[tenant].status = 'ready-for-signoff';
    state.tenants[tenant].signoffCheckedAt = new Date().toISOString();
    saveState(state);
  } else {
    console.log('✗ Pilot not ready — resolve failing checks above');
    process.exit(1);
  }
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const args = { cmd };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag.startsWith('--')) {
      const key = flag.slice(2);
      const val = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
      args[key] = val;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
switch (args.cmd) {
  case 'onboard':
    cmdOnboard(args);
    break;
  case 'record':
    cmdRecord(args);
    break;
  case 'report':
    cmdReport(args);
    break;
  case 'signoff':
    cmdSignoff(args);
    break;
  default:
    console.log(`Usage: node scripts/pilot/onboard.mjs <command> [options]

Commands:
  onboard --tenant <id> [--name <n>] [--plan <p>]
  record  --tenant <id> --metric <m> --value <v>
  report  --tenant <id> | --all
  signoff --tenant <id>

Target metrics (record each over the 2-week pilot):
${Object.entries(TARGET_METRICS).map(([k, v]) => `  ${k.padEnd(22)} ${v.goal}  (${v.description})`).join('\n')}
`);
}
