# S6 — Provider Kill Switch Runbook

> **Owner:** SRE / Platform Lead
> **Last updated:** 2026-07-24
> **Kill switch implementation:** `packages/connectors/src/kill-switch.ts` (M3)
> **Operation script:** `scripts/pilot/kill-switch.mjs`

## Overview

Each external connector (payment, channel, logistics, calendar) can be
circuit-broken via a 3-layer kill switch. When tripped, the connector
returns a safe fallback or rejects the operation — preventing cascading
failures when a provider degrades.

## The 3 Layers

Any tripped layer trips the switch. Resolution order does not matter —
**all three must be clear** for the connector to be operational.

| Layer | Scope | Persists in | Set by |
|-------|-------|-------------|--------|
| `env` | Global (all tenants) | `KILL_SWITCH_<PROVIDER>=1` env var | Deployment / ops |
| `db` | Per-tenant | `kill-switch-state.json` (DB in prod) | Owner console / support |
| `owner` | Per-provider (all tenants) | `kill-switch-state.json` | Owner console manual |

## Provider Reference

| Provider key | Connector | Env var |
|--------------|-----------|---------|
| `payment` | Midtrans | `KILL_SWITCH_PAYMENT=1` |
| `channel` | WhatsApp Meta | `KILL_SWITCH_CHANNEL=1` |
| `logistics` | JNE | `KILL_SWITCH_LOGISTICS=1` |
| `calendar` | Google Calendar | `KILL_SWITCH_CALENDAR=1` |

## Commands

### Check status

```bash
node scripts/pilot/kill-switch.mjs status
# or for a specific tenant's DB toggle:
node scripts/pilot/kill-switch.mjs status --tenant t-123
```

### Trip a kill switch

```bash
# Owner override — Midtrans is down
node scripts/pilot/kill-switch.mjs trip --provider payment --layer owner --reason "Midtrans outage 2026-07-24"

# Per-tenant DB toggle — tenant t-123 has billing issue
node scripts/pilot/kill-switch.mjs trip --provider channel --layer db --tenant t-123

# Global env kill switch — emergency stop
KILL_SWITCH_PAYMENT=1  # set in deployment env
```

### Clear a kill switch

```bash
node scripts/pilot/kill-switch.mjs clear --provider payment --layer owner
node scripts/pilot/kill-switch.mjs clear --provider channel --layer db --tenant t-123
unset KILL_SWITCH_PAYMENT  # for env layer
```

## Runbook: Provider Outage

### Scenario: Midtrans payment gateway down

1. **Detect**: Monitor shows 5xx spike on Midtrans adapter
2. **Trip**: `kill-switch.mjs trip --provider payment --layer owner --reason "Midtrans 5xx spike"`
3. **Verify**: `kill-switch.mjs status` → payment shows TRIPPED
4. **Impact**: New checkout sessions return `PAYMENT_KILL_SWITCH`; existing sessions
   return their cached status (no provider call)
5. **Communicate**: Notify tenant admins via owner console banner
6. **Monitor provider**: Watch Midtrans status page
7. **Clear when healthy**: `kill-switch.mjs clear --provider payment --layer owner`
8. **Verify**: `kill-switch.mjs status` → payment shows OK

### Scenario: Single-tenant channel issue

1. **Detect**: Tenant t-123 reports WhatsApp delivery failures
2. **Trip**: `kill-switch.mjs trip --provider channel --layer db --tenant t-123`
3. **Impact**: Only tenant t-123's channel is blocked; other tenants unaffected
4. **Investigate**: Check WhatsApp API logs for t-123's credentials
5. **Clear**: `kill-switch.mjs clear --provider channel --layer db --tenant t-123`

## Fallback Behavior

When a kill switch is tripped, each connector falls back:

| Connector | Tripped behavior |
|-----------|------------------|
| Payment (Midtrans) | `createCheckout` throws `PAYMENT_KILL_SWITCH` |
| Channel (WhatsApp) | `sendMessage` returns `safeFallback: true` dry-run result |
| Logistics (JNE) | `createShipment` throws; `trackShipment` returns mock timeline |
| Calendar (Google) | `listAvailability` returns empty slots |

## Verification

The kill switch logic is covered by:
- `packages/connectors/src/__tests__/kill-switch.test.ts` (18 tests)
- `tests/staging/s2-connector-activation.test.ts` (kill switch section)

## State File

The kill switch state is persisted to `docs/evidence/kill-switch-state.json`.
In production, replace this with a Postgres-backed store for durability
across instances.
