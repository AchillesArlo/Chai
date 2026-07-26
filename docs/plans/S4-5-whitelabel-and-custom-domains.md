# S4-5: White-label + Custom Domains

> Status: ✅ COMPLETE  
> Created: 2026-07-21  
> Migration: `0017_whitelabel_and_themes.sql`

## Overview

Stage 4 Workstream S4-5 (FUL-03) implements white-label capabilities and custom
domain support. Tenants can configure their own branding (colors, fonts, logos)
and optionally map custom domains to their client portal. The system handles
domain verification, SSL provisioning, and theme injection at runtime.

## Database Schema

Migration `0017_whitelabel_and_themes.sql` creates two tables under RLS:

- `custom_domain` — tenant-owned custom domains with verification tokens, status
  (PENDING/VERIFIED/ACTIVE/SUSPENDED), and SSL status (PENDING/PROVISIONING/ACTIVE/FAILED).
  Each domain gets a unique verification token (`verify_` + UUID) that must be added
  as a DNS TXT record to prove ownership.
- `theme_settings` — per-tenant theme configuration (one row per tenant) with brand
  name, logo/favicon URLs, primary/secondary/accent colors, font family, custom CSS,
  and header/footer HTML snippets.

Both tables enforce tenant isolation via RLS policies using `current_tenant_id()`.

## Domain Layer

No new domain package — whitelabel concepts are API-layer primitives that delegate
directly to the repository. Theme colors are validated at the API layer (hex format).

## API Module

`apps/api/src/modules/whitelabel/` exposes the whitelabel and custom domain APIs:

- `whitelabel.repository.ts` — abstract `WhitelabelRepository` port plus
  `InMemoryWhitelabelRepository` (no-DB / tests) and `PostgresWhitelabelRepository`
  that delegates to the database via `withTenantTransaction`.
- `whitelabel.controller.ts` — 6 endpoints across two resource groups.
- `whitelabel.module.ts` — factory swap: picks Postgres when `DATABASE_URL` is
  bound, otherwise in-memory.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/whitelabel/domains?tenantId=` | Add custom domain |
| GET | `/api/v1/whitelabel/domains?tenantId=` | List domains for tenant |
| GET | `/api/v1/whitelabel/domains/:id?tenantId=` | Get domain by ID |
| PUT | `/api/v1/whitelabel/domains/:id?tenantId=` | Update domain status |
| DELETE | `/api/v1/whitelabel/domains/:id?tenantId=` | Remove domain |
| GET | `/api/v1/whitelabel/themes?tenantId=` | Get theme for tenant |
| PUT | `/api/v1/whitelabel/themes?tenantId=` | Create/update theme |

## Custom Domain Flow

1. Tenant adds a custom domain via POST with `domain` (e.g., `portal.acme.com`).
2. System generates a verification token (`verify_` + UUID) and stores it with
   the domain record. Status is PENDING.
3. Tenant adds a DNS TXT record: `chai-verification=<token>` to prove ownership.
4. System verifies via DNS lookup (future work: background worker). On success,
   status transitions to VERIFIED.
5. System provisions SSL certificate via Let's Encrypt (future work). On success,
   SSL status transitions to ACTIVE, domain status to ACTIVE.
6. Tenant's custom domain is now live and routes to their client portal.

## Theme Engine Flow

1. Tenant configures theme via PUT `/themes` with brand name, colors, fonts, etc.
2. Theme is stored in `theme_settings` (one row per tenant).
3. When a request hits the client portal:
   - `apps/client-portal/src/middleware.ts` detects if the request is from a custom
     domain (via `Host` header).
   - If custom domain, middleware looks up the domain record and fetches the theme.
   - Middleware rewrites the request to `/custom-portal/[...path]` and injects theme
     data into request headers (`x-theme-primary`, `x-theme-brand`, etc.).
   - The custom portal route reads theme from headers and applies it.
4. `apps/client-portal/src/components/ThemeProvider.tsx` — React context that:
   - Reads theme from headers (custom domain) or fetches from API (default portal).
   - Injects CSS variables (`--color-primary`, etc.) into `:root`.
   - Updates favicon and injects custom CSS into `<head>`.

## Testing

- `apps/api/test/integration/whitelabel.integration.test.ts` — 10 test cases
  covering domain CRUD, theme upsert, tenant isolation, and error paths.

## Future Work

- DNS verification worker (periodic check for TXT records)
- SSL certificate provisioning worker (Let's Encrypt integration)
- Theme preview endpoint (render portal with draft theme)
- Theme templates (pre-built themes for common industries)
- Custom domain analytics (traffic, SSL status, verification failures)
