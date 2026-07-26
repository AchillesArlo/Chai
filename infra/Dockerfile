# syntax=docker/dockerfile:1

# =============================================================================
# Chai production image — one image, many entrypoints.
#
# Every long-running service (api, realtime-gateway, the dispatchers, the
# analytics worker, and the Next.js frontends) runs from this single image; the
# compose files override `command:` per service. The default CMD and the
# HEALTHCHECK target the API — the primary HTTP service — and compose overrides
# the healthcheck for non-HTTP services (dispatchers use pgrep, etc.).
#
# ponytail: a single shared image keeps the compose build matrix small and the
# layer cache hot. Known ceiling: the runtime carries every workspace's deps
# plus the tsx runner the source-run workers need, so it is not minimal. The
# upgrade path when image size matters is per-service `pnpm deploy --prod`
# bundles (one thin image each) driven off this same build stage.
# =============================================================================

# Pinned base: explicit patch tag, never :latest, so builds are reproducible and
# never silently jump Node versions. Satisfies engines ">=24.12.0 <25".
FROM node:24.12.0-alpine AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    CI="true"
# corepack ships with Node; pin pnpm to the repo's packageManager version.
RUN corepack enable && corepack prepare pnpm@11.13.1 --activate
WORKDIR /app

# -----------------------------------------------------------------------------
# deps — restore the pnpm store from the FROZEN lockfile alone. Copying only the
# lockfile keeps this (slow, network-bound) layer cached until deps change.
# -----------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml ./
RUN pnpm fetch

# -----------------------------------------------------------------------------
# build — install the whole workspace OFFLINE against the fetched store with a
# frozen lockfile, then turbo-build every package (api -> dist/main.js via
# esbuild, the Next.js apps, and the tsc project checks).
# -----------------------------------------------------------------------------
FROM deps AS build
# Manifests + shared config first so pnpm can wire the workspace graph and honor
# .npmrc / allowBuilds (esbuild, sharp) exactly like a local install.
COPY pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json turbo.json .npmrc ./
COPY apps ./apps
COPY packages ./packages
COPY services ./services
COPY workers ./workers
RUN pnpm install --frozen-lockfile --offline
RUN pnpm run build

# -----------------------------------------------------------------------------
# runtime — slim image with the built workspace and an unprivileged user. No
# .env, secrets, certs, or infra config are ever copied in; they are injected at
# run time via compose `environment:` and mounts.
# -----------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV="production"

# The official node image already ships an unprivileged `node` user (uid 1000).
# Copy the built workspace with that ownership and drop root before running.
COPY --from=build --chown=node:node /app /app
USER node

# Default entrypoint targets the API; compose overrides `command:` per service.
CMD ["pnpm", "--filter", "@chai/api", "start"]

# Meaningful API healthcheck: probes the app's real /health endpoint rather than
# merely checking the process is alive. busybox wget ships in the alpine base.
# Compose overrides this for non-HTTP services.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
