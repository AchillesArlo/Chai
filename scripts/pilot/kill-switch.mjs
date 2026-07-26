/**
 * S6: Provider Kill Switch Runbook Script
 *
 * Operates the 3-layer kill switch (env / db / owner) for each provider.
 * Usage:
 *   node scripts/pilot/kill-switch.mjs status
 *   node scripts/pilot/kill-switch.mjs trip --provider payment --layer owner --reason "Midtrans outage"
 *   node scripts/pilot/kill-switch.mjs trip --provider channel --layer db --tenant tenant-123
 *   node scripts/pilot/kill-switch.mjs clear --provider payment --layer owner
 *   node scripts/pilot/kill-switch.mjs clear --provider channel --layer db --tenant tenant-123
 *
 * Writes the kill switch state to docs/evidence/kill-switch-state.json
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const EVIDENCE_DIR = join(process.cwd(), 'docs', 'evidence');
const STATE_FILE = join(EVIDENCE_DIR, 'kill-switch-state.json');

const PROVIDERS = ['payment', 'channel', 'logistics', 'calendar'];
const LAYERS = ['env', 'db', 'owner'];

function loadState() {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  }
  return { dbToggles: {}, ownerToggles: {}, tripped: {} };
}

function saveState(state) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function isEnvTripped(state, provider) {
  return state.envToggles?.[provider] === true;
}

function isDbTripped(state, provider, tenantId) {
  const key = `${tenantId}:${provider}`;
  return state.dbToggles[key] === true;
}

function isOwnerTripped(state, provider) {
  return state.ownerToggles[provider]?.tripped === true;
}

function isTripped(state, provider, tenantId) {
  return (
    isEnvTripped(state, provider) ||
    isDbTripped(state, provider, tenantId) ||
    isOwnerTripped(state, provider)
  );
}

function cmdStatus(args) {
  const state = loadState();
  const tenantId = args.tenant;
  console.log('\n=== Kill Switch Status ===\n');
  for (const provider of PROVIDERS) {
    const tripped = isTripped(state, provider, tenantId);
    const sources = [];
    if (isEnvTripped(state, provider)) sources.push('env');
    if (tenantId && isDbTripped(state, provider, tenantId)) sources.push(`db:${tenantId}`);
    if (isOwnerTripped(state, provider)) sources.push(`owner (${state.ownerToggles[provider]?.reason})`);
    const status = tripped ? 'TRIPPED' : 'OK';
    const detail = sources.length > 0 ? ` [${sources.join(', ')}]` : '';
    console.log(`  ${provider.padEnd(12)} ${status}${detail}`);
  }
  console.log('');
}

function cmdTrip(args) {
  const state = loadState();
  const { provider, layer, reason, tenant } = args;

  if (!PROVIDERS.includes(provider)) {
    console.error(`Unknown provider: ${provider}. Valid: ${PROVIDERS.join(', ')}`);
    process.exit(1);
  }
  if (!LAYERS.includes(layer)) {
    console.error(`Unknown layer: ${layer}. Valid: ${LAYERS.join(', ')}`);
    process.exit(1);
  }

  if (layer === 'env') {
    state.envToggles = state.envToggles || {};
    state.envToggles[provider] = true;
    console.log(`✓ Tripped ENV kill switch for ${provider}`);
  } else if (layer === 'db') {
    if (!tenant) {
      console.error('DB layer requires --tenant');
      process.exit(1);
    }
    state.dbToggles[`${tenant}:${provider}`] = true;
    console.log(`✓ Tripped DB kill switch for ${provider} (tenant: ${tenant})`);
  } else if (layer === 'owner') {
    state.ownerToggles[provider] = { reason: reason || 'Manual override', tripped: true };
    console.log(`✓ Tripped OWNER kill switch for ${provider}: ${reason || 'Manual override'}`);
  }

  saveState(state);
  cmdStatus(args);
}

function cmdClear(args) {
  const state = loadState();
  const { provider, layer, tenant } = args;

  if (layer === 'env') {
    state.envToggles = state.envToggles || {};
    delete state.envToggles[provider];
    console.log(`✓ Cleared ENV kill switch for ${provider}`);
  } else if (layer === 'db') {
    if (!tenant) {
      console.error('DB layer requires --tenant');
      process.exit(1);
    }
    delete state.dbToggles[`${tenant}:${provider}`];
    console.log(`✓ Cleared DB kill switch for ${provider} (tenant: ${tenant})`);
  } else if (layer === 'owner') {
    delete state.ownerToggles[provider];
    console.log(`✓ Cleared OWNER kill switch for ${provider}`);
  }

  saveState(state);
  cmdStatus(args);
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
  case 'status':
    cmdStatus(args);
    break;
  case 'trip':
    cmdTrip(args);
    break;
  case 'clear':
    cmdClear(args);
    break;
  default:
    console.log(`Usage: node scripts/pilot/kill-switch.mjs <status|trip|clear> [options]
  status                                    Show kill switch state for all providers
  trip --provider <p> --layer <l> [--reason <r>] [--tenant <t>]
  clear --provider <p> --layer <l> [--tenant <t>]

Providers: ${PROVIDERS.join(', ')}
Layers:    ${LAYERS.join(', ')}

Examples:
  kill-switch.mjs status
  kill-switch.mjs trip --provider payment --layer owner --reason "Midtrans outage"
  kill-switch.mjs trip --provider channel --layer db --tenant t-123
  kill-switch.mjs clear --provider payment --layer owner
`);
}
