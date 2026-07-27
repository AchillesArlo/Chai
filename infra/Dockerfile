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
# COREPACK_HOME must live on a world-readable path (not root's $HOME): the
# prepare below runs as root, but the runtime stage drops to USER node and every
# service's CMD is `pnpm …`. Without a shared cache the node user re-downloads
# pnpm from the npm registry on every container start — which fails outright in
# a network-restricted production (and is a needless supply-chain hit even when
# egress exists). Pinning it under /pnpm keeps the prepared pnpm readable by all.
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    COREPACK_HOME="/pnpm/corepack" \
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

# esbuild's allowed postinstall (pnpm-workspace.yaml `allowBuilds: esbuild`)
# rewrites its own bin/esbuild from a JS launcher into the native platform
# binary for speed. But pnpm links CLI bins as cmd-shim wrappers generated while
# bin/esbuild was still JS, so they hardcode `exec node <bin>` — and running the
# native ELF through node throws "SyntaxError: Invalid or unexpected token"
# (pnpm/pnpm#5072). apps/api is the ONLY package that shells out to the esbuild
# CLI; the Next.js/vite tasks call esbuild's JS API and resolve the platform
# binary directly, so they are unaffected. Repoint the one stale shim at the
# real binary so the OS execs it directly (and still honors the file's shebang
# if the build is ever disabled and bin/esbuild stays a JS launcher). The
# --version probe fails the layer loudly if the symlink is ever wrong.
# ponytail: targeted repair of the single CLI consumer. Ceiling: if another
# workspace package starts invoking the esbuild CLI, repoint its shim here too
# (or drop esbuild from allowBuilds so bin/esbuild stays a pnpm-runnable JS launcher).
RUN ESB="$(cd apps/api && node -p "require('node:path').join(require('node:path').dirname(require.resolve('esbuild/package.json')),'bin','esbuild')")" \
 && ln -sf "$ESB" apps/api/node_modules/.bin/esbuild \
 && apps/api/node_modules/.bin/esbuild --version >/dev/null

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

# Meaningful API healthcheck: probes the app's real /api/v1/health endpoint rather
# than merely checking the process is alive. busybox wget ships in the alpine base.
# 127.0.0.1 (not localhost): Fastify binds IPv4 0.0.0.0, but wget resolves
# "localhost" to ::1 first on this base image, which the app is not listening on.
# Compose overrides this for non-HTTP services.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/v1/health || exit 1
