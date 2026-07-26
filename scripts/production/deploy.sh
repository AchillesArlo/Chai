#!/usr/bin/env bash
# =============================================================================
# Chai Production Deployment Script
# =============================================================================
#
# Blue-green deployment strategy with database migrations and rollback support.
#
# Prerequisites:
#   - Docker & Docker Compose v2+
#   - Access to container registry (authenticated)
#   - .env file populated from .env.example
#   - Database backup strategy in place
#
# Usage:
#   ./scripts/production/deploy.sh [options]
#
# Options:
#   --tag <tag>         Image tag (default: git short SHA)
#   --skip-build        Skip Docker build step
#   --skip-push         Skip registry push step
#   --skip-migrate      Skip database migrations
#   --rollback          Rollback to previous version
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
COMPOSE_FILE="${PROJECT_ROOT}/infra/production/docker-compose.yml"

IMAGE_TAG="${IMAGE_TAG:-$(git -C "${PROJECT_ROOT}" rev-parse --short HEAD 2>/dev/null || echo 'latest')}"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-ghcr.io/chai-platform}"
SKIP_BUILD=false
SKIP_PUSH=false
SKIP_MIGRATE=false
ROLLBACK=false
DRY_RUN=false

# Blue-green deployment state
CURRENT_ENV="blue"
NEXT_ENV="green"
STATE_FILE="${PROJECT_ROOT}/.deployment-state"

# Services to deploy
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

save_state() {
  local tag="$1"
  local env="$2"
  local timestamp
  timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  
  if [ "${DRY_RUN}" = false ]; then
    cat > "${STATE_FILE}" <<EOF
TAG=${tag}
ENV=${env}
TIMESTAMP=${timestamp}
EOF
    log "State saved: tag=${tag}, env=${env}, time=${timestamp}"
  fi
}

load_state() {
  if [ -f "${STATE_FILE}" ]; then
    # shellcheck source=/dev/null
    source "${STATE_FILE}"
    log "Previous state loaded: tag=${TAG:-unknown}, env=${ENV:-unknown}"
  else
    warn "No previous deployment state found"
    TAG="unknown"
    ENV="unknown"
  fi
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)         IMAGE_TAG="$2"; shift 2 ;;
    --skip-build)  SKIP_BUILD=true; shift ;;
    --skip-push)   SKIP_PUSH=true; shift ;;
    --skip-migrate) SKIP_MIGRATE=true; shift ;;
    --rollback)    ROLLBACK=true; shift ;;
    --dry-run)     DRY_RUN=true; shift ;;
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

if [ ! -f "${PROJECT_ROOT}/infra/production/.env" ]; then
  error "Production .env file not found. Cannot proceed without configuration."
fi

log "Image tag: ${IMAGE_TAG}"
log "Registry: ${DOCKER_REGISTRY}"
log "Rollback mode: ${ROLLBACK}"

# ---------------------------------------------------------------------------
# Rollback procedure
# ---------------------------------------------------------------------------
if [ "${ROLLBACK}" = true ]; then
  log "=== ROLLBACK PROCEDURE ==="
  load_state
  
  if [ "${TAG:-unknown}" = "unknown" ]; then
    error "No previous deployment state found. Cannot rollback."
  fi
  
  log "Rolling back to tag: ${TAG}"
  
  # Update IMAGE_TAG to previous version
  IMAGE_TAG="${TAG}"
  
  # Pull previous images
  for svc in "${SERVICES[@]}"; do
    run "docker pull ${DOCKER_REGISTRY}/${svc}:${IMAGE_TAG}"
  done
  
  # Redeploy with previous tag
  run "docker compose -f '${COMPOSE_FILE}' down"
  run "IMAGE_TAG=${IMAGE_TAG} docker compose -f '${COMPOSE_FILE}' up -d"
  
  log "Waiting for services to stabilize..."
  sleep 30
  
  # Health check
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost/health" 2>/dev/null || echo "000")
  if [ "${STATUS}" = "200" ]; then
    log "✓ Rollback completed successfully"
    save_state "${IMAGE_TAG}" "rollback"
    exit 0
  else
    error "✗ Rollback failed - services not healthy"
  fi
fi

# ---------------------------------------------------------------------------
# Step 1: Build packages
# ---------------------------------------------------------------------------
if [ "${SKIP_BUILD}" = false ]; then
  log "=== Step 1/6: Building packages ==="
  run "cd '${PROJECT_ROOT}' && pnpm install --frozen-lockfile"
  run "cd '${PROJECT_ROOT}' && pnpm turbo build"
else
  log "=== Step 1/6: Skipping build (--skip-build) ==="
fi

# ---------------------------------------------------------------------------
# Step 2: Build & Tag Docker images
# ---------------------------------------------------------------------------
if [ "${SKIP_BUILD}" = false ]; then
  log "=== Step 2/6: Building Docker images ==="
  run "docker compose -f '${COMPOSE_FILE}' build"
  
  log "Tagging images with ${IMAGE_TAG}"
  for svc in "${SERVICES[@]}"; do
    run "docker tag chai-${svc}:latest ${DOCKER_REGISTRY}/${svc}:${IMAGE_TAG}"
    run "docker tag chai-${svc}:latest ${DOCKER_REGISTRY}/${svc}:production-latest"
  done
