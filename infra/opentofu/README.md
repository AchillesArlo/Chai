# OpenTofu — Stage 1 pilot skeleton

Minimal infrastructure-as-code layout for the Stage 1 pilot gate.
No live cloud credentials in this repo.

## Layout

| Path | Purpose |
|---|---|
| `main.tf` | Provider versions and locals |
| `variables.tf` | Environment inputs (no secrets) |
| `outputs.tf` | Stable outputs for compose/CI wiring |

## Usage (later environments)

```bash
cd infra/opentofu
tofu init
tofu plan -var="environment=staging"
```

## Rules

- Secrets come from a secret manager / CI injection, never committed.
- Pin provider and module versions; never use `latest`.
- Production images use digests, not floating tags.
- Postgres and Redis are managed services in staging/production; compose is local only.
