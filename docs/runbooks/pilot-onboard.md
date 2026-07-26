# S7 — Pilot Onboard & Outcome Metrics

> **Owner:** Platform Lead + Pilot Customer Success
> **Pilot duration:** 2 weeks (14 days) per tenant
> **Script:** `scripts/pilot/onboard.mjs`
> **Metrics file:** `docs/evidence/pilot-metrics.json`

## Pilot Onboarding Flow

1. **Onboard tenant**:
   ```bash
   node scripts/pilot/onboard.mjs onboard --tenant t-pilot-1 --name "Acme Corp" --plan stage-1
   ```
   This records the tenant and sets a 14-day pilot window.

2. **Provision connectors** (via S2 staging activation):
   - Set `PROVIDER_PAYMENT`, `PROVIDER_CHANNEL`, `PROVIDER_LOGISTICS`, `PROVIDER_CALENDAR`
   - Configure credentials for the pilot tenant

3. **Grant access**: Issue pilot tenant credentials via auth-client login flow

4. **Track metrics**: Record outcome metrics daily throughout the 2-week period

## Outcome Metrics (2-Week Targets)

| Metric | Target | How to measure |
|--------|--------|----------------|
| `conversations` | ≥ 50 | Count of conversations handled by the tenant |
| `aiResolutionRate` | ≥ 40% | % of conversations resolved by AI without human |
| `avgResponseTimeMs` | < 3000ms | Average first-response time (SLA target) |
| `agentSatisfaction` | ≥ 4/5 | Agent satisfaction survey rating |
| `systemUptime` | ≥ 99.5% | Platform uptime during pilot window |
| `slaCompliance` | ≥ 95% | % of events completing within <3s SLA |

## Recording Metrics

```bash
# Record daily metrics for pilot tenant
node scripts/pilot/onboard.mjs record --tenant t-pilot-1 --metric conversations --value 12
node scripts/pilot/onboard.mjs record --tenant t-pilot-1 --metric aiResolutionRate --value 45
node scripts/pilot/onboard.mjs record --tenant t-pilot-1 --metric avgResponseTimeMs --value 1200
node scripts/pilot/onboard.mjs record --tenant t-pilot-1 --metric agentSatisfaction --value 4.2
node scripts/pilot/onboard.mjs record --tenant t-pilot-1 --metric systemUptime --value 99.8
node scripts/pilot/onboard.mjs record --tenant t-pilot-1 --metric slaCompliance --value 97
```

## Reporting

```bash
# Single tenant report
node scripts/pilot/onboard.mjs report --tenant t-pilot-1

# All pilot tenants
node scripts/pilot/onboard.mjs report --all
```

Reports show: status, onboarded date, pilot end date, days remaining, and all recorded metrics vs targets.

## Sign-off Check

After 14 days, run the sign-off readiness check:

```bash
node scripts/pilot/onboard.mjs signoff --tenant t-pilot-1
```

This verifies:
- Pilot duration ≥ 14 days elapsed
- All 6 required metrics recorded

If all checks pass, the tenant status is marked `ready-for-signoff` and the
S8 stage gate document can be completed.

## Pilot Exit Criteria

A pilot tenant graduates to production when:
- ✓ All 6 metrics meet targets
- ✓ Pilot duration ≥ 14 days
- ✓ No P1/P2 incidents in final 7 days
- ✓ Kill switch tested (at least one drill per provider)
- ✓ S8 stage gate sign-off document completed
