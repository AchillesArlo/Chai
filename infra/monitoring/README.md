# Monitoring — Stage 1 pilot

Local/dev observability scaffolding. Production uses a managed OTel backend.

## Files

| Path | Purpose |
|---|---|
| `prometheus.yml` | Scrape targets for API, realtime, workers |
| `alerts.yml` | Page/ticket rules from the SRE runbook |
| `otel-collector.yaml` | Collector pipeline skeleton |

## Local loop

```bash
# with compose stack running:
# point Prometheus at infra/monitoring/prometheus.yml
```

## Pilot gate checks

- Cross-tenant exposure alert is paging-severity.
- Queue lag and webhook failure burn rate are ticket-or-page by impact.
- Dashboard freshness indicators exist on owner reliability + client analytics UIs.