else
  log "=== Step 2/6: Skipping Docker build (--skip-build) ==="
fi

# ---------------------------------------------------------------------------
# Step 3: Push to registry
# ---------------------------------------------------------------------------
if [ "${SKIP_PUSH}" = false ]; then
  log "=== Step 3/6: Pushing images to registry ==="
  for svc in "${SERVICES[@]}"; do
    run "docker push ${DOCKER_REGISTRY}/${svc}:${IMAGE_TAG}"
    run "docker push ${DOCKER_REGISTRY}/${svc}:production-latest"
  done
else
  log "=== Step 3/6: Skipping push (--skip-push) ==="
fi

# ---------------------------------------------------------------------------
# Step 4: Database migrations
# ---------------------------------------------------------------------------
if [ "${SKIP_MIGRATE}" = false ]; then
  log "=== Step 4/6: Running database migrations ==="
  log "Creating database backup before migration..."
  
  # Backup database
  BACKUP_FILE="/tmp/chai-backup-$(date +%Y%m%d-%H%M%S).sql"
  run "docker compose -f '${COMPOSE_FILE}' exec -T postgres pg_dump -U ${POSTGRES_USER:-chai_admin} ${POSTGRES_DB:-chai} > '${BACKUP_FILE}'"
  log "Backup created: ${BACKUP_FILE}"
  
  # Run migrations
  log "Executing migrations..."
  run "docker compose -f '${COMPOSE_FILE}' exec -T api pnpm --filter @chai/api db:migrate:prod"
  
  log "✓ Database migrations completed"
else
  log "=== Step 4/6: Skipping migrations (--skip-migrate) ==="
fi

# ---------------------------------------------------------------------------
# Step 5: Deploy to production (rolling update)
# ---------------------------------------------------------------------------
log "=== Step 5/6: Deploying to production ==="

# Pull new images
run "docker compose -f '${COMPOSE_FILE}' pull"

# Rolling restart of services
log "Performing rolling restart..."

# Restart API services first (most critical)
log "Restarting API services..."
run "docker compose -f '${COMPOSE_FILE}' up -d --no-deps --scale api=5 api"
sleep 20

# Restart realtime gateway
log "Restarting realtime gateway..."
run "docker compose -f '${COMPOSE_FILE}' up -d --no-deps --scale realtime-gateway=3 realtime-gateway"
sleep 10

# Restart workers
log "Restarting workers..."
for worker in channel-worker automation-worker payment-worker logistics-worker analytics-worker inbox-dispatcher outbox-dispatcher media-worker; do
  log "  Restarting ${worker}..."
  run "docker compose -f '${COMPOSE_FILE}' up -d --no-deps ${worker}"
  sleep 5
done

# Restart frontend services
log "Restarting frontend services..."
run "docker compose -f '${COMPOSE_FILE}' up -d --no-deps --scale owner-console=3 owner-console"
run "docker compose -f '${COMPOSE_FILE}' up -d --no-deps --scale client-portal=3 client-portal"
sleep 10

# Restart nginx last
log "Restarting nginx..."
run "docker compose -f '${COMPOSE_FILE}' up -d --no-deps --scale nginx=3 nginx"

# ---------------------------------------------------------------------------
# Step 6: Health verification
# ---------------------------------------------------------------------------
log "=== Step 6/6: Health verification ==="

HEALTH_ENDPOINTS=(
  "http://localhost/health"
  "http://localhost/api/health"
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

# Check individual services
log "Checking service health..."
UNHEALTHY=$(docker compose -f "${COMPOSE_FILE}" ps --format json 2>/dev/null | grep -c '"unhealthy"\|"starting"' || true)
if [ "${UNHEALTHY}" -gt 0 ]; then
  warn "${UNHEALTHY} service(s) not healthy"
  ALL_HEALTHY=false
fi

# ---------------------------------------------------------------------------
# Save deployment state
# ---------------------------------------------------------------------------
if [ "${ALL_HEALTHY}" = true ]; then
  save_state "${IMAGE_TAG}" "production"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
log "=== Deployment Summary ==="
log "Environment: production"
log "Image tag:   ${IMAGE_TAG}"
log "Healthy:     ${ALL_HEALTHY}"
log "Timestamp:   $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
log "Backup:      ${BACKUP_FILE:-skipped}"

if [ "${ALL_HEALTHY}" = true ]; then
  log "✓ Production deployment completed successfully"
  log ""
  log "To rollback if needed:"
  log "  ./scripts/production/deploy.sh --rollback"
  exit 0
else
  warn "✗ Some health checks failed"
  warn "Review logs: docker compose -f ${COMPOSE_FILE} logs"
  warn "To rollback:"
  warn "  ./scripts/production/deploy.sh --rollback"
  exit 1
fi
