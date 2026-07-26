#!/usr/bin/env bash
# =============================================================================
# Chai Staging Deployment Script
# =============================================================================
#
# Builds, tags, pushes Docker images and deploys to the staging environment.
#
# Prerequisites:
#   - Docker & Docker Compose v2+
#   - Access to container registry (authenticated)
#   - .env file populated from .env.example
#
# Usage:
#   ./scripts/staging/deploy.sh [options]
#
# Options:
#   --tag <tag>         Image tag (default: git short SHA)
#   --skip-build        Skip Docker build step (use existing images)
#   --skip-push         Skip registry push step
#   --seed              Run test data seeding after deployment
#   --dry-run           Show what would be done without executing
#   --help              Show this help message
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/infra/staging/docker-compose.yml"

# Defaults
IMAGE_TAG="${IMAGE_TAG:-$(git -C "${PROJECT_ROOT}" rev-parse --short HEAD 2>/dev/null || echo 'latest')}"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-ghcr.io/chai-platform}"
SKIP_BUILD=false
SKIP_PUSH=false
SEED_DATA=false
DRY_RUN=false

# Services to build
SERVICES=(
  "api"
  "realtime-gateway"
  "owner-console"
  "client-portal"
  "channel-worker"
  "automation-worker"
  "payment-worker"
  "logistics-worker"
  "analytics-worker"
  "inbox-dispatcher"
  "outbox-dispatcher"
  "media-worker"
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
warn() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $*" >&2; }
error() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2; exit 1; }

run() {
  if [ "${DRY_RUN}" = true ]; then
    log "[DRY-RUN] $*"
  else
    log "$*"
    eval "$@"
  fi
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)       IMAGE_TAG="$2"; shift 2 ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    --skip-push)  SKIP_PUSH=true; shift ;;
    --seed)       SEED_DATA=true; shift ;;
    --dry-run)    DRY_RUN=true; shift ;;
    --help)
      sed -n '3,/^# ====/p' "$0" | head -n -1 | sed 's/^# \?//'
      exit 0
      ;;
    *) error "Unknown option: $1" ;;
  esac
done

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
log "=== Pre-flight Checks ==="

command -v docker >/dev/null 2>&1 || error "Docker is not installed"
docker compose version >/dev/null 2>&1 || error "Docker Compose v2 is not installed"

if [ ! -f "${PROJECT_ROOT}/infra/staging/.env" ]; then
  warn ".env file not found in infra/staging/"
  warn "Copying from .env.example — please update with real values"
  if [ "${DRY_RUN}" = false ]; then
    cp "${PROJECT_ROOT}/infra/staging/.env.example" "${PROJECT_ROOT}/infra/staging/.env"
  fi
fi

log "Image tag: ${IMAGE_TAG}"
log "Registry: ${DOCKER_REGISTRY}"
log "Services: ${SERVICES[*]}"

# ---------------------------------------------------------------------------
# Step 1: Build packages
# ---------------------------------------------------------------------------
if [ "${SKIP_BUILD}" = false ]; then
  log "=== Step 1/5: Building packages ==="
  run "cd '${PROJECT_ROOT}' && pnpm install --frozen-lockfile"
  run "cd '${PROJECT_ROOT}' && pnpm turbo build"
else
  log "=== Step 1/5: Skipping build (--skip-build) ==="
fi

# ---------------------------------------------------------------------------
# Step 2: Build & Tag Docker images
# ---------------------------------------------------------------------------
if [ "${SKIP_BUILD}" = false ]; then
  log "=== Step 2/5: Building Docker images ==="
  run "docker compose -f '${COMPOSE_FILE}' build"

  log "Tagging images with ${IMAGE_TAG}"
  for svc in "${SERVICES[@]}"; do
    run "docker tag chai-${svc}:latest ${DOCKER_REGISTRY}/${svc}:${IMAGE_TAG}"
    run "docker tag chai-${svc}:latest ${DOCKER_REGISTRY}/${svc}:staging-latest"
  done
else
  log "=== Step 2/5: Skipping Docker build (--skip-build) ==="
fi

# ---------------------------------------------------------------------------
# Step 3: Push to registry
# ---------------------------------------------------------------------------
if [ "${SKIP_PUSH}" = false ]; then
  log "=== Step 3/5: Pushing images to registry ==="
  for svc in "${SERVICES[@]}"; do
    run "docker push ${DOCKER_REGISTRY}/${svc}:${IMAGE_TAG}"
    run "docker push ${DOCKER_REGISTRY}/${svc}:staging-latest"
  done
else
  log "=== Step 3/5: Skipping push (--skip-push) ==="
fi

# ---------------------------------------------------------------------------
# Step 4: Deploy to staging
# ---------------------------------------------------------------------------
log "=== Step 4/5: Deploying to staging ==="

run "docker compose -f '${COMPOSE_FILE}' pull || true"
run "docker compose -f '${COMPOSE_FILE}' up -d --remove-orphans"

# Wait for services to become healthy
log "Waiting for services to become healthy..."
TIMEOUT=300
ELAPSED=0
INTERVAL=10

while [ ${ELAPSED} -lt ${TIMEOUT} ]; do
  UNHEALTHY=$(docker compose -f "${COMPOSE_FILE}" ps --format json 2>/dev/null | grep -c '"unhealthy"\|"starting"' || true)
  if [ "${UNHEALTHY}" -eq 0 ]; then
    log "All services are healthy!"
    break
  fi
  log "  ${UNHEALTHY} service(s) still starting... (${ELAPSED}s/${TIMEOUT}s)"
  sleep ${INTERVAL}
  ELAPSED=$((ELAPSED + INTERVAL))
done

if [ ${ELAPSED} -ge ${TIMEOUT} ]; then
  warn "Timeout waiting for services to become healthy"
  warn "Check logs with: docker compose -f ${COMPOSE_FILE} logs"
fi

# ---------------------------------------------------------------------------
# Step 5: Health checks
# ---------------------------------------------------------------------------
log "=== Step 5/5: Running health checks ==="

HEALTH_ENDPOINTS=(
  "http://localhost/api/health"
  "http://localhost/health"
)

ALL_HEALTHY=true
for endpoint in "${HEALTH_ENDPOINTS[@]}"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${endpoint}" 2>/dev/null || echo "000")
  if [ "${STATUS}" = "200" ]; then
    log "  ✓ ${endpoint} — HTTP ${STATUS}"
  else
    warn "  ✗ ${endpoint} — HTTP ${STATUS}"
    ALL_HEALTHY=false
  fi
done

# ---------------------------------------------------------------------------
# Optional: Seed test data
# ---------------------------------------------------------------------------
if [ "${SEED_DATA}" = true ]; then
  log "=== Seeding test data ==="
  run "docker compose -f '${COMPOSE_FILE}' exec -T api pnpm --filter @chai/api db:seed:staging"
  log "Test data seeded successfully"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
log "=== Deployment Summary ==="
log "Environment: staging"
log "Image tag:   ${IMAGE_TAG}"
log "Healthy:     ${ALL_HEALTHY}"
log "Timestamp:   $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

if [ "${ALL_HEALTHY}" = true ]; then
  log "✓ Staging deployment completed successfully"
  exit 0
else
  warn "✗ Some health checks failed — review logs before proceeding"
  exit 1
fi
